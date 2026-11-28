# Proposed additions to the master specification

This document is a draft for owner review. The standalone authoritative specification was unavailable in the reviewed checkout and reference locations. Keep original requirements, previously approved work and source claims traceable. Review statuses below before changing scope.

| Provenance | Examples | Treatment |
|---|---|---|
| Original owner requirements stated in audit brief | Full record lifecycle, offline-first desktop/phone, safe persistence, advanced calendar, Notes and physical mobile reports, Lab, office and creative workflows | Preserve these requirements and crosswalk them to the authoritative original sections when provided. |
| Existing approved requirements | No separate approval record was available. README architecture and v2.1–v4.0 changelog describe intended implementations and constraints. | Use as repository baseline. Keep approval unknown until owner-provided evidence establishes scope. |
| Independently verified missing or faulty behavior | Atomic concurrent saves, two-client blob hydration, clear replacement server restore, cold PWA studio launch, CSV/root correctness | Record as acceptance gaps in release requirements with exact current fixtures and outcomes. |
| Auditor-proposed improvements | Data scopes, restore receipts, responsive form standard, build/protocol versioned state, typed authoritative IDs | Candidate work. Adopt through explicitly recorded acceptance when owner approves. |
| Auditor-proposed new features | Evidence-safe linked documents, decision history with outcomes, recovery rehearsal, cross-domain relationship explorer and time calibration | Candidate concepts with dependency gates in PF-39–49. |
| Experimental ideas | Local AI assistant, trusted template interchange, pure creative simulations, scoped historical analytics | Pilot with opt-in synthetic data and predeclared success criteria. |
| Further research | Mobile exact delivery, Native/PWA parity, statistical criteria, standards and full file formats, large reads/writes | Collect physical-device data and reference workflows before making product-wide claims. |
| Explicit approval | Shared identities/authorization model, external sync/import/federation, AI provider, package market, regulated lab use, migration/rollout | Record decision, data flows and secure configuration before implementation or external transfer. |

## Candidate requirements

| ID | Requirement proposal | Acceptance |
|---|---|---|
| SPEC-P01 | Atomic write, revision and outbox transaction with recoverable state | Disjoint parallel edits retained, write failure does not leave an inconsistent public state, legacy data survives. PF-01 |
| SPEC-P02 | Attachment protocol verifies bytes and reports readiness across eligible clients | Paired clients reconcile scoped referenced hashes after interruption; old backups open. PF-02 |
| SPEC-P03 | Restore manifest covers expected data sources and server identity | Fresh deploy restore verifies rows/blobs and reports clear independent replacement/rebind status. PF-03/42 |
| SPEC-P04 | Trust boundary and permission scopes | Authorized roles, release-safe defaults, route isolation, private cache content and reviewed share revocation. PF-04 |
| SPEC-P05 | Versioned offline-first release lifecycle | Cold unvisited routes run offline after install reports ready; upgrades handle asset update, rollback and pending saves. PF-05 |
| SPEC-P06 | Accessibility and long note qualification | Physical IME, keyboard, 320–tablet, orientation, editable long documents and meaningful state under failure. PF-06/07 |
| SPEC-P07 | Declare checked calculation and file format support | Supported formulas, root behavior, imports and byte-level exports have reference fixtures and user-visible errors. PF-08/33 |
| SPEC-P08 | Canonical edges and versioned, scoped views | All references survive rename/restore or display explicit unavailable state. All derived views use canonical IDs. PF-09/10 |
| SPEC-P09 | Operational Lab trace and controlled analytic history | Document each state change, custody event, method version, correction and result review. Any compliance assessment remains separate. PF-23/24 |
| SPEC-P10 | User-owned automation, export and templates | Limited undoable actions with preview, trace and optional rollbacks, scope-sensitive import and ownership. PF-34/36/45 |
| SPEC-P11 | Approved data-use policy for analytics and AI | Explicit permissions, rationale, offline/off state, source-linked results, privacy-safe diagnostics and no implicit record modification. PF-35/39/40/47 |

Before promotion, record owner approval, priority and supported platforms, the implementation version and the test/design reference. Preserve existing user data and requirements. [Expanded roadmap](21_EXPANDED_PRODUCT_ROADMAP.md)
