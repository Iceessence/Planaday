import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db';
import { createRecord, updateRecord } from '../src/core/repository';
import {
  computeDynamicTaskSchedule,
  computeDurationAnalytics,
  computeTaskAgeMetadata,
} from '../src/core/taskScheduler';
import { computeWetNirComparison, type WetNirPairRecord } from '../src/core/labStats';
import { partitionTabsByPage, type PlannerNavTab } from '../src/modules/planner/DigitalPlannerView';
import { BUILTIN_STICKERS, STICKER_CATEGORIES } from '../src/data/stickers';
import { PLANADAY_CHANGELOG } from '../src/data/changelog';
import type {
  CalendarEventPayload,
  ChorePayload,
  DiaryPayload,
  FoodLogPayload,
  LifeRecord,
  SchedulingContextDef,
  TaskPayload,
} from '../src/core/types';

describe('Phases 3–10 — Task Calendar, Duration/Distraction, Lab Wet/NIR Stats, Digital Planner Tabs, Diary 1–10 & Food History', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.outbox.clear();
    await db.settings.clear();
  });

  it('dynamically schedules active tasks around calendar commitments, respects end time & contexts, and locks completed task history', async () => {
    const fixedMeeting = await createRecord<CalendarEventPayload>('event', 'Lab Staff Meeting', {
      startDate: '2026-11-24',
      endDate: '2026-11-24',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      floating: false,
      timeZone: 'America/Los_Angeles',
      style: 'soft',
      eventStatus: 'confirmed',
    });

    const completedTask = await createRecord<TaskPayload>(
      'task',
      'Morning Balance Verification',
      {
        subtasks: [],
        startedAt: '2026-11-24T08:15:00',
        completedAt: '2026-11-24T08:45:00',
        actualMinutes: 30,
        completionLogs: [
          {
            id: 'log_1',
            startedAt: '2026-11-24T08:15:00',
            completedAt: '2026-11-24T08:45:00',
            actualMinutes: 30,
            distracted: false,
            isEstimatedStart: false,
          },
        ],
      },
      { status: 'done', doDate: '2026-11-24', estimateMin: 30 }
    );

    const urgentLabTask = await createRecord<TaskPayload>(
      'task',
      'Review Urgent Sample Batch',
      { subtasks: [], contextId: 'ctx_lab', sortOrder: 1 },
      { doDate: '2026-11-24', priority: 'urgent', estimateMin: 45 }
    );

    const longEveningTask = await createRecord<TaskPayload>(
      'task',
      'Deep Strategy Rewrite (Too Long)',
      { subtasks: [], sortOrder: 2 },
      { doDate: '2026-11-24', priority: 'low', estimateMin: 180 }
    );

    const contexts: SchedulingContextDef[] = [
      { id: 'ctx_lab', name: 'Lab Hours', emoji: '🧪', color: '#2f7a78', days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '16:30' },
    ];

    // Tuesday at 09:30, preferred stop time 12:30 -> 09:30..10:00 is only 30m so 45m urgent task MUST jump after 10:00-11:00 meeting to 11:00-11:45!
    // Remaining 11:45..12:30 (45m) cannot fit 180m low-priority task -> goes into unfitTasks!
    const res = computeDynamicTaskSchedule({
      dateIso: '2026-11-24',
      weekday: 2, // Tuesday
      nowMin: 9 * 60 + 30,
      preferredEndTime: '12:30',
      allowPastEndTime: false,
      tasks: [completedTask, urgentLabTask, longEveningTask],
      dayEvents: [fixedMeeting],
      contexts,
    });

    const doneBlk = res.blocks.find((b) => b.task.id === completedTask.id);
    expect(doneBlk?.kind).toBe('completed_recorded');
    expect(doneBlk?.startTime).toBe('08:15');
    expect(doneBlk?.endTime).toBe('08:45');

    const urgentBlk = res.blocks.find((b) => b.task.id === urgentLabTask.id);
    expect(urgentBlk?.kind).toBe('planned_auto');
    expect(urgentBlk?.startTime).toBe('11:00');
    expect(urgentBlk?.endTime).toBe('11:45');

    expect(res.unfitTasks.map((t) => t.id)).toContain(longEveningTask.id);

    // On Sunday (weekday 0), Lab Hours context should prevent scheduling the Lab task
    const sunRes = computeDynamicTaskSchedule({
      dateIso: '2026-11-29',
      weekday: 0,
      nowMin: 9 * 60,
      preferredEndTime: '17:00',
      tasks: [urgentLabTask],
      dayEvents: [],
      contexts,
    });
    expect(sunRes.unfitTasks.map((t) => t.id)).toContain(urgentLabTask.id);
  });

  it('tracks task age, carry-forward preservation, and distracted vs. undistracted duration analytics', async () => {
    const taskA = await createRecord<TaskPayload>(
      'task',
      'Wash Dishes',
      {
        subtasks: [],
        taskType: 'Wash Dishes',
        originalDueDate: '2026-11-20',
        rescheduleCount: 3,
        completionLogs: [
          { id: 'c1', completedAt: '2026-11-22T18:00:00Z', actualMinutes: 15, estimatedMinutes: 20, distracted: false },
          { id: 'c2', completedAt: '2026-11-23T18:00:00Z', actualMinutes: 25, estimatedMinutes: 20, distracted: false },
          { id: 'c3', completedAt: '2026-11-24T18:00:00Z', actualMinutes: 45, estimatedMinutes: 20, distracted: true, distractionMinutes: 20 },
        ],
      },
      { dueDate: '2026-11-20', estimateMin: 20 }
    );
    // Backdate createdAt to verify age calculation without mutation
    const agedTask: LifeRecord<TaskPayload> = { ...taskA, createdAt: '2026-11-18T10:00:00.000Z' };
    const age = computeTaskAgeMetadata(agedTask, '2026-11-24');
    expect(age.ageDays).toBe(6);
    expect(age.overdueDays).toBe(4);
    expect(age.rescheduleCount).toBe(3);

    const chore = await createRecord<ChorePayload>('chore', 'Vacuum Living Room', {
      room: 'Living Room',
      choreMode: 'after_completion',
      intervalDays: 4,
      difficulty: 2,
      checklist: [],
      linkedSupplies: [],
      nextDueDate: '2026-11-28',
      completions: [
        { id: 'ch1', completedAt: '2026-11-24T12:00:00Z', completedDate: '2026-11-24', minutesSpent: 20, distracted: false },
      ],
    });

    const stats = computeDurationAnalytics([agedTask], [chore]);
    expect(stats.totalSessions).toBe(4);
    expect(stats.undistractedCount).toBe(3);
    expect(stats.distractedCount).toBe(1);
    expect(stats.avgUndistractedMin).toBe(20); // (15 + 25 + 20) / 3 = 20
    expect(stats.avgDistractedMin).toBe(45);
    expect(stats.fastestMin).toBe(15);
    expect(stats.longestMin).toBe(45);
    expect(stats.totalDistractionMin).toBe(20);
  });

  it('computes exact Wet Chemistry vs. NIR statistics (Bias, SEP, RMSE, r, R², OLS slope/intercept) & outlier exclusion', () => {
    const pairs: WetNirPairRecord[] = [
      { id: '1', sampleId: 'S-1', commodity: 'Corn', analysis: 'Moisture', wetMethod: 'AOAC', wetResult: 10.0, nirResult: 10.2, unit: '%', instrumentId: 'DS2500', calibrationModel: 'M1', dateTested: '2026-11-20', analyst: 'A' },
      { id: '2', sampleId: 'S-2', commodity: 'Corn', analysis: 'Moisture', wetMethod: 'AOAC', wetResult: 12.0, nirResult: 12.2, unit: '%', instrumentId: 'DS2500', calibrationModel: 'M1', dateTested: '2026-11-21', analyst: 'A' },
      { id: '3', sampleId: 'S-3', commodity: 'Corn', analysis: 'Moisture', wetMethod: 'AOAC', wetResult: 14.0, wetReplicates: [13.9, 14.1], nirResult: 14.2, unit: '%', instrumentId: 'DS2500', calibrationModel: 'M1', dateTested: '2026-11-22', analyst: 'A' },
      { id: '4', sampleId: 'S-4', commodity: 'Corn', analysis: 'Moisture', wetMethod: 'AOAC', wetResult: 16.0, nirResult: 16.2, unit: '%', instrumentId: 'DS2500', calibrationModel: 'M1', dateTested: '2026-11-23', analyst: 'A' },
      // Excluded gross outlier MUST NOT corrupt stats!
      { id: '5', sampleId: 'S-OUT', commodity: 'Corn', analysis: 'Moisture', wetMethod: 'AOAC', wetResult: 10.0, nirResult: 29.0, unit: '%', instrumentId: 'DS2500', calibrationModel: 'M1', dateTested: '2026-11-24', analyst: 'A', excluded: true },
    ];

    const stats = computeWetNirComparison(pairs);
    expect(stats.nIncluded).toBe(4);
    expect(stats.nExcluded).toBe(1);
    expect(stats.mixedUnitsWarning).toBe(false);
    expect(stats.bias).toBeCloseTo(0.2, 6);
    expect(stats.sdDiff).toBeCloseTo(0, 6);
    expect(stats.rmse).toBeCloseTo(0.2, 6);
    expect(stats.pearsonR).toBeCloseTo(1, 6);
    expect(stats.rSquared).toBeCloseTo(1, 6);
    expect(stats.slope).toBeCloseTo(1, 6);
    expect(stats.intercept).toBeCloseTo(0.2, 6);

    // Mixed units warning verification
    const mixed = computeWetNirComparison([
      pairs[0],
      { ...pairs[1], unit: 'ppm' },
    ]);
    expect(mixed.mixedUnitsWarning).toBe(true);
  });

  it('dynamically moves Physical Digital Planner side tabs & top bookmarks between Left and Right as pages flip', () => {
    const tabs: PlannerNavTab[] = [
      { id: 's0', label: 'Daily', color: '#a97434', rounded: true, showText: true, targetPageIndex: 0, placement: 'side' },
      { id: 's1', label: 'Week', color: '#4f7a65', rounded: true, showText: true, targetPageIndex: 1, placement: 'side' },
      { id: 's2', label: 'Month', color: '#3b6ea5', rounded: true, showText: true, targetPageIndex: 2, placement: 'side' },
      { id: 's3', label: 'Map', color: '#6b5ca5', rounded: true, showText: true, targetPageIndex: 3, placement: 'side' },
      { id: 't0', label: 'Start', color: '#c96f53', rounded: true, showText: true, targetPageIndex: 0, placement: 'top' },
      { id: 't3', label: 'End', color: '#2f7a78', rounded: false, showText: true, targetPageIndex: 3, placement: 'top' },
    ];

    // On Page 0: all tabs sit on the right
    const at0 = partitionTabsByPage(tabs, 0, 'side');
    expect(at0.left.length).toBe(0);
    expect(at0.right.map((t) => t.id)).toEqual(['s0', 's1', 's2', 's3']);

    // Flip to Page 2: Daily (0) and Week (1) move to Left; Month (2) and Map (3) stay on Right!
    const at2Side = partitionTabsByPage(tabs, 2, 'side');
    expect(at2Side.left.map((t) => t.id)).toEqual(['s0', 's1']);
    expect(at2Side.right.map((t) => t.id)).toEqual(['s2', 's3']);

    const at2Top = partitionTabsByPage(tabs, 2, 'top');
    expect(at2Top.left.map((t) => t.id)).toEqual(['t0']);
    expect(at2Top.right.map((t) => t.id)).toEqual(['t3']);
  });

  it('persists Diary 1–10 ratings, private bathroom logs, unified Food History, Lab revisions, expanded stickers & v3.0.0 Changelog', async () => {
    const diary = await createRecord<DiaryPayload>('diary', 'Daily Reflection — 2026-11-24', {
      date: '2026-11-24',
      ratingScaleMin: 1,
      ratingScaleMax: 10,
      ratings: { moodScore: 8, energy: 9, focus: 8, anxiety: 2 },
      bathroom: { urinations: 5, bowelMovements: 1, logs: [{ id: 'b1', time: '08:30', kind: 'urination' }] },
      dailyNoteSections: { sec_morning: 'Calm start before lab shift' },
    });
    const savedDiary = await db.records.get(diary.id);
    expect((savedDiary?.payload as DiaryPayload).ratings?.focus).toBe(8);
    expect((savedDiary?.payload as DiaryPayload).bathroom?.urinations).toBe(5);

    const food = await createRecord<FoodLogPayload>('food_log', 'Salmon Bowl', {
      date: '2026-11-24',
      time: '12:30',
      mealCategory: 'lunch',
      foodName: 'Salmon Bowl',
      portionQty: 1,
      portionUnit: 'bowl',
      rating: 5,
    });
    expect((await db.records.get(food.id))?.type).toBe('food_log');

    // Lab calibration preserves immutable revision history on edit
    const cal = await createRecord('lab_calibration', 'Analytical Balance #1', {
      equipmentId: 'BAL-01',
      status: 'passed',
      resultSummary: '100.0001 g PASS',
      revisions: [],
    });
    await updateRecord(cal.id, (c) => ({
      ...c,
      payload: {
        ...c.payload,
        resultSummary: '100.0002 g PASS (verified)',
        revisions: [...(Array.isArray(c.payload.revisions) ? c.payload.revisions : []), { previousResult: c.payload.resultSummary, newResult: '100.0002 g PASS (verified)' }],
      },
    }));
    const savedCal = await db.records.get(cal.id);
    expect(savedCal?.payload.revisions.length).toBe(1);
    expect(savedCal?.payload.revisions[0].previousResult).toBe('100.0001 g PASS');

    // Expanded stickers & v3.0.0 changelog
    expect(STICKER_CATEGORIES).toContain('Laboratory & Science');
    expect(BUILTIN_STICKERS.length).toBeGreaterThanOrEqual(250);
    expect(PLANADAY_CHANGELOG.some((c) => c.version === '3.0.0')).toBe(true);
    expect(PLANADAY_CHANGELOG.some((c) => c.version === '4.0.0')).toBe(true);
    expect(PLANADAY_CHANGELOG[0].version).toBe('4.1.0');
    expect(window.localStorage.length).toBe(0);
  });
});
