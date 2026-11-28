import { useViewFormGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  Calendar,
  Check,
  ClipboardCheck,
  Copy,
  DollarSign,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Mail,
  Package,
  Plus,
  Printer,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { addDaysIso } from '../../core/temporal';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import { LabWetNirView } from './LabWetNirView';
import type { LifeRecord } from '../../core/types';

type LabSubTab =
  | 'overview'
  | 'samples'
  | 'subcontract'
  | 'inventory'
  | 'purchasing'
  | 'budget'
  | 'pricing'
  | 'research'
  | 'emails'
  | 'tasks'
  | 'meetings'
  | 'calibration'
  | 'wet_nir'
  | 'hours'
  | 'qms';

const EMPTY_LAB_RECORDS: LifeRecord[] = [];

const EMAIL_TEMPLATES = [
  {
    name: 'Results Ready',
    subject: 'Analytical Results Ready — Sample {{SAMPLE}}',
    body: 'Hello,\n\nAttached are the completed analytical results for Sample {{SAMPLE}}. Please let us know if you need any clarification on methods or turnaround details.\n\nBest regards,\nLaboratory Management',
  },
  {
    name: 'Subcontract Follow-Up',
    subject: 'Status Inquiry — Subcontracted Sample {{SAMPLE}}',
    body: 'Hello,\n\nCould you please provide an updated expected completion date for Sample {{SAMPLE}} shipped to your facility? Our client deadline is approaching.\n\nThank you,\nLaboratory Management',
  },
  {
    name: 'Client Pricing Sheet Attached',
    subject: 'Updated Analytical Testing Pricing Sheet',
    body: 'Hello,\n\nPlease find attached our current analytical testing pricing schedule including standard and rush turnaround options.\n\nBest regards,\nLaboratory Management',
  },
];

/**
 * Comprehensive Laboratory Management Workspace (Section 19.1–19.16):
 * Dedicated professional operations system separated cleanly by lab_* record types.
 * NOTE: Management & tracking workspace only — NOT an accredited/validated regulatory LIMS.
 */
export const LabWorkspaceView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));
  const [subTab, setSubTab] = useState<LabSubTab>('overview');

  const labRecordsByType = useMemo(() => {
    const map = new Map<string, LifeRecord[]>();
    for (const r of records) { if (!r.type.startsWith('lab_')) continue; const group = map.get(r.type); if (group) group.push(r); else map.set(r.type, [r]); }
    return map;
  }, [records]);
  // Record partitions
  const samples = labRecordsByType.get('lab_sample') ?? EMPTY_LAB_RECORDS;
  const subcontracts = labRecordsByType.get('lab_subcontract') ?? EMPTY_LAB_RECORDS;
  const inventory = labRecordsByType.get('lab_inventory') ?? EMPTY_LAB_RECORDS;
  const orders = labRecordsByType.get('lab_order') ?? EMPTY_LAB_RECORDS;
  const budgets = labRecordsByType.get('lab_budget') ?? EMPTY_LAB_RECORDS;
  const prices = labRecordsByType.get('lab_price_entry') ?? EMPTY_LAB_RECORDS;
  const priceTemplates = labRecordsByType.get('lab_price_template') ?? EMPTY_LAB_RECORDS;
  const research = labRecordsByType.get('lab_research') ?? EMPTY_LAB_RECORDS;
  const emails = labRecordsByType.get('lab_email_draft') ?? EMPTY_LAB_RECORDS;
  const labTasks = labRecordsByType.get('lab_task') ?? EMPTY_LAB_RECORDS;
  const meetings = labRecordsByType.get('lab_meeting') ?? EMPTY_LAB_RECORDS;
  const calibrations = labRecordsByType.get('lab_calibration') ?? EMPTY_LAB_RECORDS;
  const workHours = labRecordsByType.get('lab_work_hour') ?? EMPTY_LAB_RECORDS;
  const qmsItems = labRecordsByType.get('lab_qms_item') ?? EMPTY_LAB_RECORDS;

  // --- Form states across sub-modules ---
  // Samples
  const [smpId, setSmpId] = useState('');
  const [smpClient, setSmpClient] = useState('');
  const [smpCommodity, setSmpCommodity] = useState('');
  const [smpAnalyses, setSmpAnalyses] = useState('');
  const [smpMethods, setSmpMethods] = useState('');
  const [smpAnalyst, setSmpAnalyst] = useState('');
  const [smpInstrument, setSmpInstrument] = useState('');
  const [smpDue, setSmpDue] = useState(() => addDaysIso(logicalToday, 3));
  const [smpPriority, setSmpPriority] = useState<'normal' | 'rush' | 'urgent'>('normal');
  const [smpFilter, setSmpFilter] = useState('');
  const [smpOnlyMine, setSmpOnlyMine] = useState(false);

  // Subcontract
  const [subLab, setSubLab] = useState('');
  const [subSample, setSubSample] = useState('');
  const [subAnalyses, setSubAnalyses] = useState('');
  const [subTracking, setSubTracking] = useState('');
  const [subExpDate, setSubExpDate] = useState(() => addDaysIso(logicalToday, 5));
  const [subCost, setSubCost] = useState(0);
  const [subContact, setSubContact] = useState('');

  // Inventory
  const [invName, setInvName] = useState('');
  const [invCat, setInvCat] = useState('Consumable');
  const [invInst, setInvInst] = useState('');
  const [invVendor, setInvVendor] = useState('');
  const [invCatalog, setInvCatalog] = useState('');
  const [invQty, setInvQty] = useState(1);
  const [invUnit, setInvUnit] = useState('ea');
  const [invMin, setInvMin] = useState(2);
  const [invLoc, setInvLoc] = useState('');
  const [invExp, setInvExp] = useState('');
  const [invLot, setInvLot] = useState('');
  const [invPrice, setInvPrice] = useState(0);

  // Purchasing
  const [ordProd, setOrdProd] = useState('');
  const [ordVendor, setOrdVendor] = useState('');
  const [ordPo, setOrdPo] = useState('');
  const [ordQty, setOrdQty] = useState(1);
  const [ordUnitPrice, setOrdUnitPrice] = useState(0);
  const [ordShip, setOrdShip] = useState(0);
  const [ordBudgetCat, setOrdBudgetCat] = useState('Consumables');

  // Budget
  const [budCat, setBudCat] = useState('Consumables');
  const [budPeriod, setBudPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [budLimit, setBudLimit] = useState(2500);

  // Pricing & Templates
  const [prClient, setPrClient] = useState('');
  const [prAnalysis, setPrAnalysis] = useState('Moisture');
  const [prCommodity, setPrCommodity] = useState('Corn');
  const [prMethod, setPrMethod] = useState('AOAC 930.15');
  const [prPrice, setPrPrice] = useState(25);
  const [prRushPrice, setPrRushPrice] = useState(45);
  const [prTat, setPrTat] = useState('3 business days');
  const [prFilterClient, setPrFilterClient] = useState('all');
  const [tplName, setTplName] = useState('');
  const [applyTplId, setApplyTplId] = useState('');
  const [applyTplClient, setApplyTplClient] = useState('');

  // Method Research
  const [resTitle, setResTitle] = useState('');
  const [resMethodNo, setResMethodNo] = useState('');
  const [resObj, setResObj] = useState('');
  const [resStatus, setResStatus] = useState<'proposal' | 'in_validation' | 'approved_procedure'>('proposal');
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);

  // Email Drafting
  const [emCat, setEmCat] = useState('Client');
  const [emTo, setEmTo] = useState('');
  const [emSubj, setEmSubj] = useState('');
  const [emBody, setEmBody] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Lab Tasks
  const [ltTitle, setLtTitle] = useState('');
  const [ltFreq, setLtFreq] = useState<'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'>('weekly');
  const [ltDue, setLtDue] = useState(logicalToday);

  // Meetings
  const [mtTitle, setMtTitle] = useState('');
  const [mtType, setMtType] = useState('Analyst Meeting');
  const [mtDate, setMtDate] = useState(logicalToday);
  const [mtTime, setMtTime] = useState('09:00');
  const [mtAttendees, setMtAttendees] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [newActionItem, setNewActionItem] = useState('');
  const [newActionOwner, setNewActionOwner] = useState('');

  // Calibration & QC
  const [calEquip, setCalEquip] = useState('');
  const [calType, setCalType] = useState('Analytical Balance');
  const [calProc, setCalProc] = useState('');
  const [calPerson, setCalPerson] = useState('');
  const [calIntervalDays, setCalIntervalDays] = useState(1);
  const [calDue, setCalDue] = useState(logicalToday);
  const [calCriteria, setCalCriteria] = useState('±0.0005 g');
  const [editingCalId, setEditingCalId] = useState<string | null>(null);
  const [calEditResult, setCalEditResult] = useState('');
  const [calEditReason, setCalEditReason] = useState('');

  // Work Hours
  const [whPerson, setWhPerson] = useState('Manager (Me)');
  const [whDate, setWhDate] = useState(logicalToday);
  const [whIn, setWhIn] = useState('08:00');
  const [whOut, setWhOut] = useState('16:30');
  const [whSchedHrs, setWhSchedHrs] = useState(8);
  const [whBreakMin, setWhBreakMin] = useState(30);
  const [whBreakActivity, setWhBreakActivity] = useState('');

  // QMS / SOP / CAPA / Training
  const [qmsKind, setQmsKind] = useState('SOP / Controlled Doc');
  const [qmsTitle, setQmsTitle] = useState('');
  const [qmsOwner, setQmsOwner] = useState('');
  const [qmsDue, setQmsDue] = useState(logicalToday);
  const [qmsNotes, setQmsNotes] = useState('');

  // --- Computed Dashboard KPIs ---
  const kpis = useMemo(() => {
    const awaiting = samples.filter((s) => s.payload.testingStatus !== 'completed').length;
    const overdueSamples = samples.filter(
      (s) => s.payload.testingStatus !== 'completed' && s.payload.requiredDate && s.payload.requiredDate < logicalToday
    ).length;
    const openSub = subcontracts.filter((s) => s.payload.resultStatus !== 'received').length;
    const overdueSub = subcontracts.filter(
      (s) => s.payload.resultStatus !== 'received' && s.payload.expectedDate && s.payload.expectedDate < logicalToday
    ).length;
    const lowStock = inventory.filter((i) => Number(i.payload.quantity ?? 0) <= Number(i.payload.minStock ?? 0)).length;
    const pendingOrd = orders.filter((o) => o.payload.receivingStatus !== 'received').length;
    const dueCal = calibrations.filter((c) => c.payload.scheduledDate && c.payload.scheduledDate <= addDaysIso(logicalToday, 3)).length;
    const overdueCal = calibrations.filter((c) => c.payload.scheduledDate && c.payload.scheduledDate < logicalToday && c.payload.status !== 'passed').length;
    const openLabTasks = labTasks.filter((t) => t.status === 'active').length;
    const totalSpent = orders.reduce((s, o) => s + Number(o.payload.totalPrice ?? 0), 0);
    const totalBudget = budgets.reduce((s, b) => s + Number(b.payload.limit ?? 0), 0);
    return { awaiting, overdueSamples, openSub, overdueSub, lowStock, pendingOrd, dueCal, overdueCal, openLabTasks, totalSpent, totalBudget };
  }, [samples, subcontracts, inventory, orders, calibrations, labTasks, budgets, logicalToday]);

  const TABS: Array<{ id: LabSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <FlaskConical size={13} /> },
    { id: 'samples', label: `Samples (${samples.length})`, icon: <Beaker size={13} /> },
    { id: 'subcontract', label: `Subcontract (${subcontracts.length})`, icon: <TruckIcon /> },
    { id: 'inventory', label: `Inventory (${inventory.length})`, icon: <Package size={13} /> },
    { id: 'purchasing', label: `Purchasing (${orders.length})`, icon: <ShoppingBag size={13} /> },
    { id: 'budget', label: 'Budget', icon: <DollarSign size={13} /> },
    { id: 'pricing', label: `Client Pricing (${prices.length})`, icon: <FileSpreadsheet size={13} /> },
    { id: 'research', label: `Method Research (${research.length})`, icon: <ClipboardCheck size={13} /> },
    { id: 'emails', label: `Email Drafts (${emails.length})`, icon: <Mail size={13} /> },
    { id: 'tasks', label: `Lab Tasks (${labTasks.length})`, icon: <Check size={13} /> },
    { id: 'meetings', label: `Meetings (${meetings.length})`, icon: <Calendar size={13} /> },
    { id: 'calibration', label: `Calibration & QC (${calibrations.length})`, icon: <Wrench size={13} /> },
    { id: 'wet_nir', label: 'Wet Chem vs NIR', icon: <FlaskConical size={13} /> },
    { id: 'hours', label: 'Work Hours', icon: <Users size={13} /> },
    { id: 'qms', label: `QMS / SOP / CAPA (${qmsItems.length})`, icon: <ShieldCheck size={13} /> },
  ];

  const selectedMeeting = meetings.find((m) => m.id === selectedMeetingId) ?? meetings[0] ?? null;
  const selectedResearch = research.find((r) => r.id === selectedResearchId) ?? research[0] ?? null;
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) ?? emails[0] ?? null;

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 14 }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2>
            <FlaskConical size={20} style={{ verticalAlign: '-3px' }} /> Laboratory Management Workspace
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
            Logically separated professional operations hub · Samples, Subcontracts, Inventory, Purchasing, Budget, Pricing, Research, Calibration/QC, Wet Chem vs. NIR &amp; Work Hours.
          </p>
        </div>
        <span className="dp-pill" style={{ fontSize: '0.72rem' }}>
          Management Aid Only (Not an Accredited / Validated LIMS)
        </span>
      </div>

      {/* Sub-Tab Navigation Strip */}
      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 5 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dp-btn dp-btn-sm ${subTab === t.id ? 'dp-btn-primary' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 1. OVERVIEW DASHBOARD (19.1) */}
      {subTab === 'overview' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <div className="dp-grid-4" style={{ gap: 10 }}>
            <button type="button" className="dp-card dp-stack" style={{ padding: 12, textAlign: 'start', cursor: 'pointer', gap: 4 }} onClick={() => setSubTab('samples')}>
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Samples Awaiting Testing</span>
              <strong style={{ fontSize: '1.4rem' }}>{kpis.awaiting}</strong>
              {kpis.overdueSamples > 0 && <span style={{ color: 'var(--dp-danger)', fontSize: '0.78rem' }}>{kpis.overdueSamples} overdue!</span>}
            </button>
            <button type="button" className="dp-card dp-stack" style={{ padding: 12, textAlign: 'start', cursor: 'pointer', gap: 4 }} onClick={() => setSubTab('subcontract')}>
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Awaiting Subcontract Results</span>
              <strong style={{ fontSize: '1.4rem' }}>{kpis.openSub}</strong>
              {kpis.overdueSub > 0 && <span style={{ color: 'var(--dp-danger)', fontSize: '0.78rem' }}>{kpis.overdueSub} delayed!</span>}
            </button>
            <button type="button" className="dp-card dp-stack" style={{ padding: 12, textAlign: 'start', cursor: 'pointer', gap: 4 }} onClick={() => setSubTab('calibration')}>
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Upcoming Calibrations &amp; QC (≤3d)</span>
              <strong style={{ fontSize: '1.4rem' }}>{kpis.dueCal}</strong>
              {kpis.overdueCal > 0 && <span style={{ color: 'var(--dp-danger)', fontSize: '0.78rem' }}>{kpis.overdueCal} overdue!</span>}
            </button>
            <button type="button" className="dp-card dp-stack" style={{ padding: 12, textAlign: 'start', cursor: 'pointer', gap: 4 }} onClick={() => setSubTab('inventory')}>
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Low Stock / Pending Orders</span>
              <strong style={{ fontSize: '1.4rem' }}>{kpis.lowStock} / {kpis.pendingOrd}</strong>
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Budget spent: ${kpis.totalSpent.toFixed(0)} / ${kpis.totalBudget.toFixed(0)}</span>
            </button>
          </div>

          <div className="dp-grid-2" style={{ gap: 12 }}>
            <div className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
              <strong>🚨 Operational Alerts &amp; Overdue Items</strong>
              {kpis.overdueSamples === 0 && kpis.overdueSub === 0 && kpis.overdueCal === 0 && kpis.lowStock === 0 ? (
                <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>All samples, subcontracts, calibrations, and inventory levels are currently on track!</p>
              ) : (
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.84rem', display: 'grid', gap: 4 }}>
                  {kpis.overdueSamples > 0 && <li><strong>{kpis.overdueSamples}</strong> overdue sample deadline(s)</li>}
                  {kpis.overdueSub > 0 && <li><strong>{kpis.overdueSub}</strong> delayed external subcontract result(s)</li>}
                  {kpis.overdueCal > 0 && <li><strong>{kpis.overdueCal}</strong> overdue calibration / QC verification(s)</li>}
                  {kpis.lowStock > 0 && <li><strong>{kpis.lowStock}</strong> laboratory supply item(s) at or below minimum stock</li>}
                </ul>
              )}
            </div>
            <div className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
              <strong>📋 Active Lab Responsibilities ({kpis.openLabTasks}) &amp; Meetings ({meetings.length})</strong>
              {labTasks.filter((t) => t.status === 'active').slice(0, 5).map((t) => (
                <div key={t.id} className="dp-between" style={{ fontSize: '0.82rem' }}>
                  <span>{t.title}</span>
                  <span className="dp-pill">{t.payload.freq} · Due {t.payload.nextDueDate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. SAMPLE & TESTING MANAGEMENT (19.2) */}
      {subTab === 'samples' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-1', async (e) => {
              e.preventDefault();
              if (!smpId.trim()) return;
              await createRecord('lab_sample', `${smpId.trim()} — ${smpClient.trim() || 'Client'}`, {
                sampleId: smpId.trim(),
                client: smpClient.trim(),
                commodity: smpCommodity.trim(),
                dateReceived: logicalToday,
                analyses: smpAnalyses.split(',').map((s) => s.trim()).filter(Boolean),
                methods: smpMethods.trim(),
                analyst: smpAnalyst.trim(),
                instrument: smpInstrument.trim(),
                requiredDate: smpDue,
                priority: smpPriority,
                testingStatus: 'received',
                resultsStatus: 'pending',
                subcontractRequired: false,
                expectedTatDays: Math.max(1, Math.round((Date.parse(smpDue) - Date.parse(logicalToday)) / 86400000)),
                notes: '',
              });
              setSmpId('');
              setSmpAnalyses('');
              pushToast('Logged laboratory sample!');
            })}
          >
            <strong>Log New Sample &amp; Required Analyses</strong>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ width: 120 }} placeholder="Sample ID *" value={smpId} onChange={(e) => setSmpId(e.target.value)} />
              <input className="dp-input" style={{ flex: 1, minWidth: 120 }} placeholder="Client" value={smpClient} onChange={(e) => setSmpClient(e.target.value)} />
              <input className="dp-input" style={{ width: 120 }} placeholder="Commodity" value={smpCommodity} onChange={(e) => setSmpCommodity(e.target.value)} />
              <input className="dp-input" style={{ flex: 1, minWidth: 150 }} placeholder="Required analyses (comma sep)" value={smpAnalyses} onChange={(e) => setSmpAnalyses(e.target.value)} />
              <input className="dp-input" style={{ width: 130 }} placeholder="Test method(s)" value={smpMethods} onChange={(e) => setSmpMethods(e.target.value)} />
            </div>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ width: 130 }} placeholder="Assigned analyst" value={smpAnalyst} onChange={(e) => setSmpAnalyst(e.target.value)} />
              <input className="dp-input" style={{ width: 130 }} placeholder="Instrument" value={smpInstrument} onChange={(e) => setSmpInstrument(e.target.value)} />
              <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
                <span className="dp-muted">Required By:</span>
                <input type="date" className="dp-input" style={{ width: 'auto' }} value={smpDue} onChange={(e) => setSmpDue(e.target.value)} />
              </label>
              <select className="dp-select" style={{ width: 'auto' }} value={smpPriority} onChange={(e) => setSmpPriority(e.target.value as typeof smpPriority)}>
                <option value="normal">Standard Priority</option>
                <option value="rush">Rush</option>
                <option value="urgent">Urgent</option>
              </select>
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Sample</button>
            </div>
          </form>

          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input className="dp-input" style={{ flex: 1 }} placeholder="Filter by sample ID, client, commodity, analysis, instrument, analyst…" value={smpFilter} onChange={(e) => setSmpFilter(e.target.value)} />
            <label className="dp-row" style={{ fontSize: '0.82rem', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={smpOnlyMine} onChange={(e) => setSmpOnlyMine(e.target.checked)} />
              <span>Only Urgent / Due ≤ 2d</span>
            </label>
          </div>

          <div className="dp-stack" style={{ gap: 8 }}>
            {samples
              .filter((s) => {
                const p = s.payload;
                if (smpOnlyMine && p.testingStatus === 'completed') return false;
                if (smpOnlyMine && p.requiredDate > addDaysIso(logicalToday, 2) && p.priority === 'normal') return false;
                if (smpFilter.trim()) {
                  const hay = `${p.sampleId} ${p.client} ${p.commodity} ${(p.analyses ?? []).join(' ')} ${p.analyst} ${p.instrument} ${p.testingStatus}`.toLowerCase();
                  if (!hay.includes(smpFilter.trim().toLowerCase())) return false;
                }
                return true;
              })
              .map((s) => {
                const p = s.payload;
                const isOverdue = p.testingStatus !== 'completed' && p.requiredDate < logicalToday;
                return (
                  <div key={s.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8, borderColor: isOverdue ? 'var(--dp-danger)' : undefined }}>
                    <div>
                      <strong>{p.sampleId}</strong> · {p.client || 'No client'} · <span className="dp-pill">{p.commodity || 'Commodity'}</span>{' '}
                      <span className="dp-pill">{p.priority}</span>
                      <div className="dp-muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                        Analyses: {(p.analyses ?? []).join(', ') || '—'} · Method: {p.methods || '—'} · Analyst: {p.analyst || 'Unassigned'} · Instrument: {p.instrument || '—'}
                      </div>
                      <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                        Received: {p.dateReceived} · Required: <strong>{p.requiredDate}</strong>
                        {p.completionDate ? ` · Completed: ${p.completionDate} (Actual TAT: ${p.actualTatDays ?? 0}d)` : ''}
                      </div>
                    </div>
                    <div className="dp-row" style={{ gap: 6 }}>
                      <select
                        aria-label="Testing status"
                        className="dp-select"
                        style={{ width: 'auto', fontSize: '0.78rem' }}
                        value={p.testingStatus}
                        onChange={(e) => {
                          const nextSt = e.target.value;
                          const compDate = nextSt === 'completed' ? logicalToday : p.completionDate;
                          const actualTat = compDate ? Math.max(0, Math.round((Date.parse(compDate) - Date.parse(p.dateReceived)) / 86400000)) : undefined;
                          void updateRecord(s.id, (c) => ({
                            ...c,
                            status: nextSt === 'completed' ? 'done' : 'active',
                            payload: { ...c.payload, testingStatus: nextSt, completionDate: compDate, actualTatDays: actualTat },
                          }));
                        }}
                      >
                        <option value="received">Received</option>
                        <option value="in_progress">In Testing</option>
                        <option value="subcontracted">Subcontracted</option>
                        <option value="review">QA Review</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(s.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. SUBCONTRACT LAB TRACKING (19.3) */}
      {subTab === 'subcontract' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-2', async (e) => {
              e.preventDefault();
              if (!subLab.trim() || !subSample.trim()) return;
              await createRecord('lab_subcontract', `${subSample.trim()} → ${subLab.trim()}`, {
                subcontractLab: subLab.trim(),
                sampleId: subSample.trim(),
                analyses: subAnalyses.trim(),
                dateShipped: logicalToday,
                trackingNumber: subTracking.trim(),
                expectedDate: subExpDate,
                cost: subCost,
                contactInfo: subContact.trim(),
                resultStatus: 'shipped',
              });
              setSubSample('');
              setSubTracking('');
              pushToast('Logged subcontracted sample!');
            })}
          >
            <input className="dp-input" style={{ width: 150 }} placeholder="Subcontract Lab *" value={subLab} onChange={(e) => setSubLab(e.target.value)} />
            <input className="dp-input" style={{ width: 120 }} placeholder="Sample ID *" value={subSample} onChange={(e) => setSubSample(e.target.value)} />
            <input className="dp-input" style={{ flex: 1, minWidth: 140 }} placeholder="Analyses requested" value={subAnalyses} onChange={(e) => setSubAnalyses(e.target.value)} />
            <input className="dp-input" style={{ width: 130 }} placeholder="Tracking #" value={subTracking} onChange={(e) => setSubTracking(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={subExpDate} onChange={(e) => setSubExpDate(e.target.value)} title="Expected results date" />
            <input type="number" className="dp-input" style={{ width: 82 }} placeholder="Cost $" value={subCost} onChange={(e) => setSubCost(Number(e.target.value) || 0)} />
            <input className="dp-input" style={{ width: 140 }} placeholder="Lab contact" value={subContact} onChange={(e) => setSubContact(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Track Shipment</button>
          </form>

          {subcontracts.map((s) => {
            const p = s.payload;
            const delayed = p.resultStatus !== 'received' && p.expectedDate < logicalToday;
            return (
              <div key={s.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8, borderColor: delayed ? 'var(--dp-danger)' : undefined }}>
                <div>
                  <strong>{p.sampleId}</strong> → {p.subcontractLab} {delayed && <span className="dp-pill" style={{ color: 'var(--dp-danger)' }}>⚠ Delayed</span>}
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    {p.analyses} · Shipped {p.dateShipped} · Expected {p.expectedDate} · Cost ${Number(p.cost || 0).toFixed(2)} · Tracking: {p.trackingNumber || '—'} · Contact: {p.contactInfo || '—'}
                  </div>
                </div>
                <div className="dp-row" style={{ gap: 6 }}>
                  <select
                    aria-label="Subcontract status"
                    className="dp-select"
                    style={{ width: 'auto', fontSize: '0.78rem' }}
                    value={p.resultStatus}
                    onChange={(e) => void updateRecord(s.id, (c) => ({ ...c, payload: { ...c.payload, resultStatus: e.target.value } }))}
                  >
                    <option value="shipped">Shipped</option>
                    <option value="in_testing">In Testing</option>
                    <option value="delayed">Delayed — Follow Up</option>
                    <option value="received">Report Received</option>
                  </select>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(s.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. LAB INVENTORY (19.4) */}
      {subTab === 'inventory' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-3', async (e) => {
              e.preventDefault();
              if (!invName.trim()) return;
              await createRecord('lab_inventory', invName.trim(), {
                category: invCat,
                instrument: invInst.trim(),
                vendor: invVendor.trim(),
                catalogNo: invCatalog.trim(),
                quantity: invQty,
                unit: invUnit.trim() || 'ea',
                minStock: invMin,
                location: invLoc.trim(),
                expirationDate: invExp || null,
                lotNumber: invLot.trim(),
                purchasePrice: invPrice,
              });
              setInvName('');
              setInvCatalog('');
              setInvLot('');
              pushToast('Added lab supply to inventory!');
            })}
          >
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Supply / reagent / consumable name *" value={invName} onChange={(e) => setInvName(e.target.value)} />
              <select className="dp-select" style={{ width: 'auto' }} value={invCat} onChange={(e) => setInvCat(e.target.value)}>
                {['Consumable', 'Chemical', 'Instrument Part', 'Method Supply', 'Safety', 'General Lab', 'Office'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="dp-input" style={{ width: 130 }} placeholder="Instrument / Method" value={invInst} onChange={(e) => setInvInst(e.target.value)} />
              <input className="dp-input" style={{ width: 120 }} placeholder="Vendor" value={invVendor} onChange={(e) => setInvVendor(e.target.value)} />
              <input className="dp-input" style={{ width: 110 }} placeholder="Catalog #" value={invCatalog} onChange={(e) => setInvCatalog(e.target.value)} />
            </div>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
                <span className="dp-muted">Qty:</span>
                <input type="number" className="dp-input" style={{ width: 68 }} value={invQty} onChange={(e) => setInvQty(Number(e.target.value) || 0)} />
              </label>
              <input className="dp-input" style={{ width: 70 }} placeholder="Unit" value={invUnit} onChange={(e) => setInvUnit(e.target.value)} />
              <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
                <span className="dp-muted">Min:</span>
                <input type="number" className="dp-input" style={{ width: 64 }} value={invMin} onChange={(e) => setInvMin(Number(e.target.value) || 0)} />
              </label>
              <input className="dp-input" style={{ width: 120 }} placeholder="Location" value={invLoc} onChange={(e) => setInvLoc(e.target.value)} />
              <input className="dp-input" style={{ width: 100 }} placeholder="Lot #" value={invLot} onChange={(e) => setInvLot(e.target.value)} />
              <input type="date" className="dp-input" style={{ width: 'auto' }} value={invExp} onChange={(e) => setInvExp(e.target.value)} title="Expiration date" />
              <input type="number" className="dp-input" style={{ width: 80 }} placeholder="$ Price" value={invPrice} onChange={(e) => setInvPrice(Number(e.target.value) || 0)} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Stock</button>
            </div>
          </form>

          {inventory.map((i) => {
            const p = i.payload;
            const low = Number(p.quantity) <= Number(p.minStock);
            const expiring = p.expirationDate && p.expirationDate <= addDaysIso(logicalToday, 30);
            return (
              <div key={i.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8, borderColor: low || expiring ? 'var(--dp-warn)' : undefined }}>
                <div>
                  <strong>{i.title}</strong> <span className="dp-pill">{p.category}</span>{' '}
                  {low && <span className="dp-pill" style={{ color: 'var(--dp-danger)' }}>Low Stock</span>}
                  {expiring && <span className="dp-pill" style={{ color: 'var(--dp-warn)' }}>Exp {p.expirationDate}</span>}
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    {p.vendor || '—'} · Cat# {p.catalogNo || '—'} · Lot {p.lotNumber || '—'} · Loc: {p.location || '—'} · Inst: {p.instrument || '—'}
                  </div>
                </div>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void updateRecord(i.id, (c) => ({ ...c, payload: { ...c.payload, quantity: Math.max(0, Number(c.payload.quantity) - 1) } }))}>−</button>
                  <strong>{p.quantity} {p.unit}</strong>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void updateRecord(i.id, (c) => ({ ...c, payload: { ...c.payload, quantity: Number(c.payload.quantity) + 1 } }))}>+</button>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(i.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. PURCHASING & ORDER HISTORY (19.5 — auto-feeds Lab Budget!) */}
      {subTab === 'purchasing' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-4', async (e) => {
              e.preventDefault();
              if (!ordProd.trim()) return;
              const total = ordQty * ordUnitPrice + ordShip;
              await createRecord('lab_order', ordProd.trim(), {
                product: ordProd.trim(),
                vendor: ordVendor.trim(),
                poNumber: ordPo.trim(),
                purchaseDate: logicalToday,
                quantity: ordQty,
                unitPrice: ordUnitPrice,
                shippingCost: ordShip,
                totalPrice: total,
                budgetCategory: ordBudgetCat,
                receivingStatus: 'ordered',
              });
              setOrdProd('');
              setOrdPo('');
              pushToast(`Order recorded ($${total.toFixed(2)}) — auto-linked to Lab Budget (${ordBudgetCat})!`);
            })}
          >
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Product purchased *" value={ordProd} onChange={(e) => setOrdProd(e.target.value)} />
            <input className="dp-input" style={{ width: 130 }} placeholder="Vendor" value={ordVendor} onChange={(e) => setOrdVendor(e.target.value)} />
            <input className="dp-input" style={{ width: 100 }} placeholder="PO #" value={ordPo} onChange={(e) => setOrdPo(e.target.value)} />
            <input type="number" className="dp-input" style={{ width: 64 }} value={ordQty} onChange={(e) => setOrdQty(Number(e.target.value) || 1)} title="Quantity" />
            <input type="number" step={0.01} className="dp-input" style={{ width: 88 }} placeholder="Unit $" value={ordUnitPrice} onChange={(e) => setOrdUnitPrice(Number(e.target.value) || 0)} />
            <input type="number" step={0.01} className="dp-input" style={{ width: 78 }} placeholder="Ship $" value={ordShip} onChange={(e) => setOrdShip(Number(e.target.value) || 0)} />
            <select className="dp-select" style={{ width: 'auto' }} value={ordBudgetCat} onChange={(e) => setOrdBudgetCat(e.target.value)}>
              {['Consumables', 'Chemicals', 'Equipment', 'Maintenance & Repairs', 'Subcontracting', 'Office', 'Safety'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Log Order</button>
          </form>

          {orders.map((o) => {
            const p = o.payload;
            return (
              <div key={o.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{p.product}</strong> · {p.vendor || 'Vendor'} · PO# {p.poNumber || '—'} · <span className="dp-pill">{p.budgetCategory}</span>
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    {p.purchaseDate} · {p.quantity} × ${Number(p.unitPrice).toFixed(2)} + ${Number(p.shippingCost || 0).toFixed(2)} ship = <strong>${Number(p.totalPrice).toFixed(2)}</strong>
                  </div>
                </div>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      setOrdProd(p.product);
                      setOrdVendor(p.vendor || '');
                      setOrdQty(p.quantity || 1);
                      setOrdUnitPrice(p.unitPrice || 0);
                      setOrdShip(p.shippingCost || 0);
                      setOrdBudgetCat(p.budgetCategory || 'Consumables');
                      pushToast('Loaded order into form to duplicate!');
                    }}
                  >
                    <Copy size={12} /> Reorder
                  </button>
                  <select
                    aria-label="Order receiving status"
                    className="dp-select"
                    style={{ width: 'auto', fontSize: '0.78rem' }}
                    value={p.receivingStatus}
                    onChange={(e) => void updateRecord(o.id, (c) => ({ ...c, payload: { ...c.payload, receivingStatus: e.target.value } }))}
                  >
                    <option value="ordered">Ordered</option>
                    <option value="in_transit">In Transit</option>
                    <option value="partial">Partial Received</option>
                    <option value="received">Received ✓</option>
                  </select>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(o.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. LAB BUDGET (19.6 — auto-connected to Purchase Orders!) */}
      {subTab === 'budget' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-5', async (e) => {
              e.preventDefault();
              await createRecord('lab_budget', `${budCat} (${budPeriod})`, { category: budCat, period: budPeriod, limit: budLimit });
              pushToast(`Saved Lab Budget category "${budCat}"`);
            })}
          >
            <input className="dp-input" style={{ flex: 1 }} value={budCat} onChange={(e) => setBudCat(e.target.value)} placeholder="Budget category" />
            <select className="dp-select" style={{ width: 'auto' }} value={budPeriod} onChange={(e) => setBudPeriod(e.target.value as typeof budPeriod)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">Limit $:</span>
              <input type="number" className="dp-input" style={{ width: 100 }} value={budLimit} onChange={(e) => setBudLimit(Number(e.target.value) || 0)} />
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Save Budget</button>
          </form>

          {budgets.map((b) => {
            const spent = orders
              .filter((o) => (o.payload.budgetCategory || '').toLowerCase() === (b.payload.category || '').toLowerCase())
              .reduce((s, o) => s + Number(o.payload.totalPrice ?? 0), 0);
            const pct = b.payload.limit > 0 ? Math.min(100, Math.round((spent / b.payload.limit) * 100)) : 0;
            return (
              <div key={b.id} className="dp-card dp-stack" style={{ padding: 12, gap: 6 }}>
                <div className="dp-between">
                  <strong>{b.payload.category} ({b.payload.period})</strong>
                  <div className="dp-row" style={{ gap: 8 }}>
                    <span><strong>${spent.toFixed(2)}</strong> / ${Number(b.payload.limit).toFixed(2)} ({pct}%)</span>
                    <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(b.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="dp-progress-track">
                  <div className="dp-progress-fill" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--dp-danger)' : 'var(--dp-accent)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7. CLIENT-SPECIFIC PRICING SHEETS & TEMPLATES (19.7 & 19.8) */}
      {subTab === 'pricing' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-6', async (e) => {
              e.preventDefault();
              if (!prAnalysis.trim()) return;
              await createRecord('lab_price_entry', `${prClient.trim() || 'Standard'} — ${prAnalysis.trim()} (${prCommodity.trim()})`, {
                client: prClient.trim() || 'Standard Rate',
                analysis: prAnalysis.trim(),
                commodity: prCommodity.trim() || 'All',
                method: prMethod.trim(),
                price: prPrice,
                rushPrice: prRushPrice,
                standardTat: prTat.trim(),
                effectiveDate: logicalToday,
                history: [],
              });
              pushToast('Added client price entry!');
            })}
          >
            <strong>Add Client / Commodity / Method Pricing Entry</strong>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ width: 140 }} placeholder="Client (or Standard)" value={prClient} onChange={(e) => setPrClient(e.target.value)} />
              <input className="dp-input" style={{ width: 130 }} placeholder="Analysis *" value={prAnalysis} onChange={(e) => setPrAnalysis(e.target.value)} />
              <input className="dp-input" style={{ width: 120 }} placeholder="Commodity" value={prCommodity} onChange={(e) => setPrCommodity(e.target.value)} />
              <input className="dp-input" style={{ width: 130 }} placeholder="Method ID" value={prMethod} onChange={(e) => setPrMethod(e.target.value)} />
              <input type="number" step={0.01} className="dp-input" style={{ width: 82 }} placeholder="Std $" value={prPrice} onChange={(e) => setPrPrice(Number(e.target.value) || 0)} />
              <input type="number" step={0.01} className="dp-input" style={{ width: 82 }} placeholder="Rush $" value={prRushPrice} onChange={(e) => setPrRushPrice(Number(e.target.value) || 0)} />
              <input className="dp-input" style={{ width: 120 }} placeholder="Std TAT" value={prTat} onChange={(e) => setPrTat(e.target.value)} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Rate</button>
            </div>
          </form>

          {/* Reusable Pricing Templates Bar */}
          <div className="dp-card dp-row" style={{ padding: 10, flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
            <input className="dp-input" style={{ width: 180 }} placeholder="Save visible rows as Template…" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={async () => {
                if (!tplName.trim() || prices.length === 0) return;
                const rows = prices
                  .filter((p) => prFilterClient === 'all' || p.payload.client === prFilterClient)
                  .map((p) => ({
                    analysis: p.payload.analysis,
                    commodity: p.payload.commodity,
                    method: p.payload.method,
                    price: p.payload.price,
                    rushPrice: p.payload.rushPrice,
                    standardTat: p.payload.standardTat,
                  }));
                await createRecord('lab_price_template', tplName.trim(), { rows });
                setTplName('');
                pushToast(`Saved pricing template (${rows.length} tests)!`);
              }}
            >
              Save Template
            </button>
            {priceTemplates.length > 0 && (
              <>
                <select className="dp-select" style={{ width: 'auto' }} value={applyTplId} onChange={(e) => setApplyTplId(e.target.value)}>
                  <option value="">Apply Template…</option>
                  {priceTemplates.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.payload.rows?.length ?? 0} rows)</option>)}
                </select>
                <input className="dp-input" style={{ width: 140 }} placeholder="New Client Name" value={applyTplClient} onChange={(e) => setApplyTplClient(e.target.value)} />
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={async () => {
                    const tpl = priceTemplates.find((t) => t.id === applyTplId);
                    if (!tpl || !applyTplClient.trim()) return;
                    for (const row of tpl.payload.rows ?? []) {
                      await createRecord('lab_price_entry', `${applyTplClient.trim()} — ${row.analysis} (${row.commodity})`, {
                        ...row,
                        client: applyTplClient.trim(),
                        effectiveDate: logicalToday,
                        history: [],
                      });
                    }
                    setPrFilterClient(applyTplClient.trim());
                    setApplyTplClient('');
                    pushToast(`Created client pricing sheet from template!`);
                  }}
                >
                  Generate Client Sheet
                </button>
              </>
            )}
          </div>

          <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select className="dp-select" style={{ width: 'auto' }} value={prFilterClient} onChange={(e) => setPrFilterClient(e.target.value)}>
              <option value="all">All Clients ({prices.length})</option>
              {Array.from(new Set(prices.map((p) => p.payload.client))).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="dp-row" style={{ gap: 6 }}>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const rows = prices.filter((p) => prFilterClient === 'all' || p.payload.client === prFilterClient);
                  const csv = recordsToCsv(
                    ['Client', 'Analysis', 'Commodity', 'Method', 'StandardPrice', 'RushPrice', 'StandardTAT', 'EffectiveDate'],
                    rows.map((r) => [r.payload.client, r.payload.analysis, r.payload.commodity, r.payload.method, r.payload.price, r.payload.rushPrice, r.payload.standardTat, r.payload.effectiveDate])
                  );
                  triggerBrowserDownload(csv, `planaday-lab-pricing-${prFilterClient}-${logicalToday}.csv`, 'text/csv');
                  pushToast('Exported pricing sheet CSV!');
                }}
              >
                <Download size={13} /> Export CSV
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => window.print()}>
                <Printer size={13} /> Print / PDF
              </button>
            </div>
          </div>

          {prices
            .filter((p) => prFilterClient === 'all' || p.payload.client === prFilterClient)
            .map((p) => (
              <div key={p.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{p.payload.client}</strong> · {p.payload.analysis} ({p.payload.commodity}) · <code>{p.payload.method}</code>
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    Std: <strong>${Number(p.payload.price).toFixed(2)}</strong> ({p.payload.standardTat}) · Rush: <strong>${Number(p.payload.rushPrice || 0).toFixed(2)}</strong> · Effective: {p.payload.effectiveDate}
                    {(p.payload.history?.length ?? 0) > 0 && ` · ${p.payload.history.length} archived prior rate(s)`}
                  </div>
                </div>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() =>
                      void updateRecord(p.id, (c) => ({
                        ...c,
                        payload: {
                          ...c.payload,
                          price: Number(c.payload.price) + 5,
                          effectiveDate: logicalToday,
                          history: [...(Array.isArray(c.payload.history) ? c.payload.history : []), { price: c.payload.price, effectiveDate: c.payload.effectiveDate }],
                        },
                      }))
                    }
                  >
                    +$5 (Archive Old)
                  </button>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(p.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 8. METHOD RESEARCH & DEVELOPMENT (19.9) */}
      {subTab === 'research' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-7', async (e) => {
              e.preventDefault();
              if (!resTitle.trim()) return;
              const rec = await createRecord('lab_research', resTitle.trim(), {
                methodNumber: resMethodNo.trim(),
                objective: resObj.trim(),
                validationStatus: resStatus,
                notes: '',
                troubleshooting: '',
                revisions: [],
              });
              setSelectedResearchId(rec.id);
              setResTitle('');
              setResMethodNo('');
              setResObj('');
              pushToast('Created method research record!');
            })}
          >
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Method / research project name *" value={resTitle} onChange={(e) => setResTitle(e.target.value)} />
            <input className="dp-input" style={{ width: 120 }} placeholder="Method #" value={resMethodNo} onChange={(e) => setResMethodNo(e.target.value)} />
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Research objective…" value={resObj} onChange={(e) => setResObj(e.target.value)} />
            <select className="dp-select" style={{ width: 'auto' }} value={resStatus} onChange={(e) => setResStatus(e.target.value as typeof resStatus)}>
              <option value="proposal">Research Proposal</option>
              <option value="in_validation">In Validation</option>
              <option value="approved_procedure">Approved Lab Procedure</option>
            </select>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add</button>
          </form>

          <div className="dp-grid-2" style={{ gap: 12, alignItems: 'start' }}>
            <div className="dp-stack" style={{ gap: 6 }}>
              {research.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="dp-card dp-between"
                  style={{ padding: 10, textAlign: 'start', cursor: 'pointer', borderColor: selectedResearch?.id === r.id ? 'var(--dp-accent)' : undefined }}
                  onClick={() => setSelectedResearchId(r.id)}
                >
                  <div>
                    <strong>{r.title}</strong> {r.payload.methodNumber && <code>({r.payload.methodNumber})</code>}
                    <div className="dp-muted" style={{ fontSize: '0.76rem' }}>{r.payload.objective}</div>
                  </div>
                  <span className="dp-pill highlight">{String(r.payload.validationStatus).replace('_', ' ')}</span>
                </button>
              ))}
            </div>
            {selectedResearch && (
              <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
                <div className="dp-between">
                  <strong>{selectedResearch.title}</strong>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      void updateRecord(selectedResearch.id, (c) => ({
                        ...c,
                        payload: {
                          ...c.payload,
                          revisions: [...(Array.isArray(c.payload.revisions) ? c.payload.revisions : []), { at: new Date().toISOString(), notes: c.payload.notes, status: c.payload.validationStatus }],
                        },
                      }));
                      pushToast('Saved method research revision snapshot!');
                    }}
                  >
                    Save Snapshot ({selectedResearch.payload.revisions?.length ?? 0})
                  </button>
                </div>
                <SafeTextarea
                  recordKey={`lab_res:${selectedResearch.id}`}
                  externalValue={selectedResearch.payload.notes ?? ''}
                  onCommit={(val) => {
                    void updateRecord(selectedResearch.id, (c) => ({ ...c, payload: { ...c.payload, notes: val } }), { skipUndo: true });
                  }}
                  className="dp-textarea"
                  rows={7}
                  placeholder="Observations, experimental results, interferences, reagents, troubleshooting history…"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. EMAIL DRAFTING WORKSPACE (19.10 — zero external email credentials required) */}
      {subTab === 'emails' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.8rem' }}>
            <span className="dp-muted">Email Templates:</span>
            {EMAIL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  setEmSubj(tpl.subject);
                  setEmBody(tpl.body);
                }}
              >
                + {tpl.name}
              </button>
            ))}
          </div>
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-8', async (e) => {
              e.preventDefault();
              if (!emSubj.trim()) return;
              const rec = await createRecord('lab_email_draft', emSubj.trim(), {
                category: emCat,
                recipient: emTo.trim(),
                subject: emSubj.trim(),
                body: emBody,
              });
              setSelectedEmailId(rec.id);
              setEmSubj('');
              setEmBody('');
              pushToast('Saved email draft locally!');
            })}
          >
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <select className="dp-select" style={{ width: 'auto' }} value={emCat} onChange={(e) => setEmCat(e.target.value)}>
                {['Client', 'Employee', 'Vendor', 'Subcontract Lab', 'Project', 'General'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="dp-input" style={{ width: 180 }} placeholder="Recipient / notes" value={emTo} onChange={(e) => setEmTo(e.target.value)} />
              <input className="dp-input" style={{ flex: 1 }} placeholder="Email subject *" value={emSubj} onChange={(e) => setEmSubj(e.target.value)} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Save Draft</button>
            </div>
            <textarea className="dp-textarea" rows={4} placeholder="Draft email body…" value={emBody} onChange={(e) => setEmBody(e.target.value)} />
          </form>

          {selectedEmail && (
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                <strong>[{selectedEmail.payload.category}] {selectedEmail.payload.subject}</strong>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`Subject: ${selectedEmail.payload.subject}\n\n${selectedEmail.payload.body}`);
                      pushToast('Copied email draft to clipboard!');
                    }}
                  >
                    <Copy size={13} /> Copy Email
                  </button>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(selectedEmail.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              <SafeTextarea
                recordKey={`lab_email:${selectedEmail.id}`}
                externalValue={selectedEmail.payload.body ?? ''}
                onCommit={(val) => {
                  void updateRecord(selectedEmail.id, (c) => ({ ...c, payload: { ...c.payload, body: val } }), { skipUndo: true });
                }}
                className="dp-textarea"
                rows={6}
              />
            </div>
          )}
        </div>
      )}

      {/* 10. LABORATORY TASKS & RECURRING RESPONSIBILITIES (19.11) */}
      {subTab === 'tasks' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-9', async (e) => {
              e.preventDefault();
              if (!ltTitle.trim()) return;
              await createRecord('lab_task', ltTitle.trim(), {
                freq: ltFreq,
                nextDueDate: ltDue,
                history: [],
              });
              setLtTitle('');
              pushToast('Added Laboratory Task!');
            })}
          >
            <input className="dp-input" style={{ flex: 2, minWidth: 180 }} placeholder="Lab responsibility (e.g., Weekly timecard review, Safety meeting)…" value={ltTitle} onChange={(e) => setLtTitle(e.target.value)} />
            <select className="dp-select" style={{ width: 'auto' }} value={ltFreq} onChange={(e) => setLtFreq(e.target.value as typeof ltFreq)}>
              <option value="once">One-Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={ltDue} onChange={(e) => setLtDue(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add</button>
          </form>

          {labTasks.map((t) => {
            const p = t.payload;
            const logOutcome = async (outcome: 'completed' | 'completed_late' | 'missed' | 'postponed') => {
              const deltaDays = p.freq === 'daily' ? 1 : p.freq === 'weekly' ? 7 : p.freq === 'monthly' ? 30 : p.freq === 'quarterly' ? 90 : p.freq === 'yearly' ? 365 : 0;
              await updateRecord(t.id, (c) => ({
                ...c,
                status: p.freq === 'once' && (outcome === 'completed' || outcome === 'completed_late') ? 'done' : 'active',
                payload: {
                  ...c.payload,
                  nextDueDate: deltaDays > 0 ? addDaysIso(logicalToday, deltaDays) : c.payload.nextDueDate,
                  history: [...(Array.isArray(c.payload.history) ? c.payload.history : []), { date: logicalToday, scheduledFor: c.payload.nextDueDate, outcome }],
                },
              }));
              pushToast(`Logged "${t.title}" as ${outcome.replace('_', ' ')}`);
            };
            return (
              <div key={t.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{t.title}</strong> <span className="dp-pill">{p.freq}</span> <span className="dp-pill">Next: {p.nextDueDate}</span>
                  <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                    Occurrence history: {(p.history ?? []).length} logged ({(p.history ?? []).filter((h: { outcome: string }) => h.outcome === 'completed').length} on-time)
                  </div>
                </div>
                <div className="dp-row" style={{ gap: 4 }}>
                  <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void logOutcome(p.nextDueDate < logicalToday ? 'completed_late' : 'completed')}>Done</button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void logOutcome('postponed')}>Postpone</button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void logOutcome('missed')}>Missed</button>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(t.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 11. LABORATORY MEETINGS (19.12 — action items auto-create Lab Tasks!) */}
      {subTab === 'meetings' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-10', async (e) => {
              e.preventDefault();
              if (!mtTitle.trim()) return;
              const rec = await createRecord('lab_meeting', mtTitle.trim(), {
                meetingType: mtType,
                date: mtDate,
                time: mtTime,
                attendees: mtAttendees.split(',').map((s) => s.trim()).filter(Boolean),
                agenda: '',
                notes: '',
                decisions: '',
                actionItems: [],
              });
              setSelectedMeetingId(rec.id);
              setMtTitle('');
              pushToast('Created Laboratory Meeting record!');
            })}
          >
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Meeting title *" value={mtTitle} onChange={(e) => setMtTitle(e.target.value)} />
            <select className="dp-select" style={{ width: 'auto' }} value={mtType} onChange={(e) => setMtType(e.target.value)}>
              {['Analyst Meeting', 'Safety Meeting', 'Management Meeting', 'QA / Audit', 'Client Call'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={mtDate} onChange={(e) => setMtDate(e.target.value)} />
            <input type="time" className="dp-input" style={{ width: 112 }} value={mtTime} onChange={(e) => setMtTime(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="Attendees (comma sep)" value={mtAttendees} onChange={(e) => setMtAttendees(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Meeting</button>
          </form>

          <div className="dp-grid-2" style={{ gap: 12, alignItems: 'start' }}>
            <div className="dp-stack" style={{ gap: 6 }}>
              {meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="dp-card dp-between"
                  style={{ padding: 10, textAlign: 'start', cursor: 'pointer', borderColor: selectedMeeting?.id === m.id ? 'var(--dp-accent)' : undefined }}
                  onClick={() => setSelectedMeetingId(m.id)}
                >
                  <div>
                    <strong>{m.title}</strong>
                    <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                      {m.payload.date} {m.payload.time} · {m.payload.meetingType} · {(m.payload.attendees ?? []).join(', ')}
                    </div>
                  </div>
                  <span className="dp-pill">{(m.payload.actionItems ?? []).length} actions</span>
                </button>
              ))}
            </div>
            {selectedMeeting && (
              <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
                <div className="dp-between">
                  <strong>{selectedMeeting.title} ({selectedMeeting.payload.date})</strong>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(selectedMeeting.id)}><Trash2 size={13} /></button>
                </div>
                <SafeTextarea
                  recordKey={`lab_mt:${selectedMeeting.id}`}
                  externalValue={selectedMeeting.payload.notes ?? ''}
                  onCommit={(val) => {
                    void updateRecord(selectedMeeting.id, (c) => ({ ...c, payload: { ...c.payload, notes: val } }), { skipUndo: true });
                  }}
                  className="dp-textarea"
                  rows={5}
                  placeholder="Agenda, discussion topics, decisions & meeting notes…"
                />
                <div className="dp-row" style={{ gap: 6 }}>
                  <input className="dp-input" style={{ flex: 2 }} placeholder="Add action item (auto-syncs to Lab Tasks)…" value={newActionItem} onChange={(e) => setNewActionItem(e.target.value)} />
                  <input className="dp-input" style={{ width: 110 }} placeholder="Owner" value={newActionOwner} onChange={(e) => setNewActionOwner(e.target.value)} />
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      if (!newActionItem.trim()) return;
                      const createdTask = await createRecord('lab_task', `[Meeting] ${newActionItem.trim()}`, {
                        freq: 'once',
                        nextDueDate: addDaysIso(logicalToday, 3),
                        owner: newActionOwner.trim(),
                        sourceMeetingId: selectedMeeting.id,
                        history: [],
                      });
                      await updateRecord(selectedMeeting.id, (c) => ({
                        ...c,
                        payload: {
                          ...c.payload,
                          actionItems: [
                            ...(Array.isArray(c.payload.actionItems) ? c.payload.actionItems : []),
                            { id: createId('act'), text: newActionItem.trim(), owner: newActionOwner.trim(), linkedTaskId: createdTask.id },
                          ],
                        },
                      }));
                      setNewActionItem('');
                      setNewActionOwner('');
                      pushToast('Action item added & synced directly to Lab Tasks!');
                    }}
                  >
                    + Action
                  </button>
                </div>
                {(selectedMeeting.payload.actionItems ?? []).map((ai: { id: string; text: string; owner?: string }) => (
                  <div key={ai.id} className="dp-pill" style={{ justifyContent: 'space-between' }}>
                    <span>✓ {ai.text}</span>
                    {ai.owner && <span className="dp-muted">({ai.owner})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 12. CALIBRATION & QUALITY CONTROL (19.13 — immutable revision preservation!) */}
      {subTab === 'calibration' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-11', async (e) => {
              e.preventDefault();
              if (!calEquip.trim()) return;
              await createRecord('lab_calibration', `${calEquip.trim()} (${calType})`, {
                equipmentId: calEquip.trim(),
                equipmentType: calType,
                procedureRef: calProc.trim(),
                assignedPerson: calPerson.trim(),
                intervalDays: calIntervalDays,
                scheduledDate: calDue,
                acceptanceCriteria: calCriteria.trim(),
                status: 'scheduled',
                resultSummary: '',
                revisions: [],
              });
              setCalEquip('');
              pushToast('Scheduled Calibration / QC check!');
            })}
          >
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ width: 150 }} placeholder="Equipment ID *" value={calEquip} onChange={(e) => setCalEquip(e.target.value)} />
              <select className="dp-select" style={{ width: 'auto' }} value={calType} onChange={(e) => setCalType(e.target.value)}>
                {['Analytical Balance', 'Calibration Weights', 'Lab Scale', 'Oven QC', 'Pipette', 'Thermometer / Probe', 'NIR Instrument', 'Chromatography', 'Other'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="dp-input" style={{ width: 130 }} placeholder="Procedure Ref" value={calProc} onChange={(e) => setCalProc(e.target.value)} />
              <input className="dp-input" style={{ width: 120 }} placeholder="Assigned To" value={calPerson} onChange={(e) => setCalPerson(e.target.value)} />
              <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
                <span className="dp-muted">Every</span>
                <input type="number" min={1} max={730} className="dp-input" style={{ width: 64 }} value={calIntervalDays} onChange={(e) => setCalIntervalDays(Number(e.target.value) || 30)} />
                <span className="dp-muted">d</span>
              </label>
              <input type="date" className="dp-input" style={{ width: 'auto' }} value={calDue} onChange={(e) => setCalDue(e.target.value)} />
              <input className="dp-input" style={{ width: 130 }} placeholder="Acceptance criteria" value={calCriteria} onChange={(e) => setCalCriteria(e.target.value)} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Schedule QC</button>
            </div>
          </form>

          {calibrations.map((c) => {
            const p = c.payload;
            const overdue = p.scheduledDate < logicalToday && p.status !== 'passed';
            return (
              <div key={c.id} className="dp-card dp-stack" style={{ padding: 10, gap: 6, borderColor: overdue ? 'var(--dp-danger)' : undefined }}>
                <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{p.equipmentId}</strong> <span className="dp-pill">{p.equipmentType}</span>{' '}
                    <span className="dp-pill highlight">{p.status}</span>
                    {overdue && <span className="dp-pill" style={{ color: 'var(--dp-danger)' }}><AlertTriangle size={11} /> Overdue</span>}
                    <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                      Next Due: {p.scheduledDate} (every {p.intervalDays}d) · Criteria: {p.acceptanceCriteria} · Result: <strong>{p.resultSummary || 'Pending'}</strong> · Revisions preserved: {(p.revisions ?? []).length}
                    </div>
                  </div>
                  <div className="dp-row" style={{ gap: 5 }}>
                    <button
                      type="button"
                      className="dp-btn dp-btn-primary dp-btn-sm"
                      onClick={() => {
                        setEditingCalId(c.id);
                        setCalEditResult(p.resultSummary || 'PASS within spec');
                        setCalEditReason('');
                      }}
                    >
                      Log / Revise Result
                    </button>
                    <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(c.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
                {editingCalId === c.id && (
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                    <input className="dp-input" style={{ flex: 1 }} placeholder="Measured result / pass-fail…" value={calEditResult} onChange={(e) => setCalEditResult(e.target.value)} />
                    <input className="dp-input" style={{ flex: 1 }} placeholder="Revision / corrective action note…" value={calEditReason} onChange={(e) => setCalEditReason(e.target.value)} />
                    <button
                      type="button"
                      className="dp-btn dp-btn-primary dp-btn-sm"
                      onClick={async () => {
                        await updateRecord(c.id, (cur) => ({
                          ...cur,
                          payload: {
                            ...cur.payload,
                            status: 'passed',
                            completionDate: logicalToday,
                            scheduledDate: addDaysIso(logicalToday, Number(cur.payload.intervalDays) || 30),
                            resultSummary: calEditResult.trim(),
                            revisions: [
                              ...(Array.isArray(cur.payload.revisions) ? cur.payload.revisions : []),
                              {
                                timestamp: new Date().toISOString(),
                                previousResult: cur.payload.resultSummary || '(initial)',
                                newResult: calEditResult.trim(),
                                reason: calEditReason.trim() || 'Logged calibration verification',
                              },
                            ],
                          },
                        }));
                        setEditingCalId(null);
                        pushToast('Saved calibration result & preserved immutable revision history!');
                      }}
                    >
                      Save (Preserve History)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 13. WET CHEMISTRY VS NIR COMPARISON (19.14) */}
      {subTab === 'wet_nir' && <LabWetNirView />}

      {/* 14. WORK HOURS & EMPLOYEE TIME TRACKING (19.15) */}
      {subTab === 'hours' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-12', async (e) => {
              e.preventDefault();
              const [ih, im] = whIn.split(':').map(Number);
              const [oh, om] = whOut.split(':').map(Number);
              const rawMinutes = (oh * 60 + om) - (ih * 60 + im);
              const grossMin = rawMinutes < 0 ? rawMinutes + 1440 : rawMinutes;
              const netHrs = Math.max(0, (grossMin - whBreakMin) / 60);
              const overtimeHrs = Math.max(0, netHrs - whSchedHrs);
              await createRecord('lab_work_hour', `${whPerson} — ${whDate}`, {
                person: whPerson.trim() || 'Manager',
                date: whDate,
                clockIn: whIn,
                clockOut: whOut,
                scheduledHours: whSchedHrs,
                breakMinutes: whBreakMin,
                breakActivity: whBreakActivity.trim(),
                netHours: Number(netHrs.toFixed(2)),
                overtimeHours: Number(overtimeHrs.toFixed(2)),
                reviewStatus: 'pending',
              });
              setWhBreakActivity('');
              pushToast(`Logged ${netHrs.toFixed(2)}h for ${whPerson}`);
            })}
          >
            <input className="dp-input" style={{ width: 150 }} placeholder="Person / Analyst" value={whPerson} onChange={(e) => setWhPerson(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={whDate} onChange={(e) => setWhDate(e.target.value)} />
            <input type="time" className="dp-input" style={{ width: 108 }} value={whIn} onChange={(e) => setWhIn(e.target.value)} />
            <span>–</span>
            <input type="time" className="dp-input" style={{ width: 108 }} value={whOut} onChange={(e) => setWhOut(e.target.value)} />
            <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
              <span className="dp-muted">Break(m):</span>
              <input type="number" className="dp-input" style={{ width: 64 }} value={whBreakMin} onChange={(e) => setWhBreakMin(Number(e.target.value) || 0)} />
            </label>
            <label className="dp-row" style={{ gap: 4, fontSize: '0.8rem' }}>
              <span className="dp-muted">Sched(h):</span>
              <input type="number" className="dp-input" style={{ width: 58 }} value={whSchedHrs} onChange={(e) => setWhSchedHrs(Number(e.target.value) || 8)} />
            </label>
            <input className="dp-input" style={{ flex: 1, minWidth: 140 }} placeholder="Personal break activity / notes…" value={whBreakActivity} onChange={(e) => setWhBreakActivity(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Log Shift</button>
          </form>

          <div className="dp-card dp-row" style={{ padding: 10, gap: 14, fontSize: '0.84rem' }}>
            <span>Total Logged: <strong>{workHours.reduce((s, w) => s + Number(w.payload.netHours || 0), 0).toFixed(2)} hrs</strong></span>
            <span>Total Overtime: <strong>{workHours.reduce((s, w) => s + Number(w.payload.overtimeHours || 0), 0).toFixed(2)} hrs</strong></span>
            <span>Pending Review: <strong>{workHours.filter((w) => w.payload.reviewStatus === 'pending').length}</strong></span>
          </div>

          {workHours.map((w) => (
            <div key={w.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{w.payload.person}</strong> · {w.payload.date} · {w.payload.clockIn}–{w.payload.clockOut} ({w.payload.breakMinutes}m break) = <strong>{w.payload.netHours}h</strong>
                {w.payload.overtimeHours > 0 && <span className="dp-pill" style={{ marginInlineStart: 6 }}>+{w.payload.overtimeHours}h OT</span>}
                {w.payload.breakActivity && <div className="dp-muted" style={{ fontSize: '0.78rem' }}>Break note: {w.payload.breakActivity}</div>}
              </div>
              <div className="dp-row" style={{ gap: 6 }}>
                <select
                  aria-label="Timecard status"
                  className="dp-select"
                  style={{ width: 'auto', fontSize: '0.78rem' }}
                  value={w.payload.reviewStatus}
                  onChange={(e) => void updateRecord(w.id, (c) => ({ ...c, payload: { ...c.payload, reviewStatus: e.target.value } }))}
                >
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved ✓</option>
                  <option value="flagged">Needs Follow-Up</option>
                </select>
                <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(w.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 15. QMS / SOP / TRAINING / CAPA / PT / REAGENT PREP / AUDITS (19.16) */}
      {subTab === 'qms' && (
        <div className="dp-stack" style={{ gap: 12 }}>
          <form
            className="dp-card dp-row"
            style={{ padding: 12, flexWrap: 'wrap', gap: 8 }}
            onSubmit={guardForm('form-13', async (e) => {
              e.preventDefault();
              if (!qmsTitle.trim()) return;
              await createRecord('lab_qms_item', qmsTitle.trim(), {
                kind: qmsKind,
                owner: qmsOwner.trim(),
                dueDate: qmsDue,
                notes: qmsNotes.trim(),
                itemStatus: 'active',
              });
              setQmsTitle('');
              setQmsNotes('');
              pushToast(`Added ${qmsKind} record!`);
            })}
          >
            <select className="dp-select" style={{ width: 'auto' }} value={qmsKind} onChange={(e) => setQmsKind(e.target.value)}>
              {[
                'SOP / Controlled Doc',
                'Analyst Training / Competency',
                'CAPA / Nonconformance',
                'Proficiency Testing (PT)',
                'Reference Material / Standard',
                'Reagent Preparation',
                'Instrument Downtime / Maint',
                'Audit Prep Checklist',
                'Chemical Safety / SDS',
              ].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Record title *" value={qmsTitle} onChange={(e) => setQmsTitle(e.target.value)} />
            <input className="dp-input" style={{ width: 120 }} placeholder="Owner / Analyst" value={qmsOwner} onChange={(e) => setQmsOwner(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={qmsDue} onChange={(e) => setQmsDue(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="Notes / lot / reference…" value={qmsNotes} onChange={(e) => setQmsNotes(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add</button>
          </form>

          {qmsItems.map((q: LifeRecord) => (
            <div key={q.id} className="dp-card dp-between" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className="dp-pill highlight">{q.payload.kind}</span> <strong>{q.title}</strong>
                <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                  Owner: {q.payload.owner || '—'} · Review/Due: {q.payload.dueDate} {q.payload.notes ? `· ${q.payload.notes}` : ''}
                </div>
              </div>
              <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(q.id)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TruckIcon: React.FC = () => <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>📦</span>;
