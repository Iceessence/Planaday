# Mobile browser verification

Chromium 158 rendered 54 configured workspace entries in a blank and an onboarding sample profile. The run recorded 2,484 route observations including desktop, 11 portrait widths and 11 corresponding landscape geometries across both profiles. Portrait widths were 320, 360, 375, 390, 393, 412, 430, 480, 600, 768 and 1024 CSS pixels. The harness reached each workspace via desktop navigation before resizing. It separately opened Task Calendar from actual mobile menu search in each fixture. A CDP follow-up also created and reloaded a task from mobile navigation, turned the emulated viewport and continued editing a note.

- At 320 CSS px, both fixture profiles reproduced 146 px main-stage overflow in Universal Files, 32 px in Camera & Photos, and 21 px in Projects & Records.
- Physical Planner exposed four unnamed controls at 320 px in the blank fixture. Automated flagging found sub-24 px candidates across multiple layouts. [Glitch register](16_COMPLETE_UI_GLITCH_REGISTER.md)
- Emulated WebKit 26.5 at 393 × 852 passed app startup and a reload-preserved Notes edit. Firefox 153 remained at the opening shell under both tested geometries.
- Browser emulation measured viewport behavior. It did not reproduce an Android or iOS OS keyboard or validate native permissions. Android Gboard was tested separately.

Onboarding sample had two records. Dense states, overlays and dialog boundaries, all-route direct mobile navigation, keyboard accessibility, complex touch gestures and safe-area behavior remain open. [Chromium data](evidence/web-chromium/results.json) · [WebKit](evidence/web-webkit/results.json) · [Notes follow-up](evidence/notes-followup/browser-results.json) · [Native Android](07_ANDROID_APPLICATION_TEST_RESULTS.md)
