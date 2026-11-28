# Desktop functional verification

Audit source `d82bdc7` built with both TypeScript checks and Vite. The 47 checked-in tests passed. Independent evidence uses an exact source archive, temporary browser profiles and synthetic records. These tests ran in Windows, with the isolated Docker test using WSL. [Build](evidence/build.txt) · [Repository tests](evidence/repository-suite.txt)

| Cases | Result |
|---|---|
| WF-001–004 | Tasks, Chores, Goals and Habits & Routines created records that survived reload. |
| WF-005–006 | Pantry Lots and Groceries retained created records after reload. |
| WF-007–008 | Task long description and Project description plus template milestones survived reload. |
| WF-009–011 | Book and chapter, Game project, and Lab sample with linked client and assay persisted. |
| WF-012 | Empty Flow Calendar downloaded under the correct ICS name with a valid VCALENDAR envelope. Event fidelity requires populated fixtures. |
| EX-001–007 | Markdown, DOC, SVG, JavaScript, HTML slide deck, CSV and XLS filename and payload checks all failed. The download placed the intended filename in its body, and the generated content in its filename. |
| BR-001–004 | Cross-profile note text and one disconnect/reconnect passed. PNG transfer and pending draft ownership failed. |
| CAL-001 | Flow Calendar reached 1 and 240 minute zoom endpoints, changed grid geometry and retained the one-minute setting after reload. |
| CAL-002 | A timed event retained its initial start, end and notes in IndexedDB. Adaptive font and geometry increased at fine zoom. After zooming, unchecking the adaptive checkbox did not change its state in this run. The reload assertion is pending. |
| UI-001 | 54 workspace entry points loaded in Chromium desktop using blank and minimally populated profiles. |
| UI-004 | Firefox 153 remained on its opening screen in separate desktop and mobile-sized tests. Static assets returned 200. A differential check isolated an unresolved persistent-storage request. Returning denied in a separate test context allowed startup. |
| UI-005 | Playwright WebKit 26.5 passed load and Notes save/reload on desktop and iPhone-sized viewport. |

[Workflow artifacts](evidence/browser-workflows/results.json) · [Firefox diagnostic](evidence/firefox-diagnostic.json) · [WebKit evidence](evidence/web-webkit/results.json)

The independent engine suite ran 117 assertions, with 111 passes and six failures. Math passed 53/55, unit conversion 24/24, formulas 32/36 and wet/NIR reference calculations 2/2. Spreadsheet failures included a numeric result from the active sheet when another sheet was referenced but absent. Calculator roots included a false positive at a pole and a missed tangent root. See the input-level [reference log](evidence/reference-suite.txt).

An export pass measures the artifact's name and content, independent of the browser claiming a file was downloaded. Deck HTML layout, multimedia/ICS import, populated office and creative workflows, installed Electron behavior, printing and assistive navigation remain open. The tests used normal arithmetic in isolated fixtures for code-studio inspection. [Case catalog](04_COMPLETE_TEST_CATALOG.md)
