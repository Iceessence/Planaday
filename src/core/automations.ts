import { db } from './db';
import { createRecord } from './repository';
import { canonicalizeIngredientName, inferAisle } from './kitchenActions';
import type { GroceryItemPayload, LifeRecord, TaskPayload } from './types';

export type AutomationTrigger =
  | 'alarm_dismissed'
  | 'pantry_staple_zero'
  | 'focus_timer_ended'
  | 'med_low_stock';

export type AutomationAction =
  | 'open_morning_kickoff'
  | 'add_to_grocery_list'
  | 'create_refill_task'
  | 'prompt_break_timer';

export interface AutomationRulePayload {
  enabled: boolean;
  trigger: AutomationTrigger;
  conditionField?: string;
  conditionThreshold?: number;
  action: AutomationAction;
  actionTargetLabel?: string;
  lastFiredKey?: string;
  fireCount?: number;
}

export interface AutomationExecutionResult {
  ruleId: string;
  ruleTitle: string;
  matched: boolean;
  dryRun: boolean;
  skippedReason?: string;
  effectSummary: string;
  navigateView?: 'rituals' | 'shopping' | 'tasks' | 'timers';
}

const MAX_LOOP_DEPTH = 3;

/**
 * Evaluates and executes local When -> If -> Then automation rules with:
 * - Dry-run simulation support
 * - Loop guard (visited rule IDs + depth limit)
 * - Idempotency key deduplication
 */
export async function evaluateAutomations(
  trigger: AutomationTrigger,
  context: {
    subjectName?: string;
    numericValue?: number;
    todayIso: string;
    idempotencyKey?: string;
    dryRun?: boolean;
    _visitedRuleIds?: Set<string>;
    _depth?: number;
  }
): Promise<AutomationExecutionResult[]> {
  const depth = context._depth ?? 0;
  if (depth >= MAX_LOOP_DEPTH) return [];
  const visited = context._visitedRuleIds ?? new Set<string>();

  const rules = (await db.records.where('type').equals('automation_rule').toArray()).filter(
    (r) => !r.deletedAt && (r.payload as AutomationRulePayload).enabled
  ) as Array<LifeRecord<AutomationRulePayload>>;

  const results: AutomationExecutionResult[] = [];

  for (const rule of rules) {
    if (rule.payload.trigger !== trigger) continue;
    if (visited.has(rule.id)) {
      results.push({
        ruleId: rule.id,
        ruleTitle: rule.title,
        matched: false,
        dryRun: Boolean(context.dryRun),
        skippedReason: 'Loop guard prevented recursive execution',
        effectSummary: 'Skipped (loop guard)',
      });
      continue;
    }

    // Condition threshold check (e.g., med drops <= 7 doses or pantry hits <= 0)
    if (
      rule.payload.conditionThreshold !== undefined &&
      context.numericValue !== undefined &&
      context.numericValue > rule.payload.conditionThreshold
    ) {
      results.push({
        ruleId: rule.id,
        ruleTitle: rule.title,
        matched: false,
        dryRun: Boolean(context.dryRun),
        skippedReason: `Value ${context.numericValue} above threshold ${rule.payload.conditionThreshold}`,
        effectSummary: 'Condition not met',
      });
      continue;
    }

    const idemKey = context.idempotencyKey || `${trigger}:${context.subjectName || ''}:${context.todayIso}`;
    if (!context.dryRun && rule.payload.lastFiredKey === idemKey) {
      results.push({
        ruleId: rule.id,
        ruleTitle: rule.title,
        matched: false,
        dryRun: false,
        skippedReason: 'Idempotency guard: already executed for this event',
        effectSummary: 'Skipped (already applied)',
      });
      continue;
    }

    visited.add(rule.id);

    let effectSummary = '';
    let navigateView: AutomationExecutionResult['navigateView'];

    if (rule.payload.action === 'open_morning_kickoff') {
      effectSummary = 'Opens guided Morning Kickoff ritual';
      navigateView = 'rituals';
    } else if (rule.payload.action === 'add_to_grocery_list') {
      const itemName = context.subjectName || rule.payload.actionTargetLabel || 'Pantry Staple';
      effectSummary = `Adds "${itemName}" to Smart Grocery List`;
      navigateView = 'shopping';
      if (!context.dryRun) {
        await createRecord<GroceryItemPayload>('grocery_item', itemName, {
          canonicalName: canonicalizeIngredientName(itemName),
          quantity: 1,
          unit: 'item',
          aisle: inferAisle(itemName),
          store: 'Local Market',
          checked: false,
          sourceLabel: `Automation: ${rule.title}`,
        });
      }
    } else if (rule.payload.action === 'create_refill_task') {
      const medName = context.subjectName || rule.payload.actionTargetLabel || 'Medication';
      effectSummary = `Creates Refill Task for "${medName}" due today`;
      navigateView = 'tasks';
      if (!context.dryRun) {
        await createRecord<TaskPayload>(
          'task',
          `Refill ${medName}`,
          { subtasks: [], boardColumn: 'next', sourceProvenance: `automation:${rule.id}` },
          { doDate: context.todayIso, dueDate: context.todayIso, priority: 'high', category: 'Health', tags: ['refill'] }
        );
      }
    } else if (rule.payload.action === 'prompt_break_timer') {
      effectSummary = 'Logs focus session and prompts a 5m stretch break';
      navigateView = 'timers';
    }

    if (!context.dryRun) {
      await db.records.update(rule.id, {
        payload: {
          ...rule.payload,
          lastFiredKey: idemKey,
          fireCount: (rule.payload.fireCount ?? 0) + 1,
        },
      });
    }

    results.push({
      ruleId: rule.id,
      ruleTitle: rule.title,
      matched: true,
      dryRun: Boolean(context.dryRun),
      effectSummary,
      navigateView,
    });
  }

  return results;
}
