# User types and workspace defaults

These are proposed defaults. Each view uses the same underlying records as related workspaces and may be hidden or modified. Planaday baseline features are sourced from the [matrix](02_COMPLETE_FEATURE_MATRIX.md).

| User | Requirement and current foothold | Gap / friction | Proposed default workspace and integration |
|---|---|---|---|
| Everyday users | Know next commitments. Home, Today, capture and tasks. | Dense tool discovery and uncertain sync. | Today, tasks, calendar and notes. Task→schedule→completion. PF-11/14/37 |
| Students | Assignments, notes, deadlines and study. Notes, learning and timers. | Converting class notes to study/review items. | Course cards, class calendar, focus timer and review queue. PF-21 |
| Teachers | Lessons, resources and classroom schedule. Calendar, projects, files. | No defensible permissioned class sharing/export workflow. | Lesson calendar, topic resources, curriculum views and due tasks. PF-21/22 |
| Parents | Chores, appointments, meal organization. Household and Kitchen. | Private vs shared schedule and permission clarity. | Family agenda, grocery, reminders and assignment rotation. PF-18 |
| Families | Shared responsibilities and planning. Profiles, calendars, lists. | Profiles can be mistaken for actual privacy isolation. | Shared household with member scopes and private defaults. PF-04/18 |
| Couples | Plans, division of work and milestones. Household, outings, diary. | Shared calendar and joint spending lack clear scope. | Shared tasks, dates and budgets, separate journals. PF-16/18 |
| Laboratory managers | Backlog, capacity, procurement and QC. Lab dashboard and operating tables. | No verified custody or authenticated lab separation. | Due queue, inventory, procurement, staffing and QC history. PF-23–25 |
| Laboratory analysts | Minimal data entry, clear method and instrument. Lab samples and QC. | Repeated identifiers and method/result lineage. | Assigned assays, barcode intake, procedure version and calculation/report. PF-23/24/33 |
| Scientists | Reproducible calculations and evidence. Lab stats, calculator, notes. | Numeric validation, units and provenance. | Scientific calculator workbook, protocol and reviewed analysis. PF-24/33/40 |
| Researchers | Bibliography, source collection, structured comparisons. Notes graph and files. | Limited attachment indexing and citation lineage. | Research sources, notes, evidence links and comparison/report. PF-10/22/43 |
| Business owners | Budget, projects and capacity. Finance, tasks and sheets. | Proper reconciliation and roles. | Business dashboard, cash view, pipeline and reviewed extracts. PF-13/16/40 |
| Office workers | Deadlines, notes and documents. Today, files and presentations. | Office interchange errors and undifferentiated authoring flow. | Agenda, meeting/task notes, document review, printable summary. PF-08/22 |
| Project managers | Dependencies, milestones and workload. Projects, Kanban, Tasks. | Lack of verified critical path, effort and cross-view history. | Board, timeline, dependencies and risks with one task. PF-09/13 |
| Software developers | Snippets, evidence, external tools. Code Studio and projects. | No general debugger and unresolved isolation. | Design notes, trusted tests, release issues and tool handoff. PF-27/30/48 |
| Game developers | GDD, systems, characters, balance and assets. Game Studio with records and visual tools. | Inferred relationships and volatile stats. | Versioned GDD/entity tables, balance scenarios and playtest evidence. PF-26/27/33 |
| Authors | Manuscript, chronology, characters and export. Book Studio and Notes. | Chapter-based model and export fidelity. | Scene binder, continuity panel, revision and manuscript handoff. PF-07/28/29 |
| Artists | References, drawing and portfolio. Photo, planner decor and Whiteboard. | Limited contextual tooling and export fidelity. | Media, reference board, working canvas and portfolio record. PF-31/32 |
| Designers | Projects, diagrams and decision review. Projects, whiteboard and presentation. | No complete cross-module review and file state. | Brief and assets, canvas, decisions and reviewed presentation. PF-31/40/41 |
| Fitness enthusiasts | Workouts, goals, private trends. Health, habits and diary. | Units, retention and trend privacy need work. | Workout log, optional measure graphs, recovery diary. PF-17/39 |
| Travelers | Booking documents and time zone offline. Trips, FX, files. | Missing confirmed offline pack and attachment readiness. | Trip agenda, packing, private tickets and costs. PF-02/19 |
| Collectors | Flexible catalogs, media and value. Media, records and files. | Separate duplicates and import/scan friction. | Collection schema, items and barcode inventory/template. PF-20/36 |
| Simple planner users | Few controls and stable flow. Today, Calendar, Notes. | Many modules in default discovery path. | Planner Lite with chosen 3–5 destinations and optional expandable details. PF-14 |
| Highly customizable users | Rich dashboards and templates. Custom Tabs, Settings and automation. | Limited reusable schemas and relationships. | Owner-defined groups, record links, reports and safe automation. PF-36/38/44 |

Initial templates can reuse the same schema engine. Review each template with a first-time user and a frequent user. Prefer small, reversible presets with a clear reset and no record movement by default. [Product vision](19_MOBILE_AND_DESKTOP_PRODUCT_VISION.md)
