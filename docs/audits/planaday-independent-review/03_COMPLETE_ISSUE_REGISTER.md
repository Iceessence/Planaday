# Independent issue register

Reviewed application version 4.0.0, source commit `d82bdc7`. File paths in this register refer to this revision. Module-specific shorthand paths refer to their matching locations in the [source inventory](12_AUDIT_COVERAGE.md). Impact ratings follow the owner's P0–P4 definitions. Source-level or emulation evidence is identified for each finding. Privacy and defensive design are described without offensive validation.

| ID | Severity | Finding |
|---|---|---|
| [PD-001](#pd-001-concurrent-updates-lose-a-disjoint-edit) | P0 | Concurrent updates lose a disjoint edit |
| [PD-002](#pd-002-a-clean-second-client-lacks-synced-attachment-bytes) | P1 | A clean second client lacks synced attachment bytes |
| [PD-003](#pd-003-restored-client-reports-sync-success-against-an-empty-replacement-server) | P1 | Restored client reports sync success against an empty replacement server |
| [PD-004](#pd-004-self-hosted-records-and-configuration-lack-application-layer-access-control) | P0 | Self-hosted records and configuration lack application-layer access control |
| [PD-005](#pd-005-code-worker-lacks-a-separate-security-boundary-for-untrusted-snippets) | P0 | Code worker lacks a separate security boundary for untrusted snippets |
| [PD-006](#pd-006-quoted-csv-round-trip-changes-cell-boundaries) | P1 | Quoted CSV round trip changes cell boundaries |
| [PD-007](#pd-007-graph-root-finder-mistakes-a-pole-for-a-root-and-misses-a-tangency) | P1 | Graph root finder mistakes a pole for a root and misses a tangency |
| [PD-008](#pd-008-several-download-callers-reverse-filename-and-data) | P1 | Several download callers reverse filename and data |
| [PD-009](#pd-009-initial-offline-assets-do-not-include-build-chunks) | P1 | Initial offline assets do not include build chunks |
| [PD-010](#pd-010-50k-and-100k-multiline-insertion-exceeded-browser-harness-timeout) | P1 | 50k and 100k multiline insertion exceeded browser harness timeout |
| [PD-011](#pd-011-file-hub-filter-is-horizontally-clipped-on-phones) | P2 | File Hub filter is horizontally clipped on phones |
| [PD-012](#pd-012-projects-retains-a-two-column-minimum-below-phone-widths) | P2 | Projects retains a two-column minimum below phone widths |
| [PD-013](#pd-013-planner-diary-and-calendar-need-accessible-control-affordances) | P2 | Planner, diary and calendar need accessible control affordances |
| [PD-014](#pd-014-remote-integration-destinations-need-an-outbound-policy) | P1 | Remote integration destinations need an outbound policy |
| [PD-015](#pd-015-blob-publication-does-not-verify-content-identity) | P1 | Blob publication does not verify content identity |
| [PD-016](#pd-016-same-record-buffer-can-target-the-next-selected-record) | P2 | Same-record buffer can target the next selected record |
| [PD-017](#pd-017-release-metadata-and-gates-are-inconsistent) | P2 | Release metadata and gates are inconsistent |
| [PD-018](#pd-018-html-deck-export-omits-slide-rendering-semantics) | P2 | HTML deck export omits slide rendering semantics |
| [PD-019](#pd-019-photo-studio-uses-a-wide-grid-on-phones) | P2 | Photo Studio uses a wide grid on phones |
| [PD-020](#pd-020-desktop-packaging-targets-an-unsupported-electron-line) | P1 | Desktop packaging targets an unsupported Electron line |

## PD-001 Concurrent updates lose a disjoint edit

| Field | Detail |
|---|---|
| Severity and scope | P0 · Notes, shared repository · all |
| Source | `src/core/repository.ts:167–216` |
| Reproduction or inspection | Run the parallel edit case in independent.audit.test.ts. Create a note and start a title patch and body patch in the same turn. |
| Observed | Original title remained, new body remained, both writes produced rev 2 and two queued operations. |
| Expected | Both fields survive with monotonic revisions or an explicit conflict. |
| Evidence and verification | Confirmed in isolated IndexedDB emulator. Read and mutation occur outside a shared transaction, followed by independent outbox/history writes. |
| Impact, including data and security | Persistent loss of a user's edit. No security impact established. |
| Repair and regression coverage | Transact read/merge/record/revision/outbox. Add parallel disjoint and same-field checks plus injected commit failure. |
| Complexity and dependencies | Medium · Dexie transaction and caller migration |

## PD-002 A clean second client lacks synced attachment bytes

| Field | Detail |
|---|---|
| Severity and scope | P1 · Sync, Notes, other local blob consumers · synced platforms |
| Source | `src/core/sync.ts:305–410; src/core/db.ts:528–533` |
| Reproduction or inspection | The attachment test creates a short file and note on A, pushes, then creates a clean logical client B and pulls. |
| Observed | B contains the note, GET of the blob succeeds through the server test harness, and B's blob store is empty. Its sync trace contains only pull. |
| Expected | B can open the same bytes and know whether download is queued or failed. |
| Evidence and verification | Confirmed by independent Fastify injection, client traces and IndexedDB assertions. Sync uploads binaries and pull applies record JSON. Local object URL resolution returns null when bytes are absent. |
| Impact, including data and security | Files can appear missing on new devices. A subsequent local backup can omit unavailable bytes. |
| Repair and regression coverage | Persist referenced download work, verify hashes and make missing/failed state visible. Check byte equality in two real profiles with retry and offline reopening. |
| Complexity and dependencies | Medium/high · attachment references and versioned protocol |

## PD-003 Restored client reports sync success against an empty replacement server

| Field | Detail |
|---|---|
| Severity and scope | P1 · Backup and sync · all synced clients |
| Source | `src/core/backup.ts:63–108; src/core/sync.ts:379–410, 498–520` |
| Reproduction or inspection | Export a local ZIP with a note and cursor 300. Import into a clean client and sync to a new disposable server. |
| Observed | The note was restored locally. The server had zero records and the client reported synced, zero pending. |
| Expected | Reset or reconcile after an explicit replacement workflow and report status from the verified result. |
| Evidence and verification | Confirmed in independent test. Import restores settings and bypasses outbox creation. Client advances a global cursor monotonically. |
| Impact, including data and security | A device replacement can appear safe before important restored records reach the server. |
| Repair and regression coverage | Add server identity and restore manifest, with explicit rebind and requeue. Test replacement and same-server repair separately. |
| Complexity and dependencies | High · sync protocol, backup version compatibility |

## PD-004 Self-hosted records and configuration lack application-layer access control

| Field | Detail |
|---|---|
| Severity and scope | P0 · REST, SSE, backups, blobs · self-hosted server |
| Source | `server/index.ts:28–38, 77–219, 248–279; docker-compose.yml:9–10` |
| Reproduction or inspection | Review registered route policy, bind defaults and origin settings. |
| Observed | Sensitive routes lack identity/role enforcement and the configured network controls form the primary trust boundary. |
| Expected | Private records, files and server configuration require authorization at the service boundary. |
| Evidence and verification | Defensive source finding. Exposure beyond the trusted network and production deployment controls remain unverified. |
| Impact, including data and security | Unauthorized access or modification if the network perimeter permits a connection. Supports prioritizing P0 containment. |
| Repair and regression coverage | Introduce authenticated pairing and scope checks for records, blobs and admin actions with strict origins and secure deployment defaults. Verify role matrix through ordinary authorized workflows. |
| Complexity and dependencies | High · owner-approved identity and compatibility model |

## PD-005 Code worker lacks a separate security boundary for untrusted snippets

| Field | Detail |
|---|---|
| Severity and scope | P0 · Code Studio · Chromium and wrappers that run workers |
| Source | `src/core/sandboxRunner.ts:53–118; src/modules/studio/CodeStudioView.tsx` |
| Reproduction or inspection | Review the worker creation and capability restrictions against the claim of strict isolation. |
| Observed | The dynamic evaluator runs in a same-origin worker, with lexical shadowing as a primary restriction. |
| Expected | Untrusted code has a separate deny-by-default capability boundary with resource limits. |
| Evidence and verification | Defensive source finding. Worker isolation from the React UI is distinct from secure capability isolation. |
| Impact, including data and security | Private local records and remote services may be at risk if untrusted code is executed with ambient capabilities. |
| Repair and regression coverage | Offer trusted personal mode until sandbox isolation can be verified. Use a dedicated isolated execution origin/process and deny storage and network by construction. Validate allowed execution and security configuration. |
| Complexity and dependencies | High · execution isolation design |

## PD-006 Quoted CSV round trip changes cell boundaries

| Field | Detail |
|---|---|
| Severity and scope | P1 · Spreadsheets · all clients |
| Source | `src/core/spreadsheetEngine.ts:405–444` |
| Reproduction or inspection | Export the supplied fixture with a quoted comma, double quotes and embedded newline, then reimport. |
| Observed | Three cells were interpreted as five cells over two rows. |
| Expected | Preserve exact cell values and row/column boundaries. |
| Evidence and verification | Confirmed in independent test. Import splits on newlines and delimiter before handling quoting. |
| Impact, including data and security | Reports and worksheets can persist altered data on import. |
| Repair and regression coverage | Use a dialect-aware parser with preview and clear errors. Verify round-trip and representative external CSV/TSV fixtures. |
| Complexity and dependencies | Medium · spreadsheet import policy |

## PD-007 Graph root finder mistakes a pole for a root and misses a tangency

| Field | Detail |
|---|---|
| Severity and scope | P1 · Calculator · all clients |
| Source | `src/core/mathEngine.ts:330–369` |
| Reproduction or inspection | Evaluate roots on [-1,1] for 1/(x−0.123) and (x−0.123)² using the checked test fixture. |
| Observed | Returns 0.123 for the discontinuity and an empty list for the tangent zero. |
| Expected | Exclude undefined points and either find the tangent zero or present a clear numerical limitation. |
| Evidence and verification | Confirmed in independent engine tests. Sign-change bisection never validates a residual and relies on sample hits for tangencies. |
| Impact, including data and security | Incorrect scientific and mathematical conclusions. |
| Repair and regression coverage | Validate finite residuals and discontinuities, document numerical coverage and test poles, endpoint and repeated roots. |
| Complexity and dependencies | Medium · numerical tolerance and graph API |

## PD-008 Several download callers reverse filename and data

| Field | Detail |
|---|---|
| Severity and scope | P1 · Spreadsheets, Presentation, Book, Whiteboard, Code Studio · all clients |
| Source | `src/core/backup.ts:112–122; SpreadsheetView.tsx:533,544; PresentationView.tsx:278; BookStudioView.tsx:161,167; WhiteboardView.tsx:160; CodeStudioView.tsx:329` |
| Reproduction or inspection | Compare calls to the content-first helper. For a UI check, create an item, use the corresponding export control and inspect download name and bytes. |
| Observed | Affected calls pass the intended filename as the payload and the intended payload as the filename argument. |
| Expected | Export valid content under the expected extension and sanitized file name. |
| Evidence and verification | Deterministic source mismatch for the listed callers. Chrome and Edge captured Whiteboard's download anchor. Its suggested filename began with SVG markup, and the blob contained `Whiteboard 1.svg`. The other callers were reviewed in source. [Chrome workflow](evidence/browser-workflows/browser-results.json) · [Edge workflow](evidence/edge-workflows/browser-results.json) |
| Impact, including data and security | Invalid or misleading export and lost portability. A browser-suggested filename may include user content. |
| Repair and regression coverage | Correct argument order or use a typed named-argument interface and verify bytes/mime/extension through each UI. |
| Complexity and dependencies | Low · download API and callers |

## PD-009 Initial offline assets do not include build chunks

| Field | Detail |
|---|---|
| Severity and scope | P1 · PWA · service-worker browsers |
| Source | `public/sw.js:3–14, 35–59; src/App.tsx:44–57` |
| Reproduction or inspection | Use a clean profile. Wait for worker control and stop the isolated server before visiting Whiteboard Canvas. |
| Observed | Required JS was absent from the CORE_ASSETS list. Network-only emulation passed, actual server shutdown failed in follow-up. |
| Expected | After install complete, bundled workspace assets remain available with its origin offline. |
| Evidence and verification | Source confirmed and browser follow-up case logged. Service worker installs only four shell URL entries and caches other resources opportunistically. |
| Impact, including data and security | Features may be unreachable offline on a new installation. |
| Repair and regression coverage | Bundle a manifest of build assets and precache by build ID. Verify true offline start, unvisited routes and upgrade rollover. |
| Complexity and dependencies | Medium · build/service worker lifecycle |

## PD-010 50k and 100k multiline insertion exceeded browser harness timeout

| Field | Detail |
|---|---|
| Severity and scope | P1 · Notes · Chrome 158 at 390 × 844 |
| Source | `src/modules/mind/NotesView.tsx:424–428, 1159–1195; src/components/Common/SafeTextEditor.tsx:131–173` |
| Reproduction or inspection | In a clean Notes document, use the large insertion scenario in the browser evidence runner. |
| Observed | 50k insertion did not finish within a 30 s CDP request. The 100k stage timed out on its next interaction during the same run. |
| Expected | Large multiline insertion completes with bounded latency and meaningful UI feedback. |
| Evidence and verification | Browser automation observed timeout. Native keyboard, OS clipboard, true crash and component-vs-browser root cause are unverified. |
| Impact, including data and security | Long notes and pastes may disrupt ongoing work. No persisted loss independently established in this case. |
| Repair and regression coverage | Profile renderer and browser editing separately. Benchmark paste and small edits on preloaded notes, then move whole-buffer derivations off the interaction path if measured. |
| Complexity and dependencies | Medium/high · profiling and editor design |

## PD-011 File Hub filter is horizontally clipped on phones

| Field | Detail |
|---|---|
| Severity and scope | P2 · File Hub · Adaptive mobile |
| Source | `src/modules/studio/FileManagerView.tsx:132,179; src/styles/shell.css:576–580` |
| Reproduction or inspection | Open Universal Files on a 320, 390 or 430 CSS-pixel viewport with the default workspace. |
| Observed | Filter input's right edge was at x=466 on each measured 320–430 px width. At 320 px main scroll width exceeded client width by 146 px. |
| Expected | Filter is fully visible and reachable without horizontal panning. |
| Evidence and verification | Confirmed by browser DOM geometry. Inline two-column minimum widths exceed the main area, which clips overflow. |
| Impact, including data and security | Search in a narrow layout is visually and functionally impaired. |
| Repair and regression coverage | Use a single-column narrow layout with an accessible folder picker. Assert input edge and keyboard reachability at each width. |
| Complexity and dependencies | Low · shared responsive split layout |

## PD-012 Projects retains a two-column minimum below phone widths

| Field | Detail |
|---|---|
| Severity and scope | P2 · Projects & Records · Adaptive mobile |
| Source | `src/modules/creative/ProjectsView.tsx:178,370; src/styles/shell.css:576–580` |
| Reproduction or inspection | Open Projects & Records on a 320–390 px phone viewport. |
| Observed | Main-area overflow was 21 px at widths 320–375 and 6 px at 390. No outside control was reported in that blank state. |
| Expected | List and editor fit the viewport and all editable fields remain reachable after creation. |
| Evidence and verification | Confirmed as geometry. Filled-state clipping and exact impact need follow-up. |
| Impact, including data and security | Long labels and detail forms can increase overflow. |
| Repair and regression coverage | Use list/detail responsive surfaces and add small-width tests with filled projects and custom schemas. |
| Complexity and dependencies | Low/medium · shared responsive split layout |

## PD-013 Planner, diary and calendar need accessible control affordances

| Field | Detail |
|---|---|
| Severity and scope | P2 · Physical Planner, Diary, Flow Calendar · desktop and mobile |
| Source | `src/modules/planner/DigitalPlannerView.tsx:420–429; src/modules/mind/DiaryView.tsx; src/modules/plan/FlowCalendarView.tsx` |
| Reproduction or inspection | Open each workspace at 320 px and inspect visible buttons with the browser audit. Focus through title/zoom/calendar controls. |
| Observed | Planner had four potentially unnamed buttons. Diary had five. Flow Calendar had seven buttons with a side below 24 px. |
| Expected | Controls have accessible names, keyboard focus and target size or applicable spacing exceptions. |
| Evidence and verification | DOM heuristic and source evidence. Full accessibility tree, exceptions, screen-reader usability and keyboard workflows unverified. |
| Impact, including data and security | Navigation and editing actions can be unclear for keyboard, assistive and touch users. |
| Repair and regression coverage | Add explicit names, visible focus and target spacing. Verify computed accessibility tree and native screen readers before conformance claims. |
| Complexity and dependencies | Medium · controls, layout and test fixtures |

## PD-014 Remote integration destinations need an outbound policy

| Field | Detail |
|---|---|
| Severity and scope | P1 · Recipe, ICS and relay · server |
| Source | `server/recipeProxy.ts:189–209; server/icsProxy.ts:1–14; server/index.ts:250–279` |
| Reproduction or inspection | Review destination validation, redirects, response cap and server deployment configuration. |
| Observed | Reviewed integrations accept broadly configurable destinations with incomplete common restrictions. |
| Expected | Explicitly allowed destinations, authenticated actions, safe redirects and resource bounds. |
| Evidence and verification | Defensive source review. No host probing or exploit validation was performed. |
| Impact, including data and security | An overly broad trust boundary can expose network services or resources from the deployment. |
| Repair and regression coverage | Introduce one bounded outbound client and verified safe configuration. Review policy and ordinary allowlisted requests. |
| Complexity and dependencies | Medium · integration proxy and relay preferences |

## PD-015 Blob publication does not verify content identity

| Field | Detail |
|---|---|
| Severity and scope | P1 · Attachment storage · server |
| Source | `server/blobs.ts:23–43; server/index.ts:192–218` |
| Reproduction or inspection | Trace ordinary attachment upload and verify the contract between the provided digest and persisted bytes. |
| Observed | Hash shape is checked. Content hash verification and atomic paired publication are absent in source. |
| Expected | Digest matches bytes and readers see complete metadata/bytes after authenticated publication. |
| Evidence and verification | Source confirmed. Normal correct-hash upload and reopen passed. No adversarial upload was attempted. |
| Impact, including data and security | Interrupted or inconsistent writes can violate attachment identity. Caller-derived MIME and public caching also need review. |
| Repair and regression coverage | Verify SHA-256, stage writes, use protected caching and test restart during an ordinary upload. |
| Complexity and dependencies | Medium · blob storage and auth |

## PD-016 Same-record buffer can target the next selected record

| Field | Detail |
|---|---|
| Severity and scope | P2 · Notes, shared buffered editor · all clients |
| Source | `src/components/Common/SafeTextEditor.tsx:51–112; src/modules/mind/NotesView.tsx:197–244` |
| Reproduction or inspection | Review the recordKey change path and onCommitRef update. Cover a dirty record switch without relying on blur completing first. |
| Observed | Old buffer is flushed through a callback reference overwritten by the new render. |
| Expected | Pending content is durably bound to its originating note before hydration. |
| Evidence and verification | Source-level race candidate. The normal browser selected-range tests did not establish cross-record corruption. |
| Impact, including data and security | A dirty transition may lose an edit or write it into another note depending on event ordering. |
| Repair and regression coverage | Bind commit sink to record key, serialize flush/rebind and simulate blurless transition, failed save and concurrent remote state. |
| Complexity and dependencies | Medium · editor buffering and repository transactions |

## PD-017 Release metadata and gates are inconsistent

| Field | Detail |
|---|---|
| Severity and scope | P2 · Web, Electron, Docker, Android release |
| Source | `package.json:2–5; desktop/package.json:2–4; README.md:1–7; server/index.ts:77–85; .github/workflows/build-apps.yml; .github/workflows/docker-publish.yml` |
| Reproduction or inspection | Compare published version literals and CI workflow commands at this revision. |
| Observed | Root package 2.0.0, Electron 2.1.0, app/API 4.0.0. Packaging/publish do not gate on test execution. |
| Expected | One displayed release identity and standalone artifacts traceable to independent checks. |
| Evidence and verification | Confirmed source/config difference. Native artifacts were unavailable. |
| Impact, including data and security | Users may misidentify installed releases and CI can produce artifacts that bypass verification. |
| Repair and regression coverage | Derive release fields from one manifest, lock native dependencies and gate publish on type/build/test plus package acceptance. |
| Complexity and dependencies | Low/medium · release pipeline |

## PD-018 HTML deck export omits slide rendering semantics

| Field | Detail |
|---|---|
| Severity and scope | P2 · Presentations · all clients |
| Source | `src/modules/studio/PresentationView.tsx:262–299` |
| Reproduction or inspection | Compare HTML export mapping with live rendering. Fixture should contain a table, image, rotated object and presenter notes. |
| Observed | Export flattens elements into text containers, including image filenames. The current converter has no matching renderer for images, tables, rotation or playback transitions. |
| Expected | Document format limits and preserve supported visual semantics in HTML. |
| Evidence and verification | Confirmed by source review even after download parameter repair. Export rendering was not run in a second app. |
| Impact, including data and security | Users can lose visual content in shared or archived decks. |
| Repair and regression coverage | Build a stand-alone renderer and execute file-based tests with matching slide objects. |
| Complexity and dependencies | Medium · export model and attachment lookup |

## PD-019 Photo Studio uses a wide grid on phones

| Field | Detail |
|---|---|
| Severity and scope | P2 · Camera & Photos, Adaptive mobile |
| Source | `src/modules/studio/PhotoStudioView.tsx:268–270` and `src/styles/shell.css:576–580` |
| Reproduction | Open Camera & Photos in a new profile at 320×700, 360×800 or 390×844 CSS px. Inspect the main region and preview panel. |
| Observed | The main area's scroll width exceeded its client width by 32 px at 320/360, 21 px at 375 and 6 px at 390. The blank state did not flag an individual input outside the viewport. |
| Expected | Library, actions and preview remain available within the narrow viewport. |
| Evidence and verification | Chrome geometry confirms overflow in the blank library. Filled album, editing, touch and camera behavior remain unverified. [Screenshot](evidence/browser-followup/mobile-camera-photos-320.png) |
| Root cause | Inline two-column track minimum combines with the preview/content minimum. |
| Impact, including data and security | The narrow form risks clipped content as populated data or editing controls widen the layout. No data or security effect was established. |
| Repair and regression coverage | Use the shared narrow list/detail layout and verify a populated album with captions, editor and keyboard at all measured widths. |
| Complexity and dependencies | Low/medium · responsive split layout, preview controls and feature fixtures. |

## PD-020 Desktop packaging targets an unsupported Electron line

| Field | Detail |
|---|---|
| Severity and scope | P1 · Packaged Windows Electron desktop |
| Source | `desktop/package.json:32–35` and `.github/workflows/build-apps.yml:109–118` |
| Reproduction or inspection | Compare the declared Electron semver line with the vendor's release schedule. |
| Observed | The desktop build declares Electron `^35.0.0`. Electron lists September 2, 2025 as the end of life for this major. |
| Expected | A pinned, supported Electron line with an upgrade and security update procedure. |
| Evidence and verification | Manifest and vendor schedule independently checked. The exact binary and installed desktop artifact remain unverified. [Electron releases](https://releases.electronjs.org/schedule) |
| Impact, including data and security | The runtime behind new builds using the declared major no longer receives Electron fixes. Users' offline profiles need a compatibility check before upgrade. |
| Repair and regression coverage | Select a supported line, pin dependencies, then test packaging, context isolation, local service, launch and upgrade with a disposable existing profile. |
| Complexity and dependencies | Medium · Electron/Node compatibility, native packaging and artifact acceptance. |

Evidence files: [independent suite](evidence/independent-suite.txt), [browser matrix](evidence/browser/browser-results.json), [follow-up browser](evidence/browser-followup/browser-results.json), and [UI screenshots](04_UI_UX_REVIEW.md).
