import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Receipt, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord } from '../../core/repository';
import { addDaysIso, diffDaysIso } from '../../core/temporal';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';

/**
 * Multi-currency accumulator — NEVER silently sums mixed currencies! (Section 13.03)
 */
export function sumByCurrency(items: Array<{ amount: number; currency: string }>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const cur = (item.currency || 'USD').toUpperCase();
    totals[cur] = Number(((totals[cur] ?? 0) + (Number(item.amount) || 0)).toFixed(2));
  }
  return totals;
}

export const FinanceView: React.FC = () => {
  const { settings, patchSettings, records, logicalToday, pushToast } = useApp();

  // Bill / subscription form
  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState(14.99);
  const [billCurrency, setBillCurrency] = useState('USD');
  const [billCadence, setBillCadence] = useState<'monthly' | 'annual'>('monthly');
  const [billDue, setBillDue] = useState(addDaysIso(logicalToday, 5));
  const [billAutopay, setBillAutopay] = useState(true);
  const [billFreeTrial, setBillFreeTrial] = useState(false);

  // Envelope budget form
  const [envCategory, setEnvCategory] = useState('Groceries');
  const [envLimit, setEnvLimit] = useState(600);
  const [envCurrency, setEnvCurrency] = useState(settings.defaultCurrency || 'USD');

  // Quick Expense Logger (feeds straight into Envelope progress bars!)
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState(25);
  const [expCategory, setExpCategory] = useState('Groceries');
  const [expCurrency, setExpCurrency] = useState(settings.defaultCurrency || 'USD');

  // Warranty & Wishlist forms
  const [warrantyItem, setWarrantyItem] = useState('');
  const [warrantyExp, setWarrantyExp] = useState(addDaysIso(logicalToday, 365));
  const [wishItem, setWishItem] = useState('');
  const [wishPrice, setWishPrice] = useState(80);

  // Bills Sort & Filter
  const [billSearch, setBillSearch] = useState('');
  const [billFilter, setBillFilter] = useState<'all' | 'autopay' | 'manual' | 'trial'>('all');
  const [billSortBy, setBillSortBy] = useState<'due' | 'amount' | 'title'>('due');
  const [billSortDir, setBillSortDir] = useState<'asc' | 'desc'>('asc');

  const bills = useMemo(() => records.filter((r) => r.type === 'bill'), [records]);
  const filteredBills = useMemo(() => {
    const q = billSearch.trim().toLowerCase();
    const list = bills.filter((b) => {
      const p = b.payload as { autopay?: boolean; isFreeTrial?: boolean; currency?: string };
      if (billFilter === 'autopay' && !p.autopay) return false;
      if (billFilter === 'manual' && p.autopay) return false;
      if (billFilter === 'trial' && !p.isFreeTrial) return false;
      if (q && !b.title.toLowerCase().includes(q) && !(p.currency || '').toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = billSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const pa = a.payload as { amount?: number; dueDate?: string };
      const pb = b.payload as { amount?: number; dueDate?: string };
      if (billSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (billSortBy === 'amount') return ((pa.amount || 0) - (pb.amount || 0)) * dir;
      return (pa.dueDate || '9999').localeCompare(pb.dueDate || '9999') * dir;
    });
  }, [bills, billSearch, billFilter, billSortBy, billSortDir]);
  const envelopes = useMemo(() => records.filter((r) => r.type === 'budget_envelope'), [records]);
  const expenses = useMemo(() => records.filter((r) => r.type === 'expense'), [records]);
  const warranties = useMemo(() => records.filter((r) => r.type === 'warranty'), [records]);
  const wishlist = useMemo(() => records.filter((r) => r.type === 'wishlist_item'), [records]);

  const monthlyBurnByCurrency = useMemo(
    () =>
      sumByCurrency(
        bills.map((b) => {
          const p = b.payload as { amount: number; currency: string; cadence: 'monthly' | 'annual' };
          return { amount: p.cadence === 'annual' ? p.amount / 12 : p.amount, currency: p.currency || 'USD' };
        })
      ),
    [bills]
  );

  // Free-trial cancellation alerts within 3 days before charge!
  const trialAlerts = useMemo(
    () =>
      bills.filter((b) => {
        const p = b.payload as { isFreeTrial?: boolean; dueDate?: string };
        if (!p.isFreeTrial || !p.dueDate) return false;
        const d = diffDaysIso(logicalToday, p.dueDate);
        return d >= 0 && d <= 3;
      }),
    [bills, logicalToday]
  );

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <Wallet size={20} style={{ verticalAlign: '-3px' }} /> Personal Finance, Bills, Budgets & Warranties
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Manual no-bank-login ledger · Strict multi-currency separation · Free-trial 3-day warnings · 30-day wishlist cool-off
          </p>
        </div>
        <div className="dp-row">
          {Object.entries(monthlyBurnByCurrency).map(([cur, amt]) => (
            <span key={cur} className="dp-pill highlight">
              Burn: {cur} {amt.toFixed(2)}/mo ({(amt * 12).toFixed(0)}/yr)
            </span>
          ))}
        </div>
      </div>

      <TabSettingsDrawer title="Finance Settings" subtitle="Default currency for new bills, budget envelopes, and quick expenses.">
        <div className="dp-row" style={{ gap: 8, fontSize: '0.83rem' }}>
          <span className="dp-muted">Default Currency:</span>
          {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].map((cur) => (
            <button
              key={cur}
              type="button"
              className={`dp-btn dp-btn-sm ${settings.defaultCurrency === cur ? 'dp-btn-primary' : ''}`}
              onClick={() => {
                void patchSettings({ defaultCurrency: cur });
                setBillCurrency(cur);
                setEnvCurrency(cur);
                setExpCurrency(cur);
                pushToast(`Default currency set to ${cur}`);
              }}
            >
              {cur}
            </button>
          ))}
        </div>
      </TabSettingsDrawer>

      {trialAlerts.length > 0 && (
        <div className="dp-banner danger" style={{ margin: 0 }}>
          <span>
            <AlertTriangle size={15} /> Free-Trial Cancellation Alert (≤3 days):{' '}
            {trialAlerts.map((t) => `${t.title} (${(t.payload as { dueDate: string }).dueDate})`).join(', ')}
          </span>
        </div>
      )}

      {/* Recurring Bills & Subscriptions */}
      <div className="dp-card dp-stack">
        <h4>Recurring Bills & Subscriptions</h4>
        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!billTitle.trim()) return;
            await createRecord('bill', billTitle.trim(), {
              amount: billAmount,
              currency: billCurrency,
              cadence: billCadence,
              dueDate: billDue,
              autopay: billAutopay,
              isFreeTrial: billFreeTrial,
            }, { dueDate: billDue });
            setBillTitle('');
            pushToast('Saved recurring bill');
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Bill or subscription…" value={billTitle} onChange={(e) => setBillTitle(e.target.value)} />
          <label className="dp-row" style={{ gap: 4 }}>
            <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Amount:</span>
            <input type="number" step={0.01} className="dp-input" style={{ width: 90 }} value={billAmount} onChange={(e) => setBillAmount(Number(e.target.value) || 0)} />
          </label>
          <input list="dp-currencies" aria-label="Currency" className="dp-input" style={{ width: 76 }} value={billCurrency} onChange={(e) => setBillCurrency(e.target.value.toUpperCase())} />
          <datalist id="dp-currencies">
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].map((c) => <option key={c} value={c} />)}
          </datalist>
          <select aria-label="Cadence" className="dp-select" style={{ width: 'auto' }} value={billCadence} onChange={(e) => setBillCadence(e.target.value as 'monthly' | 'annual')}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
          <input type="date" className="dp-input" style={{ width: 'auto' }} value={billDue} onChange={(e) => setBillDue(e.target.value)} />
          <label className="dp-row" style={{ fontSize: '0.82rem' }}>
            <input type="checkbox" checked={billAutopay} onChange={(e) => setBillAutopay(e.target.checked)} /> Autopay
          </label>
          <label className="dp-row" style={{ fontSize: '0.82rem' }}>
            <input type="checkbox" checked={billFreeTrial} onChange={(e) => setBillFreeTrial(e.target.checked)} /> Free Trial
          </label>
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add</button>
        </form>

        <SortFilterBar
          search={billSearch}
          onSearchChange={setBillSearch}
          searchPlaceholder="Search bills & subscriptions…"
          sortBy={billSortBy}
          onSortByChange={(v) => setBillSortBy(v as typeof billSortBy)}
          sortOptions={[
            { value: 'due', label: 'Due Date' },
            { value: 'amount', label: 'Amount' },
            { value: 'title', label: 'Title (A–Z)' },
          ]}
          sortDir={billSortDir}
          onSortDirToggle={() => setBillSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          chips={[
            { value: 'all', label: 'All' },
            { value: 'autopay', label: 'Autopay' },
            { value: 'manual', label: 'Manual' },
            { value: 'trial', label: 'Free Trials' },
          ]}
          activeChip={billFilter}
          onChipChange={(v) => setBillFilter(v as typeof billFilter)}
          totalCount={bills.length}
          shownCount={filteredBills.length}
          onReset={() => {
            setBillSearch('');
            setBillFilter('all');
          }}
        />

        {filteredBills.map((b) => {
          const p = b.payload as { amount: number; currency: string; cadence: string; dueDate: string; autopay: boolean; isFreeTrial?: boolean };
          return (
            <div key={b.id} className="dp-between" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6, fontSize: '0.88rem' }}>
              <span>
                <strong>{b.title}</strong> · {p.currency} {Number(p.amount).toFixed(2)}/{p.cadence} · Due {p.dueDate}
              </span>
              <div className="dp-row">
                <span className="dp-pill">{p.autopay ? 'Autopay' : 'Manual'}</span>
                {p.isFreeTrial && <span className="dp-pill highlight">Free Trial</span>}
                <button type="button" className="dp-btn dp-btn-danger dp-btn-sm" onClick={() => void softDeleteRecord(b.id)}>Trash</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Envelope Budgets & Expenses */}
      <div className="dp-grid-2">
        <div className="dp-card dp-stack">
          <h4>Envelope Budgets</h4>
          <form
            className="dp-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!envCategory.trim()) return;
              await createRecord('budget_envelope', envCategory.trim(), { limit: envLimit, currency: envCurrency });
              pushToast('Saved budget envelope');
            }}
          >
            <input list="dp-budget-cats" className="dp-input" style={{ flex: 1 }} value={envCategory} onChange={(e) => setEnvCategory(e.target.value)} placeholder="Category (pick or type)…" />
            <datalist id="dp-budget-cats">
              {['Groceries', 'Dining', 'Utilities', 'Housing', 'Transport', 'Health', 'Household', 'Fun', 'Travel', 'Clothing'].map((c) => <option key={c} value={c} />)}
            </datalist>
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Limit:</span>
              <input type="number" className="dp-input" style={{ width: 90 }} value={envLimit} onChange={(e) => setEnvLimit(Number(e.target.value) || 0)} />
            </label>
            <input list="dp-currencies" aria-label="Envelope currency" className="dp-input" style={{ width: 74 }} value={envCurrency} onChange={(e) => setEnvCurrency(e.target.value.toUpperCase())} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save</button>
          </form>

          {envelopes.map((env) => {
            const p = env.payload as { limit: number; currency: string };
            const spent = expenses
              .filter(
                (ex) =>
                  (ex.category || '').toLowerCase() === env.title.toLowerCase() &&
                  ((ex.payload as { currency?: string }).currency || 'USD') === p.currency
              )
              .reduce((s, ex) => s + Number((ex.payload as { amount?: number }).amount || 0), 0);
            const pct = p.limit > 0 ? Math.min(100, Math.round((spent / p.limit) * 100)) : 0;
            return (
              <div key={env.id} className="dp-stack" style={{ gap: 4 }}>
                <div className="dp-between" style={{ fontSize: '0.86rem' }}>
                  <strong>{env.title}</strong>
                  <div className="dp-row" style={{ gap: 6 }}>
                    <span>{p.currency} {spent.toFixed(2)} / {p.limit.toFixed(2)}</span>
                    <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete budget envelope" onClick={() => void softDeleteRecord(env.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="dp-progress-track">
                  <div className="dp-progress-fill" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--dp-danger)' : 'var(--dp-accent-2)' }} />
                </div>
              </div>
            );
          })}

          {/* Quick Expense Logger */}
          <div style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 10 }} className="dp-stack">
            <strong style={{ fontSize: '0.88rem' }}>Log Expense Against Budget ({expenses.length})</strong>
            <form
              className="dp-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!expTitle.trim()) return;
                await createRecord(
                  'expense',
                  expTitle.trim(),
                  { amount: expAmount, currency: expCurrency, date: logicalToday },
                  { category: expCategory.trim() || 'General' }
                );
                setExpTitle('');
                pushToast(`Logged expense (${expCurrency} ${expAmount.toFixed(2)})`, { canUndo: true });
              }}
            >
              <input className="dp-input" style={{ flex: 2 }} placeholder="Expense (e.g., Trader Joe's)" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
              <input list="dp-budget-cats" className="dp-input" style={{ width: 115 }} value={expCategory} onChange={(e) => setExpCategory(e.target.value)} placeholder="Category" />
              <input type="number" step={0.01} min={0} className="dp-input" style={{ width: 82 }} value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value) || 0)} />
              <input list="dp-currencies" className="dp-input" style={{ width: 68 }} value={expCurrency} onChange={(e) => setExpCurrency(e.target.value.toUpperCase())} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">+ Log</button>
            </form>
            {expenses.slice(0, 6).map((ex) => {
              const ep = ex.payload as { amount?: number; currency?: string; date?: string };
              return (
                <div key={ex.id} className="dp-between" style={{ fontSize: '0.82rem' }}>
                  <span>
                    <strong>{ex.title}</strong> <span className="dp-muted">({ex.category || 'General'} · {ep.date || logicalToday})</span>
                  </span>
                  <div className="dp-row" style={{ gap: 6 }}>
                    <span className="dp-pill">{ep.currency || 'USD'} {Number(ep.amount || 0).toFixed(2)}</span>
                    <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete expense" onClick={() => void softDeleteRecord(ex.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Receipt/Warranty Vault & 30-Day Cool-Off Wishlist */}
        <div className="dp-card dp-stack">
          <h4><ShieldCheck size={15} /> Warranties & 30-Day Cool-Off Wishlist</h4>
          <form
            className="dp-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!warrantyItem.trim()) return;
              await createRecord('warranty', warrantyItem.trim(), { expiresDate: warrantyExp });
              setWarrantyItem('');
              pushToast('Saved warranty');
            }}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder="Receipt / Warranty item…" value={warrantyItem} onChange={(e) => setWarrantyItem(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={warrantyExp} onChange={(e) => setWarrantyExp(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-sm">+ Warranty</button>
          </form>
          {warranties.map((w) => (
            <div key={w.id} className="dp-between" style={{ fontSize: '0.84rem' }}>
              <span><Receipt size={13} /> {w.title}</span>
              <div className="dp-row" style={{ gap: 6 }}>
                <span className="dp-pill">Exp: {String((w.payload as { expiresDate?: string }).expiresDate)}</span>
                <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete warranty" onClick={() => void softDeleteRecord(w.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          <form
            className="dp-row"
            style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 10 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wishItem.trim()) return;
              await createRecord('wishlist_item', wishItem.trim(), {
                price: wishPrice,
                currency: 'USD',
                coolOffUntil: addDaysIso(logicalToday, 30),
              });
              setWishItem('');
              pushToast('Added to Wishlist with 30-day cool-off');
            }}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder="Wishlist item (30-day cool-off)…" value={wishItem} onChange={(e) => setWishItem(e.target.value)} />
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">$</span>
              <input type="number" className="dp-input" style={{ width: 76 }} value={wishPrice} onChange={(e) => setWishPrice(Number(e.target.value) || 0)} />
            </label>
            <button type="submit" className="dp-btn dp-btn-sm">+ Wish</button>
          </form>
          {wishlist.map((w) => {
            const p = w.payload as { price: number; coolOffUntil: string };
            const rem = diffDaysIso(logicalToday, p.coolOffUntil);
            return (
              <div key={w.id} className="dp-between" style={{ fontSize: '0.84rem' }}>
                <span>{w.title} (${p.price})</span>
                <div className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-pill">{rem > 0 ? `${rem}d cool-off left` : 'Cool-off complete ✓'}</span>
                  <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete wishlist item" onClick={() => void softDeleteRecord(w.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
