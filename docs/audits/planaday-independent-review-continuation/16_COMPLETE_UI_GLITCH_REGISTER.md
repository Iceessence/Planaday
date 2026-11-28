# UI glitch register

| ID | Scope | Reproduction and evidence | Disposition |
|---|---|---|---|
| UI-G01 / PD-011 | Chromium Universal Files | Both 320 px profiles measured 146 px overflow in the main stage. Open Universal Files and inspect the filter/tool areas. | Confirmed. Constrain the panel and verify 320–480 px with populated data. |
| UI-G02 / PD-012 | Chromium Projects & Records | Both 320 px profiles measured 21 px stage overflow. | Confirmed. Stack panels at narrow widths and retest editor selection. |
| UI-G03 / PD-019 | Chromium Camera & Photos | Both 320 px profiles measured 32 px main stage overflow. | Confirmed. Stack gallery and editor and test native image fields. |
| UI-G04 / PD-013 | Chromium Physical Planner | Four unnamed controls and two sub-24 px candidates in the blank 320 px view. | Confirmed DOM finding. Test keyboard focus and screen-reader names. |
| UI-G05 / PD-013 | Chromium Calendar and composite workspaces | Small controls appeared in the heuristic output. In desktop All-in-One empty state 48 were flagged and in 320 px 35 were flagged. | Candidate list. Validate actual click target, including clickable ancestors and spacing. |
| UI-G06 / CONT-008 | Firefox 153 desktop and mobile-sized viewport | Opening workspace remained displayed past timeout. Static resources came back successfully and no page exception was captured. | Confirmed on tested engine. In the Firefox diagnostic, the app awaited an unresolved persistent-storage request. A simulated immediate denial let startup proceed. [Differential test](evidence/firefox-storage-control.json) |
| UI-G07 / CONT-005 | Android 10 stock WebView | APK reaches blank/splash state and bundled JS logs syntax failure. | Confirmed in native emulator. Establish WebView support floor and fallback. |
| UI-G08 / PD-009 | Chromium offline | Unvisited lazy studio fails after server stops, despite controlled shell. | Confirmed. Verify route-level asset availability or an actionable offline state. |

[Measured layouts and candidates](evidence/web-chromium/results.json) · [Android shell capture](evidence/android-5566/) · [Firefox diagnostic](evidence/firefox-diagnostic.json) · [Offline run](evidence/notes-followup/browser-results.json)

The responsive harness records document and stage overflow, outside elements, names, sub-24 px candidates, clipping, broken images and focusability candidates. That does not establish device reachability, colour contrast, pinch gestures, keyboard occlusion, semantically correct naming, or WCAG conformance. There is limited dense-data evidence. Representative screenshots live alongside the raw route report.
