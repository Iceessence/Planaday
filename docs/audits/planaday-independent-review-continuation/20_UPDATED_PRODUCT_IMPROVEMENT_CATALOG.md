# Planaday product improvements and expansion

## Development order

| Stage | Outcome and gate | Prior foundations |
|---|---|---|
| P0 data preservation and access | Bind saved content to its record, make concurrent updates atomic, isolate untrusted execution, scope access, identify the live immutable build and recover both stores from a verified clone. Gate on integrity assertions and a recovery drill. | PF-01 through PF-04, PF-42 |
| P1 delivery, correctness and portability | Require binary receipt before synced, preserve offline assets, resolve Firefox and Android minimum compatibility, correct export payloads, harden formula and root correctness, and add release platform tests. Gate on exact byte, reference, browser and native checks. | PF-05, PF-07, PF-08, PF-46, PF-47 |
| P2 everyday ergonomics and relationships | Fix form overflow, accessible controls and mobile input. Make records linkable from calendar, projects, notes and lab with predictable deletion, provenance and offline behavior. | PF-06, PF-09, PF-10, PF-11, PF-14, PF-37, PF-38 |
| P3 specialist depth | Validate domain workflows before growing the lab, office and creative modules. Add reviewed sample procedures, reusable workbooks, traceable file outputs and mobile capture. | PF-23 through PF-33, PF-48, PF-50 |
| P4 expansion | Explore templates, local assistance and cross-workspace insight after integration, ownership and restoration are durable. | PF-34 through PF-45, PF-49 |

## Existing workspace improvements

| Workspaces | Improve first | Observable acceptance |
|---|---|---|
| All-in-One, Quick Glance, Home, Today, Period Planner | Pin user intent, give lightweight previews, preserve view state and offer consistent keyboard/screen-reader paths. | Load a dense workspace and open exact records across mobile/desktop. |
| Flow Calendar, Task Calendar, Tasks, Chores, Goals, Habits, Events | Make scheduling proposals explain changes. Keep stable due dates, conflicts, time zones and recurring history. | Exercise boundaries with reload, link checks and calendar interchange. |
| Physical Planner, Whiteboard, Kanban | Keyboard-safe canvas controls, bounded undo and preservation of linked records. | Draw, move and restore a populated canvas or board and export equivalent output. |
| Notes, Thought Inbox, Diary, Spaced Review | Atomic drafts, low-cost large text, durable undo and reusable references. | Repeat cross-note, Gboard, rich text and multi-device tests without losing drafts. |
| Clocks, Alarms, Timers, Stopwatch, Countdowns | Explain delivery prerequisites and show schedule, acknowledgement and failure. | Test actual native conditions and reconcile settings after reopen. |
| Recipes, Pantry, Meals, Groceries | Explain lot usage and directly tie meals to pantry changes and shopping. | Reconcile a cooked meal against quantities, including reversal and split units. |
| Calculator, Spreadsheets, Presentations, Files | Preserve reference semantics and interchange bytes, scale render, and expose format capabilities. | Reopen outputs in independent viewers and validate values, dimensions and assets. |
| Projects, Game Dev, Book Studio, Code | Deep links, typed metadata, real exports and isolated execution. | Round-trip authored projects, chapter and game artifacts and test trust boundaries defensively. |
| Photos | Original lineage and non-destructive edits, mobile-responsive gallery and verified transfer. | Preserve exact originals and derivatives across edit, attach and two-client recovery. |
| Lab Management | Explicit sample custody, instrument/quality state, units, checkpoint math, reporting and role boundaries. | Run a fictional receipt-to-release example with traceable revisions and a reproducible report. |
| Household, People, Health, Finance, Media, Travel, Home/Assets | Make scope ownership explicit and offer purpose-built forms with shared typed references. | Verify access, offline use and dependent changes against synthetic profiles. |
| Custom Spaces, Rituals, Insights, Automations | Version templates, preview changes, show permission effects and log undoable execution. | Execute a proposed template/automation safely and undo it across record kinds. |
| Guide, Trash and Settings | Publish current build identity, portable backups and accessible status, plus clear deletion retention. | Verify exact backing release, retention settings and successful export/restore. |

## Additional proposals from this continuation

| ID | Rank | Proposal | Evidence and acceptance |
|---|---|---|---|
| PF-51 | P1 | Attachment receipt with transfer delay and retry visibility | Explain local-only, waiting for upload, failed and verified stages. A temporary server failure must never resolve to synced while a reference lacks bytes. |
| PF-52 | P1 | Release and storage identity in administrative diagnostics | Show immutable source/image identity and last independently restorable snapshot plus blob coverage. Display neither private records nor secrets. |
| PF-53 | P2 | Native compatibility and notification diagnostics | Show minimum WebView, device alert permissions and scheduling/delivery evidence. Surface test notifications only when initiated by the user. |
| PF-54 | P2 | Export and formula preview with fidelity checks | Show resolved format, name, formula errors and typed-cell interpretation before publish. Compare generated output through independent consumers. |
| PF-55 | P2 | Draft recovery inbox for conflicting or interrupted note edits | Preserve pending record identity and authored content. A confusing switch, interrupted save or conflict produces a recoverable draft and clear action. |
| PF-56 | P3 | Reference workbook for domain validation | Store a versioned synthetic validation dataset alongside laboratory calculations and cite the report inputs. Re-execute known reference cases on demand. |

## Prior proposals preserved

The following entries retain their prior specification, value, dependencies and acceptance criteria. Current prioritization is above.

- [PF-01 Reliable atomic saves](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-01-reliable-atomic-saves)
- [PF-02 Verified attachment delivery](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-02-verified-attachment-delivery)
- [PF-03 Verified restore and server rebind](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-03-verified-restore-and-server-rebind)
- [PF-04 Authenticated workspace pairing](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-04-authenticated-workspace-pairing)
- [PF-05 Build-versioned offline assets](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-05-build-versioned-offline-assets)
- [PF-06 Single-column forms and accessible controls](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-06-single-column-forms-and-accessible-controls)
- [PF-07 Long-note editor performance and recovery](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-07-long-note-editor-performance-and-recovery)
- [PF-08 Interchange and calculator correctness pack](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-08-interchange-and-calculator-correctness-pack)
- [PF-09 Typed relationships and deep links](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-09-typed-relationships-and-deep-links)
- [PF-10 Incremental record search and saved scopes](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-10-incremental-record-search-and-saved-scopes)
- [PF-11 Schedule proposal with decision history](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-11-schedule-proposal-with-decision-history)
- [PF-12 Shared availability, resources and travel buffers](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-12-shared-availability-resources-and-travel-buffers)
- [PF-13 Project dependencies, timeline and capacity](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-13-project-dependencies-timeline-and-capacity)
- [PF-14 Daily workspace templates and onboarding](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-14-daily-workspace-templates-and-onboarding)
- [PF-15 Kitchen costs, lots and meal reconciliation](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-15-kitchen-costs-lots-and-meal-reconciliation)
- [PF-16 Household budget and receipt ledger](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-16-household-budget-and-receipt-ledger)
- [PF-17 Private wellness measures and trends](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-17-private-wellness-measures-and-trends)
- [PF-18 Shared household responsibilities](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-18-shared-household-responsibilities)
- [PF-19 Offline travel pack with time zones](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-19-offline-travel-pack-with-time-zones)
- [PF-20 Collections and readings as templates](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-20-collections-and-readings-as-templates)
- [PF-21 Learning plan and evidence notebook](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-21-learning-plan-and-evidence-notebook)
- [PF-22 Structured document and PDF review](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-22-structured-document-and-pdf-review)
- [PF-23 Laboratory custody and sample execution](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-23-laboratory-custody-and-sample-execution)
- [PF-24 Laboratory QC, method validation and uncertainty](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-24-laboratory-qc-method-validation-and-uncertainty)
- [PF-25 Laboratory procurement and capacity planning](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-25-laboratory-procurement-and-capacity-planning)
- [PF-26 Game design entities and balance scenarios](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-26-game-design-entities-and-balance-scenarios)
- [PF-27 Playtest, assets and release evidence](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-27-playtest-assets-and-release-evidence)
- [PF-28 Scene-based writing and continuity evidence](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-28-scene-based-writing-and-continuity-evidence)
- [PF-29 Editorial and publishing handoff](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-29-editorial-and-publishing-handoff)
- [PF-30 Trusted code learning workbench](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-30-trusted-code-learning-workbench)
- [PF-31 Visual record canvas and printable planner](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-31-visual-record-canvas-and-printable-planner)
- [PF-32 Reusable photo originals and editing recipes](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-32-reusable-photo-originals-and-editing-recipes)
- [PF-33 Scientific calculation worksheets](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-33-scientific-calculation-worksheets)
- [PF-34 Previewable user automation](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-34-previewable-user-automation)
- [PF-35 Owner-controlled local assistance](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-35-owner-controlled-local-assistance)
- [PF-36 Declarative workspace builder and recipe packs](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-36-declarative-workspace-builder-and-recipe-packs)
- [PF-37 Native capture and device actions](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-37-native-capture-and-device-actions)
- [PF-38 Desktop project panes and keyboard context](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-38-desktop-project-panes-and-keyboard-context)
- [PF-39 Permissioned historical timeline and comparisons](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-39-permissioned-historical-timeline-and-comparisons)
- [PF-40 Living documents and evidence snapshots](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-40-living-documents-and-evidence-snapshots)
- [PF-41 Decision journal linked to outcomes](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-41-decision-journal-linked-to-outcomes)
- [PF-42 Recovery rehearsal with receipts](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-42-recovery-rehearsal-with-receipts)
- [PF-43 Private evidence-aware relationship explorer](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-43-private-evidence-aware-relationship-explorer)
- [PF-44 Adaptive dashboard with pinned intent](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-44-adaptive-dashboard-with-pinned-intent)
- [PF-45 Open template exchange with ownership controls](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-45-open-template-exchange-with-ownership-controls)
- [PF-46 Native and web notification reliability controls](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-46-native-and-web-notification-reliability-controls)
- [PF-47 Accessible application-wide status and diagnostics](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-47-accessible-application-wide-status-and-diagnostics)
- [PF-48 External tool handoff over a native IDE](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-48-external-tool-handoff-over-a-native-ide)
- [PF-49 Personal time calibration and honest scheduling estimates](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-49-personal-time-calibration-and-honest-scheduling-estimates)
- [PF-50 Modular advanced format and engine parity](../planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md#pf-50-modular-advanced-format-and-engine-parity)
