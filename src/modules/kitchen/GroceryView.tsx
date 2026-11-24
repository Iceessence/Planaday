import React, { useMemo, useState } from 'react';
import { CheckCheck, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import {
  canonicalizeIngredientName,
  generateNetGroceryItems,
  inferAisle,
  reconcileFinishedShopping,
} from '../../core/kitchenActions';
import type { GroceryItemPayload, LifeRecord } from '../../core/types';

const STORES = ['All Stores', 'Local Market', 'Costco', 'Farmers Market', 'Hardware / Home'];

export const GroceryView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const [storeFilter, setStoreFilter] = useState('All Stores');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('item');
  const [newItemStore, setNewItemStore] = useState('Local Market');
  const [logExpenseOnCheckout, setLogExpenseOnCheckout] = useState(true);

  const items = useMemo(
    () =>
      (records.filter((r) => r.type === 'grocery_item' && r.status === 'active') as Array<
        LifeRecord<GroceryItemPayload>
      >).filter((i) => storeFilter === 'All Stores' || i.payload.store === storeFilter),
    [records, storeFilter]
  );

  // Group by aisle sorted alphabetically
  const groupedByAisle = useMemo(() => {
    const map = new Map<string, Array<LifeRecord<GroceryItemPayload>>>();
    for (const item of items) {
      const aisle = item.payload.aisle || 'Pantry';
      const arr = map.get(aisle) ?? [];
      arr.push(item);
      map.set(aisle, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const checkedCount = items.filter((i) => i.payload.checked).length;

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <ShoppingCart size={20} style={{ verticalAlign: '-3px' }} /> Smart Aisle-Sorted Grocery List
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Multi-store filtering · Deduplicated net quantities · 1-Click Finished Shopping reconciliation to Pantry
          </p>
        </div>
        <div className="dp-row">
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={async () => {
              const n = await generateNetGroceryItems({
                includeParDrops: true,
                includeChoreSupplies: true,
                todayIso: logicalToday,
              });
              pushToast(`Added ${n} par-level & chore supply item(s)`);
            }}
          >
            + Par Drops & Chore Supplies
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            disabled={checkedCount === 0}
            onClick={async () => {
              const res = await reconcileFinishedShopping({
                todayIso: logicalToday,
                createExpense: logExpenseOnCheckout,
              });
              pushToast(
                `Finished Shopping! Added ${res.lotsCreated} lot(s) to Pantry${res.totalSpent > 0 ? ` ($${res.totalSpent.toFixed(2)} logged)` : ''}`,
                { canUndo: true }
              );
            }}
          >
            <CheckCheck size={15} /> Finished Shopping ({checkedCount}) → Pantry
          </button>
        </div>
      </div>

      {/* Add Item + Store Filter */}
      <form
        className="dp-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newItemName.trim()) return;
          const aisle = inferAisle(newItemName);
          await createRecord<GroceryItemPayload>('grocery_item', newItemName.trim(), {
            canonicalName: canonicalizeIngredientName(newItemName),
            quantity: newItemQty,
            unit: newItemUnit,
            aisle,
            store: newItemStore,
            checked: false,
            boughtQty: newItemQty,
            targetZone: aisle === 'Produce' || aisle === 'Dairy & Eggs' ? 'Fridge' : 'Dry Pantry',
          });
          setNewItemName('');
          pushToast('Added to grocery list', { canUndo: true });
        }}
      >
        <input className="dp-input" style={{ flex: 2 }} placeholder="Add grocery item…" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
        <label className="dp-row" style={{ gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Qty:</span>
          <input type="number" step={0.5} min={0.5} className="dp-input" style={{ width: 68 }} value={newItemQty} onChange={(e) => setNewItemQty(Number(e.target.value) || 1)} />
        </label>
        <input list="dp-groc-units" className="dp-input" style={{ width: 92 }} value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} placeholder="unit…" aria-label="Grocery unit" />
        <datalist id="dp-groc-units">
          {['item', 'pack', 'bag', 'box', 'can', 'bottle', 'bunch', 'lb', 'oz', 'kg', 'g', 'L', 'gallon', 'dozen'].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <input list="dp-groc-stores" aria-label="Store" className="dp-input" style={{ width: 145 }} value={newItemStore} onChange={(e) => setNewItemStore(e.target.value)} placeholder="Store (pick or type)…" />
        <datalist id="dp-groc-stores">
          {STORES.slice(1).map((s) => <option key={s} value={s} />)}
        </datalist>
        <button type="submit" className="dp-btn dp-btn-primary">
          <Plus size={14} /> Add
        </button>
      </form>

      <div className="dp-between">
        <div className="dp-row">
          {STORES.map((s) => (
            <button key={s} type="button" className={`dp-btn dp-btn-sm ${storeFilter === s ? 'dp-btn-primary' : ''}`} onClick={() => setStoreFilter(s)}>
              {s}
            </button>
          ))}
        </div>
        <label className="dp-row" style={{ fontSize: '0.84rem' }}>
          <input type="checkbox" checked={logExpenseOnCheckout} onChange={(e) => setLogExpenseOnCheckout(e.target.checked)} />
          <span>Link checkout total to Finance expenses</span>
        </label>
      </div>

      {groupedByAisle.length === 0 ? (
        <div className="dp-empty">
          <strong>Grocery list is clear</strong>
          <span className="dp-muted">Add items manually or generate directly from Recipes or your Weekly Meal Plan.</span>
        </div>
      ) : (
        <div className="dp-stack">
          {groupedByAisle.map(([aisle, aisleItems]) => (
            <div key={aisle} className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <strong style={{ color: 'var(--dp-accent)' }}>{aisle} ({aisleItems.length})</strong>
              {aisleItems.map((item) => (
                <div key={item.id} className="dp-between" style={{ padding: '6px 0', borderTop: '1px dotted var(--dp-border)' }}>
                  <label className="dp-row" style={{ cursor: 'pointer', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={item.payload.checked}
                      onChange={(e) =>
                        void updateRecord<GroceryItemPayload>(item.id, (c) => ({
                          ...c,
                          payload: { ...c.payload, checked: e.target.checked },
                        }))
                      }
                    />
                    <span style={{ textDecoration: item.payload.checked ? 'line-through' : undefined }}>
                      <strong>{item.payload.quantity} {item.payload.unit}</strong> {item.title}
                    </span>
                    <span className="dp-pill">{item.payload.store}</span>
                    {item.payload.sourceLabel && <span className="dp-muted" style={{ fontSize: '0.76rem' }}>({item.payload.sourceLabel})</span>}
                  </label>

                  <div className="dp-row" style={{ gap: 6 }}>
                    <input
                      aria-label={`Price for ${item.title}`}
                      type="number"
                      step={0.01}
                      min={0}
                      className="dp-input"
                      style={{ width: 78, padding: '3px 6px', fontSize: '0.82rem' }}
                      placeholder="$ price"
                      value={item.payload.price ?? ''}
                      onChange={(e) =>
                        void updateRecord<GroceryItemPayload>(
                          item.id,
                          (c) => ({ ...c, payload: { ...c.payload, price: Number(e.target.value) || 0 } }),
                          { skipUndo: true }
                        )
                      }
                    />
                    <input
                      aria-label={`Expiry date for ${item.title}`}
                      type="date"
                      className="dp-input"
                      style={{ width: 130, padding: '3px 6px', fontSize: '0.8rem' }}
                      value={item.payload.expiryDate ?? ''}
                      onChange={(e) =>
                        void updateRecord<GroceryItemPayload>(
                          item.id,
                          (c) => ({ ...c, payload: { ...c.payload, expiryDate: e.target.value } }),
                          { skipUndo: true }
                        )
                      }
                    />
                    <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(item.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
