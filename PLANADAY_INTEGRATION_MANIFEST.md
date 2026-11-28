# PLANADAY — 108-File Upgrade Package Integration Manifest (`PLANADAY_INTEGRATION_MANIFEST.md`)

**Integration Branch:** `integrate/final-upgrade-package`  
**Base Commit (`main`):** `f3f57d3e44f784b28636d861fd8cb1f8e121f68a` (exact match to `UPGRADE_MANIFEST.json` `base_commit`)  
**Pre-Integration Backup Tag:** `backup/pre-final-upgrade-f3f57d3`  
**Package Verified:** `Planaday_Final_Upgrade_Package.zip` — `108/108` candidate files matched `UPGRADE_MANIFEST.json` `final_sha256` byte-for-byte before integration.  
**Final Disposition Summary:** `90` **applied** (byte-exact archive match) · `18` **merged** (archive candidate applied + integration regression fix and/or deep performance optimization) · `0` superseded · `0` blocked · `0` skipped.

---

## 1. Complete 108-File Integration Table

| # | File Path | Batches | Pre-Integration State | Disposition | Base SHA | Archive SHA | Final SHA | Notes |
|---:|---|---|---|---|---|---|---|---|
| 1 | `src/App.tsx` | B6 | Exact base match | **merged** | `28651e9a66` | `bde96a7296` | `9f6bee2a45` | Applied Batch 6 candidate + lazy-loaded DecorCanvasOverlay to remove DecorCanvas/stickers from cold boot. |
| 2 | `src/components/Common/ClockWidget.tsx` | B4 | Exact base match | **applied** | `0885687ef3` | `fe0ba1a9f3` | `fe0ba1a9f3` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 3 | `src/components/Common/CommandPalette.tsx` | B4 | Exact base match | **applied** | `18cba314f8` | `9e1e40738e` | `9e1e40738e` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 4 | `src/components/Common/GlobalAlarmRingModal.tsx` | B4 | Exact base match | **applied** | `857441e000` | `3280277107` | `3280277107` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 5 | `src/components/Common/GlobalSearchDialog.tsx` | B4 | Exact base match | **applied** | `6716202812` | `168e04ebfe` | `168e04ebfe` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 6 | `src/components/Common/ModalDialog.tsx` | B4 | Exact base match | **applied** | `2344f74578` | `3410f8251f` | `3410f8251f` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 7 | `src/components/Common/QuickCaptureDialog.tsx` | B4 | Exact base match | **applied** | `f70a7c9091` | `6a18f7eb34` | `6a18f7eb34` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 8 | `src/components/Common/SafeTextEditor.tsx` | B4 | Exact base match | **applied** | `aee42b39aa` | `05fd1b906b` | `05fd1b906b` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 9 | `src/components/Common/SortFilterBar.tsx` | B4 | Exact base match | **applied** | `c70c82212a` | `c5e4ed1ade` | `c5e4ed1ade` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 10 | `src/components/Common/TabSettingsDrawer.tsx` | B4 | Exact base match | **applied** | `3944536dfa` | `a475a29842` | `a475a29842` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 11 | `src/components/Common/ToastStack.tsx` | B4 | Exact base match | **merged** | `048ca6ab74` | `7b73ba5d54` | `fcf46e27b9` | Applied Batch 4 candidate + switched to isolated useToasts() hook & React.memo. |
| 12 | `src/components/Common/WeatherCard.tsx` | B4 | Exact base match | **applied** | `ad4789a259` | `afccd3c2fd` | `afccd3c2fd` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 13 | `src/components/Common/viewSafety.ts` | B5 | New file | **applied** | `NEW` | `2bdd6dfed4` | `2bdd6dfed4` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 14 | `src/components/Decor/DecorCanvas.tsx` | B4 | Exact base match | **applied** | `5052399e4c` | `ded294c3c9` | `ded294c3c9` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 15 | `src/components/Settings/OnboardingModal.tsx` | B4 | Exact base match | **applied** | `00f05397e6` | `5b585c83fe` | `5b585c83fe` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 16 | `src/components/Settings/SettingsView.tsx` | B4 | Exact base match | **merged** | `73aa8db279` | `78933fe2e1` | `cba12be7ff` | Applied Batch 6 candidate + subscribed via isolated useSyncState() hook. |
| 17 | `src/components/Settings/TrashView.tsx` | B4 | Exact base match | **applied** | `8fcc1b29e9` | `346ca703ae` | `346ca703ae` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 18 | `src/components/Shell/MiniBar.tsx` | B4 | Exact base match | **merged** | `48afb0192a` | `b57b9e8999` | `f07a30b3cc` | Applied Batch 4 candidate + wrapped in React.memo to skip unrelated shell rerenders. |
| 19 | `src/components/Shell/MobileNav.tsx` | B4 | Exact base match | **applied** | `af0cdd9ee1` | `4b78b46afc` | `4b78b46afc` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 20 | `src/components/Shell/Sidebar.tsx` | B4 | Exact base match | **merged** | `ef1501e468` | `e3c5595d5c` | `07c02cf87e` | Applied Batch 4 candidate + wrapped in React.memo & isolated useSyncState() subscription. |
| 21 | `src/components/Shell/TopBar.tsx` | B4 | Exact base match | **merged** | `7face35a71` | `0fc7a56dc9` | `00edba9879` | Applied Batch 4 candidate + wrapped in React.memo & isolated useSyncState() subscription. |
| 22 | `src/core/AppContext.tsx` | B4 | Exact base match | **merged** | `0f090a9780` | `725512d9b4` | `46c3f744af` | Applied Final Pass candidate + split ToastProvider/SyncStateProvider/AppCoreProvider, memoized provider value, stable per-domain slices & scoped native notification effects. |
| 23 | `src/core/alarmSchedule.ts` | B4 | Exact base match | **applied** | `326aaea5fc` | `8147f7ba13` | `8147f7ba13` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 24 | `src/core/audio.ts` | B4 | Exact base match | **applied** | `037fc8f62a` | `329d354a3f` | `329d354a3f` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 25 | `src/core/automations.ts` | B4 | Exact base match | **applied** | `2022875b1a` | `396b797d26` | `396b797d26` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 26 | `src/core/backup.ts` | B4 | Exact base match | **applied** | `5b60314b4f` | `7cc6fe6120` | `7cc6fe6120` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 27 | `src/core/blobCache.ts` | Final | Exact base match | **applied** | `ef04537347` | `187f7d0de8` | `187f7d0de8` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 28 | `src/core/capture.ts` | B4 | Exact base match | **applied** | `444917604c` | `cdd2e83fac` | `cdd2e83fac` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 29 | `src/core/dailyNotes.ts` | B5 | Exact base match | **applied** | `629607fbda` | `8cba5ca795` | `8cba5ca795` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 30 | `src/core/db.ts` | B4 | Exact base match | **applied** | `5f81f1c7ee` | `b5a13bcfde` | `b5a13bcfde` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 31 | `src/core/ics.ts` | B4 | Exact base match | **applied** | `ddd19506f4` | `dfe96341d7` | `dfe96341d7` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 32 | `src/core/kitchenActions.ts` | B4, B5 | Exact base match | **applied** | `035e89db1c` | `4b7d4c22ed` | `4b7d4c22ed` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 33 | `src/core/labStats.ts` | B4 | Exact base match | **merged** | `b281392a03` | `146a9ca74d` | `6ff0816613` | Applied Batch 4 candidate + restored exact 1.0 pearsonR precision on finite sxx*syy while preserving overflow-safe fallback (LA-001). |
| 34 | `src/core/mathEngine.ts` | B4 | Exact base match | **applied** | `14d4f7fb3b` | `788dfb22bb` | `788dfb22bb` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 35 | `src/core/mindActions.ts` | B4, B5 | Exact base match | **applied** | `6921d6a2ee` | `0e2666d518` | `0e2666d518` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 36 | `src/core/nativeAlarms.ts` | B4 | Exact base match | **applied** | `080bdeb3c2` | `846af2c551` | `846af2c551` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 37 | `src/core/planActions.ts` | B4 | Exact base match | **applied** | `43d4ce6168` | `d5362d74e5` | `d5362d74e5` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 38 | `src/core/recurrence.ts` | B4 | Exact base match | **applied** | `a842ed86f5` | `763bf6b62a` | `763bf6b62a` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 39 | `src/core/releaseInfo.ts` | B4 | Exact base match | **applied** | `efadef7dec` | `e8e50cd633` | `e8e50cd633` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 40 | `src/core/repository.ts` | B4 | Exact base match | **applied** | `5e0d504ea5` | `f3ccbb7b98` | `f3ccbb7b98` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 41 | `src/core/sandboxRunner.ts` | B4 | Exact base match | **applied** | `be6e019ec5` | `295f8d0ccf` | `295f8d0ccf` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 42 | `src/core/sanitizer.ts` | B4 | Exact base match | **applied** | `9104d8ad1a` | `1626240c98` | `1626240c98` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 43 | `src/core/search.ts` | B4 | Exact base match | **applied** | `f0124ac22c` | `9119457040` | `9119457040` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 44 | `src/core/searchIndex.ts` | Final | Exact base match | **merged** | `a846791f93` | `10c98f86fb` | `122e7ed665` | Applied Final Pass candidate + avoided off-page SearchHit/snippet allocations and replaced ISO localeCompare with direct lexicographical compare. |
| 45 | `src/core/spreadsheetEngine.ts` | B4 | Exact base match | **merged** | `1e8d8b4cc0` | `f1b8f6e98e` | `82a624276c` | Applied Batch 4 candidate + added IncrementalWorkbookEvaluator dependency-graph recalculation with #CIRC! & volatility tracking. |
| 46 | `src/core/sync.ts` | B4 | Exact base match | **merged** | `41ccbabd8b` | `5c31303cf5` | `616dce16bf` | Applied Batch 4 candidate + added cross-realm AbortSignal TypeError fallback while preserving real AbortController cancellation. |
| 47 | `src/core/taskScheduler.ts` | B4 | Exact base match | **applied** | `3dfb46a075` | `a90d4e22c9` | `a90d4e22c9` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 48 | `src/core/temporal.ts` | B4 | Exact base match | **applied** | `7f84210de3` | `38d15d2475` | `38d15d2475` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 49 | `src/core/types.ts` | B4 | Exact base match | **applied** | `4946b4adc1` | `2d2f134500` | `2d2f134500` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 50 | `src/core/weather.ts` | B4 | Exact base match | **merged** | `643803233b` | `886c4f35b9` | `11e89da4fd` | Applied Batch 4 candidate + added cross-realm AbortSignal TypeError fallback while preserving real AbortController cancellation. |
| 51 | `src/data/changelog.ts` | B4 | Exact base match | **merged** | `6a51d01f5a` | `587aa3ca68` | `e8f225da5b` | Applied Batch 4/6 candidate + unified authoritative 4.2.0 entry documenting 108-file integration, performance optimizations, and security/GPU hardening. |
| 52 | `src/data/densities.ts` | B4 | Exact base match | **applied** | `ca862b4a6b` | `d516a62fec` | `d516a62fec` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 53 | `src/data/facts.ts` | B4 | Exact base match | **applied** | `e17dcb0288` | `d932224928` | `d932224928` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 54 | `src/data/prompts.ts` | B4 | Exact base match | **applied** | `12bdfc61fb` | `0bb4da1927` | `0bb4da1927` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 55 | `src/data/sampleData.ts` | B4 | Exact base match | **applied** | `acfa234a15` | `b71c75798a` | `b71c75798a` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 56 | `src/data/stickers.ts` | B4 | Exact base match | **applied** | `ddff58a45f` | `00522f0ebb` | `00522f0ebb` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 57 | `src/data/themes.ts` | B4 | Exact base match | **applied** | `854948e5cd` | `9d8cd4c2e6` | `9d8cd4c2e6` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 58 | `src/main.tsx` | B6 | Exact base match | **applied** | `00304f7fc1` | `1009596279` | `1009596279` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 59 | `src/modules/creative/BookStudioView.tsx` | B6 | Exact base match | **applied** | `0370821633` | `a30e5c04f8` | `a30e5c04f8` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 60 | `src/modules/creative/GameDevView.tsx` | B6 | Exact base match | **applied** | `b77ce22d88` | `f1818f9a89` | `f1818f9a89` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 61 | `src/modules/creative/ProjectsView.tsx` | B6 | Exact base match | **applied** | `e4d905ebad` | `5535eba394` | `5535eba394` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 62 | `src/modules/kitchen/GroceryView.tsx` | B5 | Exact base match | **applied** | `d21a49384a` | `795040b773` | `795040b773` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 63 | `src/modules/kitchen/MealsView.tsx` | B5 | Exact base match | **applied** | `c02df7fc97` | `75c19d6d3a` | `75c19d6d3a` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 64 | `src/modules/kitchen/PantryView.tsx` | B5 | Exact base match | **applied** | `57520771c0` | `b60bb363ad` | `b60bb363ad` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 65 | `src/modules/kitchen/RecipesView.tsx` | B5 | Exact base match | **applied** | `bb5f36dad8` | `4aa92e6ed6` | `4aa92e6ed6` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 66 | `src/modules/lab/LabWetNirView.tsx` | B5 | Exact base match | **applied** | `54fc5cbc2a` | `2f937d68fd` | `2f937d68fd` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 67 | `src/modules/lab/LabWorkspaceView.tsx` | B5 | Exact base match | **applied** | `fabe627dcb` | `52d2bb1a9e` | `52d2bb1a9e` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 68 | `src/modules/life/AllInOneView.tsx` | B6 | Exact base match | **applied** | `792ece66a5` | `d2f0a448bf` | `d2f0a448bf` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 69 | `src/modules/life/CustomTabView.tsx` | B6 | Exact base match | **applied** | `bd3d8e33f9` | `2cca18f166` | `2cca18f166` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 70 | `src/modules/life/FinanceView.tsx` | B6 | New file | **applied** | `1149edece4` | `f330f12e46` | `f330f12e46` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 71 | `src/modules/life/GuideView.tsx` | B6 | Exact base match | **applied** | `38723c3ef2` | `182de7a572` | `182de7a572` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 72 | `src/modules/life/HistoryView.tsx` | B6 | Exact base match | **applied** | `cd73c0b719` | `dda10583de` | `dda10583de` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 73 | `src/modules/life/HouseholdHealthView.tsx` | B6 | Exact base match | **merged** | `78a5f43cf5` | `44c4c0b55e` | `38875c023e` | Applied Batch 6 candidate + restored `${pills} doses left` formatting for finite stock while preserving unknown-stock handling. |
| 74 | `src/modules/life/LearningMediaView.tsx` | B6 | Exact base match | **applied** | `5dc58db9ed` | `1f94036dd2` | `1f94036dd2` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 75 | `src/modules/life/ReportsView.tsx` | B6 | Exact base match | **applied** | `9eda1d97b7` | `eb80f469cc` | `eb80f469cc` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 76 | `src/modules/life/StudioExtrasView.tsx` | B6 | Exact base match | **applied** | `cc9e636f1c` | `2cc2f6d5a8` | `2cc2f6d5a8` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 77 | `src/modules/life/TravelPeopleHomeView.tsx` | B6 | Exact base match | **applied** | `e94c5cac34` | `20838817e0` | `20838817e0` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 78 | `src/modules/mind/DiaryView.tsx` | B4, B5 | Exact base match | **merged** | `de742a41ff` | `7a24783935` | `98b0f657c7` | Applied Batch 5 candidate + switched to isolated useSyncState() subscription. |
| 79 | `src/modules/mind/LifeEventsView.tsx` | B5 | Exact base match | **applied** | `ba2307ee87` | `129677d5b4` | `129677d5b4` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 80 | `src/modules/mind/NotesView.tsx` | B5 | Exact base match | **merged** | `4639095d88` | `1420111d06` | `3e1b9186be` | Applied Batch 5 candidate + switched to isolated useSyncState() subscription. |
| 81 | `src/modules/mind/ThoughtInboxView.tsx` | B5 | Exact base match | **applied** | `145514015f` | `4bdcc2eebc` | `4bdcc2eebc` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 82 | `src/modules/plan/ChoresView.tsx` | B5 | Exact base match | **applied** | `88c2d61e17` | `34b7db92f0` | `34b7db92f0` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 83 | `src/modules/plan/FlowCalendarView.tsx` | B5 | Exact base match | **applied** | `20666cdab2` | `c1384dab27` | `c1384dab27` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 84 | `src/modules/plan/GoalsHabitsView.tsx` | B5 | Exact base match | **applied** | `98522aa20a` | `5b1f8be34f` | `5b1f8be34f` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 85 | `src/modules/plan/HomeDashboard.tsx` | B5 | Exact base match | **applied** | `1774a829f1` | `955a051142` | `955a051142` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 86 | `src/modules/plan/PeriodPlannerView.tsx` | B5 | Exact base match | **applied** | `7c638b74f6` | `c17d9aee3a` | `c17d9aee3a` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 87 | `src/modules/plan/QuickGlanceView.tsx` | B5 | Exact base match | **applied** | `3c793937d8` | `25f611c5b6` | `25f611c5b6` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 88 | `src/modules/plan/TaskCalendarView.tsx` | B5 | Exact base match | **applied** | `cf9cfe198a` | `32a08c5150` | `32a08c5150` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 89 | `src/modules/plan/TasksView.tsx` | B5 | Exact base match | **applied** | `5911d95a1d` | `87bb955069` | `87bb955069` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 90 | `src/modules/plan/TodaySpread.tsx` | B5 | Exact base match | **applied** | `ee9a2335fb` | `83d6977da5` | `83d6977da5` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 91 | `src/modules/planner/DigitalPlannerView.tsx` | B5 | Exact base match | **applied** | `a134594d2d` | `8b2560d074` | `8b2560d074` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 92 | `src/modules/studio/CalculatorView.tsx` | B6 | Exact base match | **applied** | `2405f0a746` | `65c5a5912f` | `65c5a5912f` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 93 | `src/modules/studio/CodeStudioView.tsx` | B6 | Exact base match | **applied** | `f675f6d724` | `2f3fd765ff` | `2f3fd765ff` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 94 | `src/modules/studio/DocumentScannerView.tsx` | B6 | Exact base match | **applied** | `f0ee72d0f3` | `da5604cc43` | `da5604cc43` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 95 | `src/modules/studio/FileManagerView.tsx` | B6 | Exact base match | **applied** | `70f0fd439c` | `ca98f07d16` | `ca98f07d16` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 96 | `src/modules/studio/KanbanView.tsx` | B6 | Exact base match | **applied** | `77dc2f7e61` | `3905e78575` | `3905e78575` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 97 | `src/modules/studio/PdfStudioView.tsx` | B6 | Exact base match | **merged** | `20379977ba` | `08a05444d5` | `37a96dce97` | Applied Batch 6 candidate + split persistent PDF.js document/worker loader from bounded page-window renderer with cancelRender cleanup. |
| 98 | `src/modules/studio/PhotoStudioView.tsx` | B6 | Exact base match | **applied** | `3b6b9067bb` | `a5b77844ce` | `a5b77844ce` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 99 | `src/modules/studio/PresentationView.tsx` | B6 | Exact base match | **applied** | `3fd92d10b6` | `2e001c0265` | `2e001c0265` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 100 | `src/modules/studio/SpreadsheetView.tsx` | B6 | Exact base match | **merged** | `7131b39cfa` | `69bfbb9af9` | `0201ee4771` | Applied Batch 6 candidate + replaced window.confirm() with accessible ModalDialog & wired IncrementalWorkbookEvaluator. |
| 101 | `src/modules/studio/WhiteboardView.tsx` | B6 | Exact base match | **applied** | `61c97b29c0` | `cc688bc5fc` | `cc688bc5fc` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 102 | `src/modules/time/TimeSuiteView.tsx` | B6 | Exact base match | **applied** | `817c86097b` | `8bc46d88a2` | `8bc46d88a2` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 103 | `src/modules/time/ZenSheetOverlay.tsx` | B6 | Exact base match | **applied** | `4eda3d4c1c` | `9cadea6358` | `9cadea6358` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 104 | `src/styles/modules.css` | B6 | Exact base match | **applied** | `42e4a2c945` | `c73baee434` | `c73baee434` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 105 | `src/styles/print.css` | B6 | Exact base match | **applied** | `fd743d4d94` | `7863c5c1f2` | `7863c5c1f2` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 106 | `src/styles/shell.css` | B6 | Exact base match | **applied** | `1e0d21e839` | `abd7b8804c` | `abd7b8804c` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 107 | `src/styles/tokens.css` | B6 | Exact base match | **applied** | `0a777e651e` | `a775fd5b11` | `a775fd5b11` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |
| 108 | `src/vite-env.d.ts` | B6 | Exact base match | **applied** | `65996936fb` | `094e359ae9` | `094e359ae9` | Byte-exact match with UPGRADE_MANIFEST.json candidate. |

---

## 2. Additional Files Modified or Added Outside the 108 Upgraded Paths

| File Path | Category | Summary of Change |
|---|---|---|
| `vite.config.ts` | Performance | Tightened function-based manualChunks(id) to isolate exact 30-file boot graph in appCore, split todaySpread/decor/studioShared, eliminate circular chunks and Rollup >500 kB warning (−22.6% cold-boot eager JS vs. pre-integration). |
| `public/sw.js` | Offline / PWA | Bumped FALLBACK_CACHE to planaday-build-4.2.0, moved stale cache cleanup from install to activate, switched navigation/index.html to Network-First with offline fallback while keeping hashed /assets/* Cache-First. |
| `src/core/pdfEngine.ts` | Memory / Stability | Wrapped extractPdfTextByPage PDF.js loadingTask in try/finally with loadingTask.destroy() and page.cleanup() to prevent worker/memory leaks. |
| `server/db.ts` | Security / Sync | Added getRecordWorkspaceId() and getRecordCountForWorkspaces() to enforce workspace isolation on sync push/pull for scoped member tokens. |
| `server/index.ts` | Security / Sync | Closed workspace authorization & record-hijack bypass on /api/sync/push, restricted ?token= auth strictly to SSE /api/sync/events, added per-IP auth brute-force rate limiting (HTTP 429), caught malformed x-blob-name URI decoding, and cleaned up SSE timers onClose. |
| `server/auth.ts` | Security | Made redeemPairingCode atomic (UPDATE ... WHERE code_hash = ? AND used_at IS NULL checking changes === 1) to prevent concurrent replay races. |
| `server/outboundPolicy.ts` | Security (SSRF) | Blocked IPv4-mapped IPv6 hex/dotted forms (::ffff:7f00:1, 0:0:0:0:0:ffff:127.0.0.1), expanded loopback (0:0:0:0:0:0:0:1), NAT64 (64:ff9b:), and RFC 6666 discard (100::). |
| `server/gpuBridge.ts` | GPU / Security | Rejected non-HTTP(S) GPU URL schemes and explicitly surfaced HTTP 401/403 internal token mismatches with clean local fallback. |
| `desktop/main.cjs` | Security (Desktop) | Enforced path.resolve directory containment on Electron local static HTTP server to prevent path-traversal file reads. |
| `gpu-service/Dockerfile` | GPU Compatibility | Upgraded CUDA base image from 12.4.1 to nvidia/cuda:12.8.1-runtime-ubuntu22.04 for NVIDIA Blackwell (sm_120: RTX 5050 / RTX 5080) compatibility. |
| `gpu-service/app.py` | GPU Performance & Security | Added hmac.compare_digest auth, 25 MiB / 40M-pixel image limits, bounded job pruning (max 200), thread-safe PaddleOCR caching, asyncio.to_thread offloading so /health & /cancel never block, real torch VRAM fraction cap, and cancellation/sharpening in /enhance. |
| `tests/upgrades.test.ts` | Test Update | Updated OFFLINE_LEARNING_FACTS count assertion from exact 120 to >=128 with unique-ID check matching Batch 4 expansion. |
| `tests/ui-smoke.test.tsx` | Test Expansion | Awaited lazy TodaySpread cleanly and added DocumentScannerView & PdfStudioView smoke verification (36 views verified in jsdom). |
| `tests/integration-optimization-v42.test.tsx` | New Test Suite | Added 5 comprehensive integration/security/performance tests (AppContext render isolation, IncrementalWorkbookEvaluator parity + #CIRC!, SearchIndex/BlobCache concurrency, server workspace auth/atomic pairing/SSRF IPv6/GPU diagnostics, offline fallback failover + SHA-256 attachment sync + conflict keep-both). |
| `PLANADAY_INTEGRATION_MANIFEST.md` | Documentation | Added complete 108-file SHA-256 integration report and additional-files ledger. |
| `CHANGELOG.md` | Documentation | Updated release 4.2.0 changelog with 108-file integration, deep performance optimizations, and security/GPU hardening. |
| `PLANADAY_PERFORMANCE_AUDIT.md` | Documentation | Recorded exact measured BEFORE vs. AFTER bundle, search, incremental spreadsheet, AppContext, PDF worker, and scheduler benchmarks. |
| `PLANADAY_TEST_RESULTS.md` | Documentation | Recorded all 219 validation checks, 191 Vitest tests, typecheck, build, py_compile, compose config, static safety, and environment-blocked targets. |
| `PLANADAY_WORKING.md` | Documentation | Updated active working checkpoint to post-108-file integration & optimization pass on integrate/final-upgrade-package. |
| `PLANADAY_RELEASE_CHECKLIST.md` | Documentation | Updated Release Acceptance Gates A–J with verified evidence and honest hardware/live-cutover blockers. |
| `PLANADAY_SIZE_AND_COMPLETENESS_AUDIT.md` | Documentation | Updated exact dist/ chunk table (29 files, 624.2 KB raw / 188.4 KB gz eager boot JS), dist-server/ metrics, and 45-module line count. |
