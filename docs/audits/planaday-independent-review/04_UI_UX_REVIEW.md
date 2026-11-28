# Desktop, mobile and accessibility

Chrome 158 on Windows loaded the production build in fresh synthetic profiles. A desktop viewport and nine emulated device viewports were exercised on 46 discovered visible route entries in the follow-up. The initial run sampled 20. These figures count entries under default module settings, and include repeated views driven by different selectors. Layout checks measured DOM geometry using default themes and mostly empty states. Real touch, text scaling, OS keyboards, permission dialogs and screen readers require separate testing.

## Verified interface findings

| Surface | Conditions and observation | Repair and verification |
|---|---|---|
| Universal Files | At 320×700 CSS px, the filter extends to x=466. The main area has 146 px of overflow despite the document reporting zero. At 430×932, 36 px remain. The screenshot confirms that search and the list are cut off. | Single-column file list. Put folders in a labelled drawer or selection sheet. Verify at every requested width with long folder names and keyboard open. [Screenshot](evidence/browser-followup/mobile-universal-files-320.png) |
| Projects & Records | Main overflow 21 px at 320–375 and 6 px at 390. Checked with the project workspace in its default starting state. | Use a break-pointed list/detail layout and verify filled custom forms. [Screenshot](evidence/browser-followup/mobile-projects-records-320.png) |
| Camera & Photos | Main overflow 32 px at 320/360, 21 px at 375 and 6 px at 390 in the blank library. | Adapt the grid and toolbar independently of image preview. Recheck filled albums, crop controls and safe-area layout. [Screenshot](evidence/browser-followup/mobile-camera-photos-320.png) |
| Physical Planner | Four buttons lacked common DOM name candidates. Two buttons had at least one side below 24 px at 320. A geometry heuristic marked one Decor button beyond the stage boundary. | Name zoom and icon controls. Offer larger separate page controls and a single-page phone default. Verify browser accessibility tree and touch hit area. [Screenshot](evidence/browser-followup/mobile-physical-planner-320.png) |
| Diary | Five buttons lacked common DOM name candidates in the measured state. | Provide names, pressed/state feedback and progress text for icon/rating interactions. [Screenshot](evidence/browser-followup/mobile-diary-mood-320.png) |
| Flow Calendar and Meal Planner | At 320, 7 Flow Calendar and 28 Meal Planner buttons had at least one side below 24 px. | Improve targets or spacing and verify applicable WCAG exceptions with keyboard checks. The count alone is insufficient for a conformance claim. [Calendar screenshot](evidence/browser/mobile-flow-calendar-320.png) · [WCAG 2.2 criteria](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) |
| Notes | Browser replacements at the same selection preserved the caret after debounce and save. The supplied image at 390 shows the text editor in mobile mode. | Keep list and editor compact, prioritize mandatory controls and use explicit local and remote status. Validate physical IME, paste and close/restore. [Notes screenshot](evidence/browser-followup/mobile-notes-filled-390.png) |

## Workflow and visual review

The desktop paper palette, navigation groups, active states and recurring card vocabulary provide a recognizable product. The persistent sidebar gives breadth at the cost of scanning. The shell supports quick capture and global search from most views. The app has separate view models for calendar, notes, office and lab, with long headers, toolbars and inline fixed sizes across some newer modules. On phones, the navigation sheet maintains access to broad functionality. The first view of a specialist workspace often puts multiple filter/action controls ahead of its main content.

Use a consistent mobile list-to-record route with the leading action visible and the inputs grouped in the record form. Keep workspace selection and search available from the shell. Desktop can keep a side list and inspector for Notes, Lab, design and relationships. A phone version can use a full-height editor plus an attachment/revision sheet. Calendar should start with agenda/day and open its advanced grid settings from one control. Make error and sync states associated with the changed record and keyboard-accessible.

```text
Phone · Notes                  Desktop · Lab
[Back]   Note title   [More]   [Workspace] [Search] [Sync status]
Saved locally · Sync pending  [Queue / filters] [Sample record] [Actions / history]
[Text editor with focus mode]  [Receiving     ] [Analyses     ] [Audit summary]
[Format] [Attach] [Save]       [Due / blocked  ] [Results      ] [Related records]
```

## Remaining verification

Run at 320, 360, 375, 390, 412, 430 and 480 CSS px, tablet, landscape, and 200% text zoom with populated data, alternate themes and actual keyboard. Test keyboard-only dialogs, focus recovery, reading order, charts and drag alternatives. Verify native Gboard, Samsung Keyboard, VoiceOver, TalkBack, pen input, pinch/pan, gesture and keyboard-safe areas. Browser geometry used visible element bounds and excluded intentional horizontal scrollers when possible. It did not test every control or activation path.

[Raw route and viewport checks](evidence/browser-followup/browser-results.json) · [Product vision](19_MOBILE_AND_DESKTOP_PRODUCT_VISION.md)
