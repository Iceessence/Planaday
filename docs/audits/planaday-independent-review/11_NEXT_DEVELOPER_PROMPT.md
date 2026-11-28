# Next developer assignment

Work from commit `d82bdc7` or document the descendant and relevant intervening fixes. Deliver a data-integrity and release-safety batch. Use disposable browser profiles, SQLite directories and synthetic fixtures throughout. Keep the audit evidence intact.

1. **Make concurrent domain writes durable.** In `src/core/repository.ts` and `src/core/db.ts`, read the latest record inside the same transaction that applies the patch, revision and outbox change. Define the policy for same-field conflicts and make failed transaction state observable. In `SafeTextEditor.tsx` and `NotesView.tsx`, bind flushes to the draft's original record key and serialize commits and hydration.
2. **Make attachment sync bidirectional.** In `src/core/sync.ts`, `src/core/db.ts`, `server/index.ts` and `server/blobs.ts`, add durable download scheduling and integrity checks for referenced bytes. A failed upload/download must surface as an attachment retry state. Preserve existing SHA references, thumbnails and user files.
3. **Make restore state explicit.** In `src/core/backup.ts` and `sync.ts`, define a snapshot manifest and explicit replacement/rebind flow. Verify server identity and cursor epoch. Restore settings, records and blobs coherently and publish to replacement storage through a visible, reviewable reconciliation.
4. **Gate sensitive deployment.** Protect sync, storage, blob and admin routes, narrow origins, and choose the migration UI for private self-host, paired devices and offline. Harden outbound integrations and retain an explicit trusted-snippet experience until Code Studio has a separate verified capability boundary.
5. **Keep failure signals visible.** Show locally saved, pending record/attachment state, conflict, incompatible server and last verified backup separately. Export support diagnostics with no note bodies, file contents or relay credentials.

## Independent acceptance

- Race 1,000 disjoint field updates in isolated test cases and compare final fields, monotonic revisions and pending ops. Inject write failure and confirm all-or-nothing behavior. Include Notes title/body edits, record switching, workspace switching and app closure.
- Pair two clean local profiles, sync a note with an attachment, verify exact bytes on both and open them offline once downloaded. Simulate transient interruption and explicit server replacement. Check deleted references, retries, partial upload, duplicate requests and clear state.
- Restore a ZIP and full server dataset into fresh locations, verify record/ref counts and hashes, and compare status during partial restore and failed restart. Verify restored client cannot present a healthy sync state while publishing is pending.
- Validate security controls against an approved role and deployment matrix using synthetic data. Confirm fully offline entry points stay available, and verify ordinary authorized workflows before release.
- Rerun all 47 baseline tests plus the independent cases. Add stable browser and physical keyboard checks for selection, composition, overlapping edits and locked-phone notifications. Record build and artifact versions and produce a before/after acceptance table.

Preserve existing IndexedDB and SQLite identities, offline-first operations, record identifiers, named revisions, local backups and legacy import compatibility. Include a migration/rollback plan and release notes. Gate unrelated feature expansion until data durability is verified. See [reproduction and severity](03_COMPLETE_ISSUE_REGISTER.md) and [test evidence](09_TEST_RESULTS_AND_EVIDENCE.md).
