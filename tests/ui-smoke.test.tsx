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
      await new Promise((r) => setTimeout(r, 120));
    });

    // Today Open-Book Spread renders with inline Add-to-Today, Still Upcoming Today & Daily Learning Fact
    expect(container.textContent).toContain('Add to Today:');
    expect(container.textContent).toContain('Still Upcoming Today');
    expect(container.textContent).toContain('Top Three Priorities');
    expect(container.textContent).toContain('Daily Tracker Strip');
    expect(container.textContent).toContain('Fact #');

    // Click through sidebar views across all 5 phases + new History & All-in-One Scroll pages
    const viewsToCheck = [
      ['All-in-One Scroll', 'All-in-One Scroll'],
      ['Home', "Today's Momentum"],
      ['History & Reviews', 'Completion History, Chore Punctuality'],
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
        await new Promise((r) => setTimeout(r, 30));
      });
      expect(container.textContent).toContain(expectedHeading);
    }

    // Zero localStorage usage confirmed after full interactive session
    expect(window.localStorage.length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });
});
