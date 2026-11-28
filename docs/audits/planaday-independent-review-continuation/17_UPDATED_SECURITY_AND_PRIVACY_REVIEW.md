# Updated defensive security and privacy review

| Finding | Continuation evidence | Scope |
|---|---|---|
| PD-004 application pairing/authorization | Same source revision. Sensitive server routes register without applicable app-level identity or authorization hooks. Source and normal synthetic sync paths were checked. | 4.0.0 source conclusion. Live Dayplana exact revision and network perimeter unverified. Production record routes were excluded from requests. |
| PD-005 execution boundary | Worker remains same-origin and uses lexical restrictions for dynamic JavaScript. Controlled arithmetic works. | Source-level isolation weakness. Exploit development, bypass and abuse validation were outside the defensive review. |
| PD-014 outbound callbacks | Source leaves proxy and notification destinations without uniform egress/redirect policy. | Source; no private endpoint requests or exploit replay. |
| PD-015 stored attachment integrity | Correct-hash octet stream, PDF and SVG fixtures round-tripped. Source still does not recompute SHA-256 at receipt and writes metadata and data separately. | Defensive review. The positive test verifies transport and expected bytes only. |
| PD-020 native desktop release lifecycle | `desktop/package.json` still pins the unsupported 35 major line. | Manifest and vendor release evidence. Actual Windows binary unavailable. [Electron release schedule](https://releases.electronjs.org/schedule) |
| CONT-001 deployed drift and LAN transport | Production publicly served non-sensitive status and static assets over HTTP from the authorized local address. Dockge confirms `0.0.0.0` with `3000:3000`. TrueNAS console TLS was untrusted from the test command line. | Confirmed LAN-side access. No evidence establishes public internet reach or exact deployed app access control. |
| PD-016 cross-note data integrity | One dirty UI note selection transition wrote draft content to another note and replicated the overwrite to SQLite. | Isolated synthetic workflow. The risk also applies to notes with different sharing scopes if app logic allows the selection. That scope was untested. |

Preserve private data by checking application configuration, synthetic fixtures, build dependencies and metadata rather than user records. Backup exports can contain notes, media and settings, so access and retention should be managed independently from broad backups. The live volume's backups, mount permissions, reverse proxy, firewall and licensed packaged dependencies require separate evidence.

The audit used an existing authenticated TrueNAS browser session for read-only UI metadata. No security setting, owner credential, endpoint trust setting, production container or dataset was changed. [Production observation](13_PRODUCTION_VERSION_COMPARISON.md) · [Storage architecture](12_TRUENAS_DOCKER_STORAGE_VERIFICATION.md)
