import React, { useMemo, useState } from 'react';
import {
  Code,
  Compass,
  Gamepad2,
  Package,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import type { LifeRecord } from '../../core/types';

type GameTab = 'gdd' | 'systems' | 'characters' | 'skills' | 'items' | 'world' | 'logic' | 'balance' | 'progress';

interface GameProjectPayload {
  version: string;
  engine: string;
  genre: string;
  gdd: string;
  coreLoop: string;
  balancing: { baseXp: number; growthRate: number; maxLevel: number; baseHp: number; hpPerLvl: number };
  devItems: Array<{ id: string; kind: 'feature' | 'bug' | 'asset' | 'release'; title: string; status: 'todo' | 'wip' | 'done'; priority: string }>;
}

interface GameEntityPayload {
  gameId: string;
  kind: 'system' | 'character' | 'enemy' | 'boss' | 'faction' | 'skill' | 'item' | 'world' | 'logic';
  subtitle?: string;
  statPrimary?: number; // e.g., HP, Damage, Value, Tier
  statSecondary?: number; // e.g., Cost, Cooldown, Level
  prerequisite?: string; // for skill tree
  rarity?: string;
  details: string;
}

export const GameDevView: React.FC = () => {
  const { records, pushToast } = useApp();
  const games = useMemo(
    () => records.filter((r) => r.type === 'game_project' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );
  const allEntities = useMemo(
    () => records.filter((r) => r.type === 'game_entity' && !r.deletedAt),
    [records]
  );

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const activeGame: LifeRecord | null = useMemo(
    () => games.find((g) => g.id === selectedGameId) ?? games[0] ?? null,
    [games, selectedGameId]
  );
  const gPayload = activeGame?.payload as GameProjectPayload | undefined;

  const [tab, setTab] = useState<GameTab>('gdd');
  const [newGameTitle, setNewGameTitle] = useState('');
  const [entityName, setEntityName] = useState('');
  const [entityKind, setEntityKind] = useState<GameEntityPayload['kind']>('character');
  const [entitySub, setEntitySub] = useState('');
  const [entityStat1, setEntityStat1] = useState(100);
  const [entityStat2, setEntityStat2] = useState(10);
  const [entityPrereq, setEntityPrereq] = useState('');
  const [entityDetails, setEntityDetails] = useState('');
  const [devTitle, setDevTitle] = useState('');
  const [devKind, setDevKind] = useState<'feature' | 'bug' | 'asset' | 'release'>('feature');

  const gameEntities = useMemo(
    () => allEntities.filter((e) => (e.payload as GameEntityPayload).gameId === activeGame?.id),
    [allEntities, activeGame?.id]
  );

  const mutateGame = async (updater: (p: GameProjectPayload) => GameProjectPayload) => {
    if (!activeGame) return;
    await updateRecord<GameProjectPayload>(activeGame.id, (cur) => ({ ...cur, payload: updater(cur.payload) }));
  };

  const addEntity = async (kind: GameEntityPayload['kind']) => {
    if (!activeGame) return;
    const title = entityName.trim() || `New ${kind}`;
    await createRecord<GameEntityPayload>('game_entity', title, {
      gameId: activeGame.id,
      kind,
      subtitle: entitySub,
      statPrimary: entityStat1,
      statSecondary: entityStat2,
      prerequisite: entityPrereq,
      details: entityDetails,
    });
    setEntityName('');
    setEntitySub('');
    setEntityPrereq('');
    setEntityDetails('');
    pushToast(`Added ${kind} "${title}"`, { tone: 'ok' });
  };

  const xpCurve = useMemo(() => {
    const b = gPayload?.balancing ?? { baseXp: 100, growthRate: 1.38, maxLevel: 15, baseHp: 120, hpPerLvl: 24 };
    const lvls = Math.max(5, Math.min(40, b.maxLevel));
    return Array.from({ length: lvls }).map((_, i) => {
      const lvl = i + 1;
      const xp = Math.round(b.baseXp * Math.pow(b.growthRate, i));
      const hp = Math.round(b.baseHp + b.hpPerLvl * i);
      return { lvl, xp, hp };
    });
  }, [gPayload?.balancing]);

  const tabEntities = (kinds: GameEntityPayload['kind'][]) =>
    gameEntities.filter((e) => kinds.includes((e.payload as GameEntityPayload).kind));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Gamepad2 size={20} /> Game Development Workspace
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            GDD & Core Loops, Systems, Characters/Enemies/Bosses, Skill Trees, Items/Crafting, Worlds/Lore, Game Logic, XP Balancing & Dev Tracker.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dp-select" value={activeGame?.id ?? ''} onChange={(e) => setSelectedGameId(e.target.value)}>
            {games.length === 0 && <option value="">No game projects</option>}
            {games.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <input className="dp-input" placeholder="New game title..." value={newGameTitle} onChange={(e) => setNewGameTitle(e.target.value)} style={{ width: 165 }} />
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={async () => {
              const title = newGameTitle.trim() || `Untitled Game ${games.length + 1}`;
              const rec = await createRecord<GameProjectPayload>('game_project', title, {
                version: '0.1.0-alpha',
                engine: 'Unreal / Godot / Unity',
                genre: 'Action RPG',
                gdd: '# High Concept\n\nDescribe player fantasy, target audience, core pillars, and unique hooks.',
                coreLoop: 'Explore → Gather / Fight → Craft & Upgrade → Unlock Deeper Biomes',
                balancing: { baseXp: 100, growthRate: 1.38, maxLevel: 15, baseHp: 120, hpPerLvl: 24 },
                devItems: [{ id: createId('dv'), kind: 'feature', title: 'Core player movement & camera', status: 'wip', priority: 'high' }],
              });
              setNewGameTitle('');
              setSelectedGameId(rec.id);
              pushToast(`Created game project "${title}"`, { tone: 'ok' });
            }}
          >
            <Plus size={14} /> New Game
          </button>
          {activeGame && (
            <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activeGame.id); setSelectedGameId(null); }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {!activeGame || !gPayload ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Enter a title above and click "+ New Game" to build your Game Design Document, Skill Trees, Items, Lore, and XP curves.</p>
        </div>
      ) : (
        <>
          <div className="dp-card" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', padding: '0.55rem' }}>
            {(
              [
                ['gdd', 'GDD & Loops', Gamepad2],
                ['systems', 'Systems', Shield],
                ['characters', 'Characters & Enemies', Users],
                ['skills', 'Skill Tree', Sparkles],
                ['items', 'Items & Loot', Package],
                ['world', 'World & Lore', Compass],
                ['logic', 'Logic & Code', Code],
                ['balance', 'XP & Balance', TrendingUp],
                ['progress', 'Dev Progress', Plus],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} type="button" className={`dp-btn ${tab === id ? 'dp-btn-primary' : ''}`} onClick={() => setTab(id)}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {tab === 'gdd' && (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem' }}>
                <label style={{ fontSize: '0.76rem' }}>Version<input className="dp-input" value={gPayload.version} onChange={(e) => void mutateGame((p) => ({ ...p, version: e.target.value }))} /></label>
                <label style={{ fontSize: '0.76rem' }}>Engine<input className="dp-input" value={gPayload.engine} onChange={(e) => void mutateGame((p) => ({ ...p, engine: e.target.value }))} /></label>
                <label style={{ fontSize: '0.76rem' }}>Genre<input className="dp-input" value={gPayload.genre} onChange={(e) => void mutateGame((p) => ({ ...p, genre: e.target.value }))} /></label>
              </div>
              <label style={{ fontSize: '0.78rem' }}>
                Core Gameplay Loop
                <input className="dp-input" value={gPayload.coreLoop} onChange={(e) => void mutateGame((p) => ({ ...p, coreLoop: e.target.value }))} />
              </label>
              <label style={{ fontSize: '0.78rem' }}>Game Design Document (GDD)</label>
              <SafeTextarea
                recordKey={`gdd:${activeGame.id}`}
                externalValue={gPayload.gdd}
                onCommit={(next) => void mutateGame((p) => ({ ...p, gdd: next }))}
                className="dp-textarea"
                rows={10}
              />
            </div>
          )}

          {(['systems', 'characters', 'skills', 'items', 'world', 'logic'] as GameTab[]).includes(tab) && (() => {
            const kindMap: Record<string, GameEntityPayload['kind'][]> = {
              systems: ['system'],
              characters: ['character', 'enemy', 'boss', 'faction'],
              skills: ['skill'],
              items: ['item'],
              world: ['world'],
              logic: ['logic'],
            };
            const allowed = kindMap[tab] ?? ['system'];
            const defaultK = allowed.includes(entityKind) ? entityKind : allowed[0];
            const list = tabEntities(allowed);
            return (
              <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {allowed.length > 1 && (
                    <select className="dp-select" value={defaultK} onChange={(e) => setEntityKind(e.target.value as GameEntityPayload['kind'])}>
                      {allowed.map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
                    </select>
                  )}
                  <input className="dp-input" placeholder="Name..." value={entityName} onChange={(e) => setEntityName(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
                  <input className="dp-input" placeholder={tab === 'skills' ? 'Type (Active/Passive)' : 'Role / Biome / Tag'} value={entitySub} onChange={(e) => setEntitySub(e.target.value)} style={{ width: 150 }} />
                  <input className="dp-input" type="number" placeholder="HP / Dmg / Value" value={entityStat1} onChange={(e) => setEntityStat1(Number(e.target.value))} style={{ width: 95 }} />
                  <input className="dp-input" type="number" placeholder="CD / Cost / Lvl" value={entityStat2} onChange={(e) => setEntityStat2(Number(e.target.value))} style={{ width: 95 }} />
                  {tab === 'skills' && (
                    <input className="dp-input" placeholder="Prerequisite skill name" value={entityPrereq} onChange={(e) => setEntityPrereq(e.target.value)} style={{ width: 165 }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input
                    className="dp-input"
                    placeholder={tab === 'logic' ? 'Pseudo-code, state machine rule, or Verse/C#/GDScript snippet...' : 'Description, stats, loot table, or lore notes...'}
                    value={entityDetails}
                    onChange={(e) => setEntityDetails(e.target.value)}
                    style={{ flex: 1, fontFamily: tab === 'logic' ? 'monospace' : 'inherit' }}
                  />
                  <button type="button" className="dp-btn dp-btn-primary" onClick={() => void addEntity(defaultK)}>
                    <Plus size={13} /> Add
                  </button>
                </div>

                {/* Visual Interactive Skill Tree SVG (§31.4) */}
                {tab === 'skills' && list.length > 0 && (
                  <svg viewBox="0 0 640 190" style={{ width: '100%', height: 190, background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)', border: '1px solid var(--dp-border)' }}>
                    {list.map((sk, idx) => {
                      const cx = 75 + (idx % 5) * 120;
                      const cy = 48 + Math.floor(idx / 5) * 76;
                      const p = sk.payload as GameEntityPayload;
                      const prereqIdx = p.prerequisite
                        ? list.findIndex((o) => o.title.toLowerCase() === p.prerequisite!.toLowerCase())
                        : -1;
                      const px = prereqIdx >= 0 ? 75 + (prereqIdx % 5) * 120 : -1;
                      const py = prereqIdx >= 0 ? 48 + Math.floor(prereqIdx / 5) * 76 : -1;
                      return (
                        <g key={sk.id}>
                          {prereqIdx >= 0 && <line x1={px} y1={py} x2={cx} y2={cy} stroke="var(--dp-accent)" strokeWidth={2} />}
                          <rect x={cx - 48} y={cy - 20} width={96} height={40} rx={8} fill="var(--dp-paper)" stroke="var(--dp-accent)" strokeWidth={1.6} />
                          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--dp-ink)">{sk.title.slice(0, 14)}</text>
                          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8.5} fill="var(--dp-ink)" opacity={0.7}>Pwr {p.statPrimary ?? 0} · CD {p.statSecondary ?? 0}s</text>
                        </g>
                      );
                    })}
                  </svg>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.5rem' }}>
                  {list.map((ent) => {
                    const ep = ent.payload as GameEntityPayload;
                    return (
                      <div key={ent.id} style={{ padding: '0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{ent.title}</strong>
                          <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(ent.id)}><Trash2 size={12} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', fontSize: '0.73rem' }}>
                          <span className="dp-badge">{ep.kind}</span>
                          {ep.subtitle && <span className="dp-badge">{ep.subtitle}</span>}
                          <span className="dp-badge">Stat1: {ep.statPrimary ?? 0}</span>
                          <span className="dp-badge">Stat2: {ep.statSecondary ?? 0}</span>
                          {ep.prerequisite && <span className="dp-badge">Req: {ep.prerequisite}</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: ep.kind === 'logic' ? 'monospace' : 'inherit' }}>{ep.details}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {tab === 'balance' && (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <h4 style={{ margin: 0 }}>XP Curve & Stat Progression Balancer (§31.8)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem' }}>
                <label style={{ fontSize: '0.75rem' }}>Base XP<input className="dp-input" type="number" value={gPayload.balancing.baseXp} onChange={(e) => void mutateGame((p) => ({ ...p, balancing: { ...p.balancing, baseXp: Number(e.target.value) } }))} /></label>
                <label style={{ fontSize: '0.75rem' }}>XP Growth Mult<input className="dp-input" type="number" step={0.05} value={gPayload.balancing.growthRate} onChange={(e) => void mutateGame((p) => ({ ...p, balancing: { ...p.balancing, growthRate: Number(e.target.value) } }))} /></label>
                <label style={{ fontSize: '0.75rem' }}>Max Level<input className="dp-input" type="number" min={5} max={40} value={gPayload.balancing.maxLevel} onChange={(e) => void mutateGame((p) => ({ ...p, balancing: { ...p.balancing, maxLevel: Number(e.target.value) } }))} /></label>
                <label style={{ fontSize: '0.75rem' }}>Base HP<input className="dp-input" type="number" value={gPayload.balancing.baseHp} onChange={(e) => void mutateGame((p) => ({ ...p, balancing: { ...p.balancing, baseHp: Number(e.target.value) } }))} /></label>
                <label style={{ fontSize: '0.75rem' }}>HP / Level<input className="dp-input" type="number" value={gPayload.balancing.hpPerLvl} onChange={(e) => void mutateGame((p) => ({ ...p, balancing: { ...p.balancing, hpPerLvl: Number(e.target.value) } }))} /></label>
              </div>
              <svg viewBox="0 0 600 180" style={{ width: '100%', height: 180, background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)' }}>
                {(() => {
                  const maxXp = Math.max(1, ...xpCurve.map((x) => x.xp));
                  const d = xpCurve
                    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${30 + (i / Math.max(1, xpCurve.length - 1)) * 540},${155 - (pt.xp / maxXp) * 130}`)
                    .join(' ');
                  return (
                    <g>
                      <path d={d} fill="none" stroke="#6b5ca5" strokeWidth={2.4} />
                      {xpCurve.map((pt, i) => (
                        <circle key={pt.lvl} cx={30 + (i / Math.max(1, xpCurve.length - 1)) * 540} cy={155 - (pt.xp / maxXp) * 130} r={3.2} fill="#6b5ca5" />
                      ))}
                    </g>
                  );
                })()}
              </svg>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(125px, 1fr))', gap: '0.35rem', fontSize: '0.78rem' }}>
                {xpCurve.map((r) => (
                  <div key={r.lvl} style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--dp-border)', borderRadius: 6 }}>
                    <strong>Lv {r.lvl}</strong> · XP {r.xp.toLocaleString()} · HP {r.hp}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'progress' && (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <select className="dp-select" value={devKind} onChange={(e) => setDevKind(e.target.value as typeof devKind)}>
                  <option value="feature">Feature</option>
                  <option value="bug">Bug</option>
                  <option value="asset">Asset</option>
                  <option value="release">Release Milestone</option>
                </select>
                <input className="dp-input" placeholder="Feature, bug, asset, or release item..." value={devTitle} onChange={(e) => setDevTitle(e.target.value)} style={{ flex: 1 }} />
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={() => {
                    if (!devTitle.trim()) return;
                    void mutateGame((p) => ({
                      ...p,
                      devItems: [{ id: createId('dv'), kind: devKind, title: devTitle.trim(), status: 'todo', priority: 'medium' }, ...(p.devItems ?? [])],
                    }));
                    setDevTitle('');
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              {(gPayload.devItems ?? []).map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}>
                  <span className="dp-badge">{item.kind}</span>
                  <span style={{ flex: 1, textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>{item.title}</span>
                  <select
                    className="dp-select"
                    value={item.status}
                    onChange={(e) =>
                      void mutateGame((p) => ({
                        ...p,
                        devItems: p.devItems.map((x) => (x.id === item.id ? { ...x, status: e.target.value as 'todo' | 'wip' | 'done' } : x)),
                      }))
                    }
                  >
                    <option value="todo">To Do</option>
                    <option value="wip">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                  <button type="button" className="dp-btn" onClick={() => void mutateGame((p) => ({ ...p, devItems: p.devItems.filter((x) => x.id !== item.id) }))}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
