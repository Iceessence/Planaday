import { useViewFormGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useRef, useState } from 'react';
import { Package, Plus, ScanBarcode, Snowflake, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { canonicalizeIngredientName, computeLotFreshness } from '../../core/kitchenActions';
import { addDaysIso } from '../../core/temporal';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import type { LifeRecord, PantryLotPayload } from '../../core/types';

const DEFAULT_ZONES = ['Fridge', 'Freezer', 'Dry Pantry', 'Spice Rack', 'Countertop', 'Unassigned'];

export const PantryView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));
  const [zoneFilter, setZoneFilter] = useState('All');
  const [pantrySearch, setPantrySearch] = useState('');
  const [freshFilter, setFreshFilter] = useState<'all' | 'expiring' | 'low_stock'>('all');
  const [pantrySortBy, setPantrySortBy] = useState<'expiry' | 'name' | 'qty' | 'zone'>('expiry');
  const [pantrySortDir, setPantrySortDir] = useState<'asc' | 'desc'>('asc');
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('cup');
  const [zone, setZone] = useState('Fridge');
  const [shelfBin, setShelfBin] = useState('');
  const [parLevel, setParLevel] = useState(0);
  const [bestByDate, setBestByDate] = useState(addDaysIso(logicalToday, 14));
  const [barcode, setBarcode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');

  const customZones = useMemo(
    () => records.filter((r) => r.type === 'pantry_zone'),
    [records]
  );
  const allZones = useMemo(
    () => Array.from(new Set([...DEFAULT_ZONES, ...customZones.map((z) => z.title)])),
    [customZones]
  );

  const lots = useMemo(
    () => records.filter((r) => r.type === 'pantry_lot') as Array<LifeRecord<PantryLotPayload>>,
    [records]
  );

  const freshnessById = useMemo(() => new Map(lots.map(l => [l.id, computeLotFreshness(l.payload, logicalToday)])), [lots, logicalToday]);
  const visibleLots = useMemo(() => {
    const q = pantrySearch.trim().toLowerCase();
    const list = lots.filter((l) => {
      if (zoneFilter !== 'All' && l.payload.zone !== zoneFilter) return false;
      const fr = freshnessById.get(l.id)!;
      if (freshFilter === 'expiring' && fr.status !== 'Use Soon' && fr.status !== 'Expires Today' && fr.status !== 'Expired') return false;
      if (freshFilter === 'low_stock' && !(l.payload.parLevel && l.payload.quantity <= l.payload.parLevel)) return false;
      if (q) {
        const hay = `${l.title} ${l.payload.zone} ${l.payload.shelfBin ?? ''} ${l.payload.barcode ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = pantrySortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (pantrySortBy === 'name') return a.title.localeCompare(b.title) * dir;
      if (pantrySortBy === 'qty') return ((a.payload.quantity || 0) - (b.payload.quantity || 0)) * dir;
      if (pantrySortBy === 'zone') return (a.payload.zone || '').localeCompare(b.payload.zone || '') * dir;
      return (a.payload.bestByDate || '9999-12-31').localeCompare(b.payload.bestByDate || '9999-12-31') * dir;
    });
  }, [lots, zoneFilter, pantrySearch, freshFilter, freshnessById, pantrySortBy, pantrySortDir]);

  const barcodeRequest = useRef(0);
  const barcodeValue = useRef(barcode);
  barcodeValue.current = barcode;
  const handleBarcodeLookup = async () => {
    if (!barcode.trim()) return;
    const request = ++barcodeRequest.current;
    const query = barcode.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const base = settings.syncServerUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/proxy/barcode/${encodeURIComponent(query)}`, { signal: controller.signal, headers: settings.syncAuthToken ? { Authorization: `Bearer ${settings.syncAuthToken}` } : {} });
      if (!res.ok) throw new Error(`Barcode lookup failed (${res.status})`);
      const data = (await res.json()) as { found?: boolean; name?: string };
      if (request !== barcodeRequest.current || query !== barcodeValue.current.trim()) return;
      if (data.found && data.name) {
        setName(data.name);
        pushToast(`Barcode matched: ${data.name}`);
      } else {
        pushToast('Barcode not found online — enter ingredient name manually.');
      }
    } catch {
      if (request === barcodeRequest.current) pushToast('Barcode lookup unavailable; type ingredient name manually.');
    } finally { window.clearTimeout(timer); }
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <Package size={20} style={{ verticalAlign: '-3px' }} /> Lot-Based Pantry, Fridge & Freezer Inventory
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Multiple batches/lots per ingredient · Freshness badges · Fast +/− steppers · Freeze/Thaw & Waste log
          </p>
        </div>
      </div>

      {/* Add Lot Form */}
      <form
        className="dp-card dp-stack"
        style={{ padding: 12 }}
        onSubmit={guardForm('form-1', async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(parLevel) || parLevel < 0) { pushToast('Enter valid nonnegative quantities.', { tone: 'warn' }); return; }
          await createRecord<PantryLotPayload>(
            'pantry_lot',
            name.trim(),
            {
              ingredientName: name.trim(),
              canonicalName: canonicalizeIngredientName(name),
              quantity: qty,
              unit: unit.trim() || 'item',
              zone,
              shelfBin: shelfBin.trim() || undefined,
              parLevel: parLevel > 0 ? parLevel : undefined,
              purchaseDate: logicalToday,
              bestByDate: bestByDate || undefined,
              barcode: barcode.trim() || undefined,
            },
            { category: zone }
          );
          setName('');
          setBarcode('');
          setShelfBin('');
          pushToast('Added pantry lot', { canUndo: true });
        })}
      >
        <div className="dp-row">
          <input className="dp-input" style={{ flex: 2 }} placeholder="Ingredient / food item…" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="dp-row" style={{ gap: 4 }}>
            <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Qty:</span>
            <input type="number" step={0.25} min={0} className="dp-input" style={{ width: 72 }} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </label>
          <input list="dp-kitchen-units" className="dp-input" style={{ width: 92 }} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit…" aria-label="Unit" />
          <datalist id="dp-kitchen-units">
            {['item', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'L', 'can', 'box', 'bag', 'bunch', 'pack', 'bottle'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <input list="dp-pantry-zones" aria-label="Storage zone" className="dp-input" style={{ width: 130 }} value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Zone…" />
          <datalist id="dp-pantry-zones">
            {allZones.map((z) => <option key={z} value={z} />)}
          </datalist>
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={14} /> Add Lot
          </button>
        </div>
        <details className="dp-details">
          <summary>More options (Expiry / Best-By Date, Shelf/Bin, Par Level, Barcode Scan)</summary>
          <div className="dp-row" style={{ marginTop: 10 }}>
            <label className="dp-row">
              <span className="dp-muted">Best-By:</span>
              <input type="date" className="dp-input" style={{ width: 'auto' }} value={bestByDate} onChange={(e) => setBestByDate(e.target.value)} />
            </label>
            <input className="dp-input" style={{ width: 150 }} placeholder="Shelf / Bin #…" value={shelfBin} onChange={(e) => setShelfBin(e.target.value)} />
            <label className="dp-row">
              <span className="dp-muted">Par Level:</span>
              <input type="number" min={0} className="dp-input" style={{ width: 68 }} value={parLevel} onChange={(e) => setParLevel(Number(e.target.value) || 0)} />
            </label>
            <input className="dp-input" style={{ width: 150 }} placeholder="Barcode…" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleBarcodeLookup()}>
              <ScanBarcode size={14} /> Lookup
            </button>
          </div>
        </details>
      </form>

      {/* Storage Zones Filter + Custom Zone Creator (with safe delete cascade to "Unassigned") */}
      <div className="dp-row" style={{ gap: 6 }}>
        {['All', ...allZones].map((z) => (
          <button key={z} type="button" className={`dp-btn dp-btn-sm ${zoneFilter === z ? 'dp-btn-primary' : ''}`} onClick={() => setZoneFilter(z)}>
            {z} ({z === 'All' ? lots.length : lots.filter((l) => l.payload.zone === z).length})
          </button>
        ))}
        <input
          className="dp-input"
          style={{ width: 150, padding: '3px 8px', fontSize: '0.8rem' }}
          placeholder="+ Custom zone…"
          value={newZoneName}
          onChange={(e) => setNewZoneName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && newZoneName.trim()) {
              await createRecord('pantry_zone', newZoneName.trim(), {});
              setNewZoneName('');
              pushToast('Created custom storage zone');
            }
          }}
        />
      </div>

      {/* Easy Sort & Filter Bar for Pantry */}
      <SortFilterBar
        search={pantrySearch}
        onSearchChange={setPantrySearch}
        searchPlaceholder="Search ingredients, shelves, barcodes…"
        sortBy={pantrySortBy}
        onSortByChange={(v) => setPantrySortBy(v as typeof pantrySortBy)}
        sortOptions={[
          { value: 'expiry', label: 'Best-By / Expiry' },
          { value: 'name', label: 'Name (A–Z)' },
          { value: 'qty', label: 'Quantity' },
          { value: 'zone', label: 'Storage Zone' },
        ]}
        sortDir={pantrySortDir}
        onSortDirToggle={() => setPantrySortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={[
          { value: 'all', label: 'All Lots' },
          { value: 'expiring', label: '⚠️ Use Soon / Expired' },
          { value: 'low_stock', label: '📉 Below Par Level' },
        ]}
        activeChip={freshFilter}
        onChipChange={(v) => setFreshFilter(v as typeof freshFilter)}
        totalCount={lots.length}
        shownCount={visibleLots.length}
        onReset={() => {
          setPantrySearch('');
          setFreshFilter('all');
          setZoneFilter('All');
        }}
      />

      {/* Pantry Lots Grid */}
      <div className="dp-stack">
        {visibleLots.map((lot) => {
          const fresh = freshnessById.get(lot.id)!;
          const badgeColor =
            fresh.status === 'Expired'
              ? 'var(--dp-danger)'
              : fresh.status === 'Expires Today' || fresh.status === 'Use Soon'
                ? 'var(--dp-warn)'
                : 'var(--dp-ok)';
          return (
            <div key={lot.id} className="dp-card dp-between" style={{ padding: 12 }}>
              <div>
                <strong>
                  {lot.payload.isLeftover ? '🍱 ' : ''}
                  {lot.payload.ingredientName}
                </strong>
                <div className="dp-row" style={{ marginTop: 4 }}>
                  <span className="dp-pill" style={{ borderColor: badgeColor, color: badgeColor }}>
                    {fresh.status}
                    {fresh.daysLeft !== null ? ` (${fresh.daysLeft}d)` : ''}
                  </span>
                  <span className="dp-pill">{lot.payload.zone}{lot.payload.shelfBin ? ` · ${lot.payload.shelfBin}` : ''}</span>
                  {lot.payload.parLevel ? <span className="dp-pill">Par: {lot.payload.parLevel}</span> : null}
                  {lot.payload.reservedQty ? <span className="dp-pill">Reserved: {lot.payload.reservedQty}</span> : null}
                </div>
              </div>
              <div className="dp-row">
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() =>
                    void updateRecord<PantryLotPayload>(lot.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, quantity: Math.max(0, Number((c.payload.quantity - 1).toFixed(2))) },
                    }))
                  }
                >
                  −
                </button>
                <strong style={{ minWidth: 68, textAlign: 'center' }}>
                  {lot.payload.quantity} {lot.payload.unit}
                </strong>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() =>
                    void updateRecord<PantryLotPayload>(lot.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, quantity: Number((c.payload.quantity + 1).toFixed(2)) },
                    }))
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  title="Freeze or Thaw lot"
                  onClick={() => {
                    const isFrozen = lot.payload.zone === 'Freezer';
                    void updateRecord<PantryLotPayload>(lot.id, (c) => ({
                      ...c,
                      payload: {
                        ...c.payload,
                        zone: isFrozen ? 'Fridge' : 'Freezer',
                        freezeDate: isFrozen ? c.payload.freezeDate : logicalToday,
                        thawDate: isFrozen ? logicalToday : c.payload.thawDate,
                        eatByDate: isFrozen ? addDaysIso(logicalToday, 3) : addDaysIso(logicalToday, 90),
                      },
                    }));
                    pushToast(isFrozen ? `Thawed "${lot.payload.ingredientName}" → Fridge` : `Froze "${lot.payload.ingredientName}" → Freezer`);
                  }}
                >
                  <Snowflake size={13} /> {lot.payload.zone === 'Freezer' ? 'Thaw' : 'Freeze'}
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    void updateRecord<PantryLotPayload>(lot.id, (c) => ({
                      ...c,
                      payload: {
                        ...c.payload,
                        quantity: 0,
                        wasteLog: [...(c.payload.wasteLog ?? []), { date: logicalToday, qty: c.payload.quantity, reason: 'Spoiled/Wasted' }],
                      },
                    }));
                    pushToast(`Logged waste for "${lot.payload.ingredientName}"`, { canUndo: true });
                  }}
                >
                  Spoiled
                </button>
                <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(lot.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
