import React, { useMemo, useState } from 'react';
import { Package, Plus, ScanBarcode, Snowflake, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { canonicalizeIngredientName, computeLotFreshness } from '../../core/kitchenActions';
import { addDaysIso } from '../../core/temporal';
import type { LifeRecord, PantryLotPayload } from '../../core/types';

const DEFAULT_ZONES = ['Fridge', 'Freezer', 'Dry Pantry', 'Spice Rack', 'Countertop', 'Unassigned'];

export const PantryView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const [zoneFilter, setZoneFilter] = useState('All');
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

  const visibleLots = useMemo(
    () => (zoneFilter === 'All' ? lots : lots.filter((l) => l.payload.zone === zoneFilter)),
    [lots, zoneFilter]
  );

  const handleBarcodeLookup = async () => {
    if (!barcode.trim()) return;
    try {
      const base = settings.syncServerUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/proxy/barcode/${encodeURIComponent(barcode.trim())}`);
      const data = (await res.json()) as { found?: boolean; name?: string };
      if (data.found && data.name) {
        setName(data.name);
        pushToast(`Barcode matched: ${data.name}`);
      } else {
        pushToast('Barcode not found online — enter ingredient name manually.');
      }
    } catch {
      pushToast('Offline mode — barcode stored locally; type ingredient name manually.');
    }
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
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
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
        }}
      >
        <div className="dp-row">
          <input className="dp-input" style={{ flex: 2 }} placeholder="Ingredient / food item…" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" step={0.25} min={0} className="dp-input" style={{ width: 76 }} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          <input className="dp-input" style={{ width: 84 }} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" />
          <select aria-label="Storage zone" className="dp-select" style={{ width: 'auto' }} value={zone} onChange={(e) => setZone(e.target.value)}>
            {allZones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
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

      {/* Pantry Lots Grid */}
      <div className="dp-stack">
        {visibleLots.map((lot) => {
          const fresh = computeLotFreshness(lot.payload, logicalToday);
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
