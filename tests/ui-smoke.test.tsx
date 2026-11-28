import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/core/db';

// jsdom doesn't natively implement HTMLDialogElement.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

describe('Full App UI Smoke & Zero-Stub Navigation Check', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    await db.records.clear();
    await db.settings.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('mounts App, completes 30-second onboarding with sample data, navigates all core views with zero localStorage', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    // Wait for async IndexedDB boot & Temporal init
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Onboarding wizard appears first
    expect(container.textContent).toContain('Welcome to Planaday');
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open My Planner')
    );
    expect(openBtn).toBeDefined();

    await act(async () => {
      openBtn!.click();
    });
    // TodaySpread is lazy-loaded (Batch 6) — wait cleanly for Suspense chunk to resolve
    for (let t = 0; t < 60; t++) {
      if (container.textContent?.includes('Add to Today:')) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
    }

    // Today Open-Book Spread renders with inline Add-to-Today, Still Upcoming Today & Daily Learning Fact
    expect(container.textContent).toContain('Add to Today:');
    expect(container.textContent).toContain('Still Upcoming Today');
    expect(container.textContent).toContain('Top Three Priorities');
    expect(container.textContent).toContain('Daily Tracker Strip');
    expect(container.textContent).toContain('Fact #');

    // Click through sidebar views across all 5 phases + new History & All-in-One Scroll pages
    const viewsToCheck = [
      ['All-in-One Scroll', 'All-in-One Scroll'],
      ['Quick Glance', 'Quick Glance'],
      ['Home', "Today's Momentum"],
      ['Physical Planner', 'Physical-Style Digital Planner'],
      ['Task Calendar', 'Intelligent Task Calendar'],
      ['History & Reviews', 'Completion History, Chore Punctuality'],
      ['Reports & Analytics', 'Statistics, Reports'],
      ['Lab Management', 'Laboratory Management Workspace'],
      ['Calculator & Graph', 'Mathematical & Analytical Workspace'],
      ['Spreadsheets', 'Integrated Spreadsheets'],
      ['Presentations', 'Presentation Creator'],
      ['Kanban Boards', 'Universal Kanban Boards'],
      ['Whiteboard Canvas', 'Infinite Whiteboard'],
      ['Projects & Records', 'Creative Projects & Custom Record Builder'],
      ['Game Dev Studio', 'Game Development Workspace'],
      ['Book Studio', 'Book Writing & Story Studio'],
      ['Code Sandbox', 'Sandboxed Code & Testing Studio'],
      ['Camera & Photos', 'Camera, Photo Library & Non-Destructive Editor'],
      ['Note Scanner & OCR', 'Physical Note Scanner'],
      ['PDF Reader & Editor', 'Integrated PDF Reader, Editor'],
      ['Universal Files', 'Universal Document & File Hub'],
      ['Flow Calendar', 'Flow Calendar'],
      ['Tasks', 'Tasks & Nested Subtasks'],
      ['Chores', 'Completion-Based Chores & Room Health'],
      ['Notes & Graph', 'Rich Block / Live-Markdown Notes'],
      ['Thought Inbox', 'Thought Inbox & Selected-Passage Filing'],
      ['Diary & Mood', 'Diary & Personal Reflection'],
      ['Timers & Pomodoro', 'Complete Time Suite'],
      ['Recipes', 'Recipe Library & Smart Clipper'],
      ['Pantry Lots', 'Lot-Based Pantry'],
      ['Meal Planner', 'Weekly Meal Planner'],
      ['Groceries', 'Smart Aisle-Sorted Grocery List'],
      ['Automations', 'Local Automation Engine'],
      ['Guide & Help', 'Where Do I Find'],
      ['Settings & Themes', 'Theme Studio Presets'],
      ['Trash (30d)', '30-Day Trash Bin'],
    ];

    for (const [navLabel, expectedHeading] of viewsToCheck) {
      const btn = Array.from(container.querySelectorAll<HTMLButtonElement>('aside button')).find((b) =>
        b.textContent?.includes(navLabel)
      );
      expect(btn, `Expected sidebar button "${navLabel}"`).toBeDefined();
      await act(async () => {
        btn!.click();
      });
      for (let t = 0; t < 40; t++) {
        if (container.textContent?.includes(expectedHeading)) break;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      }
      expect(container.textContent).toContain(expectedHeading);
    }

    // Zero localStorage usage confirmed after full interactive session
    expect(window.localStorage.length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  }, 20000);
});
