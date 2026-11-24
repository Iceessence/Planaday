import React, { useMemo, useState } from 'react';
import { Bell, BookOpen, Compass, ExternalLink, HelpCircle, History, Keyboard, Layers, PenTool, Search, Users } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { PLANADAY_CHANGELOG } from '../../data/changelog';
import type { NavView } from '../../core/types';

interface FeatureDirectoryEntry {
  title: string;
  view: NavView;
  category: string;
  where: string;
  summary: string;
  keywords: string;
}

const FEATURE_DIRECTORY: FeatureDirectoryEntry[] = [
  {
    title: 'Today Open-Book Spread',
    view: 'today',
    category: 'Daily Planning',
    where: 'Plan → Today Spread',
    summary: 'Your daily command sheet: Still Upcoming events, post-now Free Time Finder, inline Add-Anything bar, Top 3 Priorities, Daily Notes, Mood/Water/Sleep tracker, Stickers & Ink.',
    keywords: 'today schedule events free time notes ink stickers top 3 actual rollover',
  },
  {
    title: 'Home Dashboard',
    view: 'home',
    category: 'Daily Planning',
    where: 'Plan → Home',
    summary: 'Live greeting, Today momentum bar, Important Shared Family Notices, Happening Now / Next Up hero card, quick task & chore checkoffs, habits strip, timers & meal preview.',
    keywords: 'home overview dashboard summary family notices next up',
  },
  {
    title: 'All-in-One Scroll Page',
    view: 'all_in_one',
    category: 'Daily Planning',
    where: 'Plan → All-in-One Scroll',
    summary: 'Every enabled planner tab stacked on a single continuous scrollable page with a sticky quick-jump pill bar and Expand/Collapse All.',
    keywords: 'scroll all tabs one page continuous',
  },
  {
    title: 'Flow Calendar & Event Categories',
    view: 'calendar',
    category: 'Daily Planning',
    where: 'Plan → Flow Calendar',
    summary: '1–62 day zoomable timeline with visual selectable event categories, custom category creator, drag-and-drop scheduling, conflict inspector, ICS import/export, and family sharing.',
    keywords: 'calendar schedule categories drag drop recurring ics timezone',
  },
  {
    title: 'Tasks & Nested Subtasks',
    view: 'tasks',
    category: 'Daily Planning',
    where: 'Plan → Tasks',
    summary: 'Separate Do Date (when you plan to work on it) vs Hard Due Date (real deadline), nested subtasks, Kanban board view, dependencies, and family sharing.',
    keywords: 'tasks todo checklist board subtasks deadlines',
  },
  {
    title: 'Completion-Based Chores & Punctuality',
    view: 'chores',
    category: 'Home & Life',
    where: 'Plan → Chores',
    summary: '7 smart recurrence modes, Room Freshness bars, On-Time Completion %, and linked supplies. Finishing late shifts the next due date cleanly from today.',
    keywords: 'chores cleaning room health on time punctuality',
  },
  {
    title: 'Completion History & Event Reviews',
    view: 'history',
    category: 'Review',
    where: 'Plan → History & Reviews',
    summary: 'Reverse-chronological log of completed tasks, chores (with on-time vs late badges), "How did it go?" event reflections, and logged timer/stopwatch sessions.',
    keywords: 'history completed log reviews retrospective how did it go punctuality csv',
  },
  {
    title: 'Timers (Hours/Min/Sec), Pomodoro & Soundscapes',
    view: 'timers',
    category: 'Time',
    where: 'Time → Timers & Pomodoro',
    summary: 'Simultaneous countdown timers supporting seconds (e.g. 45s or 1m 30s), Pomodoro Studio, multi-step Interval Builder, and offline synthesized Rain/Brown/Lo-Fi soundscapes.',
    keywords: 'timer seconds countdown pomodoro soundscape rain brown noise interval',
  },
  {
    title: 'Smart Alarms & Background Alerts',
    view: 'alarms',
    category: 'Time',
    where: 'Time → Smart Alarms',
    summary: 'Schedule alarms by repeating weekdays or specific calendar dates, choose from 8 musical offline ringtones or upload your own MP3/WAV, adjust per-alarm volume & wake-up challenges, plus native OS & Docker ntfy push.',
    keywords: 'alarm wake up schedule ringtone mp3 wav weekday date notifications chrome closed ntfy push',
  },
  {
    title: 'Stopwatch & Time Ledger',
    view: 'stopwatch',
    category: 'Time',
    where: 'Time → Stopwatch & Ledger',
    summary: 'Millisecond stopwatch with fastest/slowest lap stats, customizable milestone chimes (e.g. every 15 min), CSV lap export, and automatic Time Ledger logging.',
    keywords: 'stopwatch lap time ledger milestone notify',
  },
  {
    title: 'Notes, Thought Inbox & Diary',
    view: 'notes',
    category: 'Mind',
    where: 'Mind → Notes / Thought Inbox / Diary',
    summary: 'Unlimited Markdown notebooks with [[WikiLinks]], 25-step revision history, rapid Thought Inbox brain dumps, and daily Mood/Sleep/Gratitude journaling.',
    keywords: 'notes markdown wiki diary journal mood thoughts',
  },
  {
    title: 'Kitchen OS (Recipes, Pantry, Meals & Groceries)',
    view: 'recipes',
    category: 'Kitchen',
    where: 'Kitchen → Recipes / Pantry / Meals / Groceries',
    summary: 'Import recipes from URLs, scale servings with cooking density conversions, track Pantry expiration lots, plan weekly meals, and auto-generate net grocery lists.',
    keywords: 'recipes cooking pantry expiration meal plan grocery list',
  },
  {
    title: 'Notifications, Volume & Chime Settings',
    view: 'settings',
    category: 'Customization',
    where: 'Studio → Settings & Themes → Notifications & Sounds',
    summary: 'Choose exactly what notifies you (Events, Chores, Timers, Stopwatches, Alarms), lead time before events, volume (0–100%), chime sound style, and test sound preview.',
    keywords: 'notifications sound volume loud chime lead time alert settings',
  },
  {
    title: 'Family Member Profiles & Sharing',
    view: 'settings',
    category: 'Customization',
    where: 'Top Bar Profile Switcher · Settings → Family Profiles',
    summary: 'Create separate profiles for family members, switch between Everyone or an individual member, and mark shared events/tasks/chores as Important so everyone sees them.',
    keywords: 'family profiles members share important household multi user',
  },
  {
    title: 'Custom Tabs, Themes & Personalization',
    view: 'settings',
    category: 'Customization',
    where: 'Sidebar "+ New Tab" · In-Tab "Settings" Drawer · Settings',
    summary: 'Build custom sidebar tabs with fully editable widgets (pick specific timers with sounds, 1-tap launchers for any built-in or custom tab, filtered events/tasks/chores, weather, alarms, habits, trackers & notes) and tweak settings right inside each tab.',
    keywords: 'custom tabs widgets edit timers launcher themes paper colors fonts personalization hide sidebar phone bottom bar mobile',
  },
  {
    title: 'Live Weather & 5-Day Forecast',
    view: 'home',
    category: 'Daily Planning',
    where: 'Plan → Home · Plan → Today Spread',
    summary: 'Shows live temperature, conditions, wind, precipitation chance, and a 5-day forecast when online (with GPS or City Search and °F/°C toggle), plus 1-click Log to Diary and offline cache fallback.',
    keywords: 'weather forecast temperature rain wind snow city gps celsius fahrenheit',
  },
  {
    title: 'Docker & Tailscale Sync (LAN + Away from Home)',
    view: 'settings',
    category: 'Sync & Apps',
    where: 'Top Bar Sync Pill · Settings → 3-Mode Sync',
    summary: 'Enter your Primary LAN Server URL (e.g. http://192.168.88.31:3000) and optional Fallback Tailscale Server URL (e.g. http://100.x.y.z:3000) for automatic failover on Android and Windows apps, with built-in Connection Tester.',
    keywords: 'sync docker tailscale server ip android windows app connect retry lan failover',
  },
  {
    title: '120 Offline Daily Facts & Custom Deck',
    view: 'today',
    category: 'Mind',
    where: 'Plan → Today Spread (Right Page)',
    summary: 'Browse 120 curated offline facts across 12 topics (Space, Biology, Engineering, Food Science, Physics, History & more), filter by topic, or add your own custom facts & quotes.',
    keywords: 'facts daily learning quotes trivia deck topics add own',
  },
];

export const GuideView: React.FC = () => {
  const { settings, setActiveView } = useApp();
  const [guideTab, setGuideTab] = useState<'directory' | 'changelog'>('directory');
  const [query, setQuery] = useState('');

  const filteredDirectory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FEATURE_DIRECTORY;
    return FEATURE_DIRECTORY.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.where.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 18 }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>
            <BookOpen size={20} style={{ verticalAlign: '-3px' }} /> {settings.plannerTitle} Guide, Feature Directory &amp; Changelog
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            Find any feature in seconds, check What&apos;s New in the permanent changelog, and customize every setting.
          </p>
        </div>
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${guideTab === 'directory' ? 'dp-btn-primary' : ''}`}
            onClick={() => setGuideTab('directory')}
          >
            <Compass size={14} /> Feature Directory
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${guideTab === 'changelog' ? 'dp-btn-primary' : ''}`}
            onClick={() => setGuideTab('changelog')}
          >
            <History size={14} /> What&apos;s New &amp; Changelog (v{PLANADAY_CHANGELOG[0].version})
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('settings')}>
            Open Settings
          </button>
        </div>
      </div>

      {guideTab === 'changelog' ? (
        <div className="dp-stack" style={{ gap: 14 }}>
          {PLANADAY_CHANGELOG.map((rel) => (
            <div key={rel.version} className="dp-card dp-stack" style={{ padding: 16, gap: 10 }}>
              <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                <strong style={{ fontSize: '1.08rem' }}>
                  v{rel.version} — {rel.title}
                </strong>
                <span className="dp-pill highlight">Released {rel.date}</span>
              </div>
              {rel.highlights.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.86rem' }}>✨ New &amp; Improved Features</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: '0.86rem' }}>
                    {rel.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}
              {rel.bugFixes.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.86rem' }}>🛠️ Bug Fixes</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: '0.86rem' }}>
                    {rel.bugFixes.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
              {rel.performanceAndSync.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.86rem' }}>⚡ Performance &amp; Synchronization</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: '0.86rem' }}>
                    {rel.performanceAndSync.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {rel.storageAndData.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.86rem' }}>🗄️ Storage &amp; Backups</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: '0.86rem' }}>
                    {rel.storageAndData.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {rel.knownLimitations.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--dp-warn)' }}>ℹ️ Honest Known Limitations</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: '0.84rem' }} className="dp-muted">
                    {rel.knownLimitations.map((k, i) => <li key={i}>{k}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>

      {/* Interactive "Where Do I Find...?" Directory */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <div className="dp-between">
          <strong>
            <Compass size={16} style={{ verticalAlign: '-3px' }} /> Where Do I Find...? (Click any card to jump straight there)
          </strong>
          <span className="dp-pill">{filteredDirectory.length} features</span>
        </div>
        <div className="dp-row">
          <Search size={16} className="dp-muted" />
          <input
            className="dp-input"
            style={{ flex: 1 }}
            placeholder='Search anything (e.g. "ink eraser", "actual", "notifications", "family", "custom tabs", "seconds")…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="dp-grid-2" style={{ gap: 10 }}>
          {filteredDirectory.map((item) => (
            <button
              key={item.title}
              type="button"
              className="dp-card dp-stack"
              style={{ textAlign: 'start', padding: 12, gap: 5, cursor: 'pointer' }}
              onClick={() => setActiveView(item.view)}
            >
              <div className="dp-between">
                <strong>{item.title}</strong>
                <span className="dp-pill">
                  <ExternalLink size={11} /> Go
                </span>
              </div>
              <div className="dp-muted" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                Location: {item.where}
              </div>
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                {item.summary}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Key Concepts Explained Clearly */}
      <div className="dp-grid-2" style={{ gap: 12 }}>
        <section className="dp-card dp-stack" style={{ padding: 14 }}>
          <h4>
            <HelpCircle size={16} style={{ verticalAlign: '-3px' }} /> What Do &ldquo;Planned View&rdquo;, &ldquo;Planned vs. Actual&rdquo; &amp; &ldquo;Log Actual&rdquo; Mean?
          </h4>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.86rem', display: 'grid', gap: 6 }}>
            <li>
              <strong>Planned View</strong> shows only your <em>intended</em> schedule (when you planned events to happen).
            </li>
            <li>
              <strong>Planned vs. Actual</strong> lets you compare your original plan against <em>reality</em> so you can spot meetings that ran long or tasks that took less time than expected.
            </li>
            <li>
              <strong>Log Actual</strong> opens a time editor pre-filled with the scheduled time plus 1-click buttons (<em>Ended Just Now</em>, <em>Started +10m Late</em>, <em>Ran +15m/+30m Long</em>) so you record when the event <em>actually</em> started and ended—and Planaday shows the variance (e.g., <code>+20m over</code>).
            </li>
          </ul>
        </section>

        <section className="dp-card dp-stack" style={{ padding: 14 }}>
          <h4>
            <Bell size={16} style={{ verticalAlign: '-3px' }} /> Notifications, Volume &amp; Chrome-Closed Alarms
          </h4>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.86rem', display: 'grid', gap: 6 }}>
            <li>
              Go to <strong>Settings → Notifications &amp; Sounds</strong> to toggle alerts for <strong>Events</strong>, <strong>Chores</strong>, <strong>Timers</strong>, <strong>Stopwatches</strong>, and <strong>Alarms</strong>.
            </li>
            <li>
              Adjust <strong>how much before</strong> an event notifies (e.g., 5m, 15m, 30m, 60m), pick your <strong>daily chore reminder time</strong>, set <strong>stopwatch milestone chimes</strong>, and tune <strong>volume (0–100%)</strong> + chime sound with a live preview button.
            </li>
            <li>
              <strong>Without Chrome open:</strong> Use the native <strong>Android APK</strong>, the <strong>Windows Desktop App</strong> (runs in the system tray), or connect a free <strong>ntfy.sh</strong> topic to your Docker server in <em>Settings → Notifications</em>!
            </li>
          </ul>
        </section>

        <section className="dp-card dp-stack" style={{ padding: 14 }}>
          <h4>
            <Users size={16} style={{ verticalAlign: '-3px' }} /> Family Member Profiles &amp; Sharing
          </h4>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.86rem', display: 'grid', gap: 6 }}>
            <li>
              Create profiles for each family member in <strong>Settings → Family Profiles</strong>.
            </li>
            <li>
              Switch between <strong>Everyone (Family)</strong> or any individual profile anytime from the <strong>top bar</strong>.
            </li>
            <li>
              Check <strong>🏡 Share with Family</strong> on any Event, Task, or Chore so other profiles see it too. Check <strong>★ Important</strong> to pin it to the glowing <strong>Important Shared Family Notices</strong> board on Home and Today!
            </li>
          </ul>
        </section>

        <section className="dp-card dp-stack" style={{ padding: 14 }}>
          <h4>
            <PenTool size={16} style={{ verticalAlign: '-3px' }} /> Smooth Ink, Eraser &amp; Custom Tabs
          </h4>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.86rem', display: 'grid', gap: 6 }}>
            <li>
              Click <strong>Ink</strong> on Today Spread to open the floating Ink Toolbar: choose <strong>Pen, Fine, Marker, Highlighter, Dashed, or Eraser</strong>, pick colors, size, and opacity, or click <strong>Undo Ink / Clear Ink</strong>.
            </li>
            <li>
              Click <strong>+ New Custom Tab</strong> in the sidebar to create your own personal tabs filled with filtered Events, Tasks, Chores, Scratchpad Notes, Custom Trackers, Quick Timers, and Bookmarks.
            </li>
          </ul>
        </section>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <h4>
          <Keyboard size={16} style={{ verticalAlign: '-3px' }} /> Keyboard Shortcuts Cheat Sheet
        </h4>
        <div className="dp-grid-3" style={{ gap: 8, fontSize: '0.84rem' }}>
          <div><code>N</code> — Open Quick Capture anywhere</div>
          <div><code>/</code> — Open Global Fuzzy Search</div>
          <div><code>Ctrl/Cmd + K</code> — Open Command Palette</div>
          <div><code>T</code> — Jump to Logical Today</div>
          <div><code>Ctrl/Cmd + Z</code> — Undo (20 steps)</div>
          <div><code>Ctrl/Cmd + Shift + Z</code> — Redo</div>
          <div><code>Alt + ↑ / ↓</code> — Nudge focused calendar event</div>
          <div><code>Shift + Click</code> — Multi-select calendar events</div>
          <div><code>Esc</code> — Close modal or Zen Sheet</div>
        </div>
      </div>

      {/* Lock-Screen Notifications, Sync & Storage Setup Guide */}
      <div className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
        <h4>📱 Phone Lock-Screen Alerts, Background Sync &amp; Server Storage</h4>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: '0.84rem', display: 'grid', gap: 5 }}>
          <li>
            <strong>Android APK Lock-Screen Alerts:</strong> After installing the Planaday Android APK, go to Android <em>Settings → Apps → Planaday</em> and enable <strong>Notifications</strong>, grant <strong>Alarms &amp; reminders</strong>, and set <strong>Battery</strong> to <strong>Unrestricted</strong> so Android Doze does not delay alarms.
          </li>
          <li>
            <strong>Browser / iOS Alerts when Closed:</strong> Mobile web browsers pause tabs when locked; connect a free <strong>ntfy.sh</strong> topic in <em>Settings → Notifications</em> so your Docker server delivers alerts even when every browser is closed.
          </li>
          <li>
            <strong>Where Your Data Lives:</strong> On your device in IndexedDB (<code>dayplana-v2</code>, zero <code>localStorage</code>); on your server in SQLite (<code>/data/dayplana.sqlite</code>) + blobs and automated daily SQLite snapshots in <code>/data/blobs/db-backups/</code> on TrueNAS. Inspect live paths and trigger instant backups anytime in <strong>Settings → Sync &amp; Storage</strong>.
          </li>
        </ul>
      </div>

      <div className="dp-row">
        <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('today')}>
          Go to Today Spread
        </button>
        <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('home')}>
          Go to Home Dashboard
        </button>
        <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('all_in_one')}>
          <Layers size={13} /> Go to All-in-One Scroll
        </button>
      </div>
      </>
      )}
    </div>
  );
};
