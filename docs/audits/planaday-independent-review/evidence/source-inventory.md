# Tracked source and record inventory

Generated from the audited Git checkout, d82bdc7.
Read 138 tracked files. Parsed TypeScript/JavaScript syntax and recorded the first eight top-level declarations per applicable file. Review depth and tests are listed in the parent coverage report.

## Checked-in route handlers

| Route | Module/component |
|---|---|
| `all_in_one` | `AllInOneView` |
| `guide` | `GuideView` |
| `custom_tab` | `CustomTabView` |
| `settings` | `SettingsView` |
| `trash` | `TrashView` |
| `home` | `HomeDashboard` |
| `quick_glance` | `QuickGlanceView` |
| `today` | `TodaySpread` |
| `digital_planner` | `DigitalPlannerView` |
| `calendar` | `FlowCalendarView` |
| `task_calendar` | `TaskCalendarView` |
| `planner` | `PeriodPlannerView` |
| `tasks` | `TasksView` |
| `chores` | `ChoresView` |
| `history` | `HistoryView` |
| `reports` | `ReportsView` |
| `lab` | `LabWorkspaceView` |
| `calculator` | `CalculatorView` |
| `spreadsheets` | `SpreadsheetView` |
| `presentations` | `PresentationView` |
| `projects` | `ProjectsView` |
| `game_dev` | `GameDevView` |
| `book_writing` | `BookStudioView` |
| `kanban` | `KanbanView` |
| `whiteboard` | `WhiteboardView` |
| `code_studio` | `CodeStudioView` |
| `photo_studio` | `PhotoStudioView` |
| `files` | `FileManagerView` |
| `goals` | `GoalsHabitsView` |
| `habits` | `GoalsHabitsView` |
| `notes` | `NotesView` |
| `thoughts` | `ThoughtInboxView` |
| `diary` | `DiaryView` |
| `events` | `LifeEventsView` |
| `countdown` | `LifeEventsView` |
| `clock` | `TimeSuiteView` |
| `alarms` | `TimeSuiteView` |
| `timers` | `TimeSuiteView` |
| `stopwatch` | `TimeSuiteView` |
| `recipes` | `RecipesView` |
| `pantry` | `PantryView` |
| `meals` | `MealsView` |
| `shopping` | `GroceryView` |
| `household` | `HouseholdHealthView` |
| `health` | `HouseholdHealthView` |
| `finance` | `FinanceView` |
| `learning` | `LearningMediaView` |
| `media` | `LearningMediaView` |
| `travel` | `TravelPeopleHomeView` |
| `people` | `TravelPeopleHomeView` |
| `home_assets` | `TravelPeopleHomeView` |
| `spaces` | `StudioExtrasView` |
| `rituals` | `StudioExtrasView` |
| `insights` | `StudioExtrasView` |
| `automations` | `StudioExtrasView` |

## Record kinds

The TypeScript model contains 88 record kind literals.

`task`, `chore`, `habit`, `goal`, `routine`, `event`, `timeblock`, `note`, `notebook`, `thought`, `diary`, `life_event`, `countdown`, `alarm`, `timer`, `interval_preset`, `recipe`, `pantry_lot`, `pantry_zone`, `meal_plan`, `food_log`, `grocery_item`, `person`, `household_member`, `medication`, `workout`, `wellness_log`, `bill`, `budget_envelope`, `expense`, `warranty`, `wishlist_item`, `review_card`, `media_item`, `hobby_project`, `trip`, `packing_template`, `party`, `gift`, `home_asset`, `vehicle`, `pet_plant`, `storage_item`, `custom_space`, `decor_item`, `custom_sticker`, `automation_rule`, `spread_template`, `saved_view`, `period_reflection`, `triage_item`, `context_mode`, `quick_capture`, `planner_book`, `planner_page`, `lab_sample`, `lab_subcontract`, `lab_inventory`, `lab_order`, `lab_budget`, `lab_price_entry`, `lab_price_template`, `lab_research`, `lab_email_draft`, `lab_task`, `lab_meeting`, `lab_calibration`, `lab_wet_nir`, `lab_work_hour`, `lab_qms_item`, `calc_saved`, `spreadsheet`, `presentation`, `project`, `custom_schema`, `custom_entity`, `game_project`, `game_entity`, `book_project`, `book_chapter`, `book_entity`, `kanban_board`, `kanban_card`, `whiteboard`, `code_project`, `code_snippet`, `photo_asset`, `file_folder`.

## Tracked paths

| Path | Physical lines | Top-level declarations, up to eight |
|---|---:|---|
| `.dockerignore` | 10 |  |
| `.github/workflows/build-apps.yml` | 124 |  |
| `.github/workflows/docker-publish.yml` | 41 |  |
| `.gitignore` | 12 |  |
| `Dockerfile` | 38 |  |
| `README.md` | 37 |  |
| `capacitor.config.json` | 15 |  |
| `desktop/main.cjs` | 202 | `http`, `fs`, `path`, `zlib`, `LOCAL_PORT`, `mainWindow`, `tray`, `isQuitting` |
| `desktop/package.json` | 36 |  |
| `desktop/preload.cjs` | 7 |  |
| `docker-compose.yml` | 24 |  |
| `index.html` | 20 |  |
| `package-lock.json` | 4522 |  |
| `package.json` | 45 |  |
| `public/icons/icon.svg` | 22 |  |
| `public/manifest.webmanifest` | 51 |  |
| `public/sw.js` | 61 | `CACHE_NAME`, `CORE_ASSETS` |
| `server/alarmScheduler.ts` | 268 | `PushConfig`, `hhmmToMinutes`, `ServerAlarmScheduler` |
| `server/blobs.ts` | 60 | `BlobMeta`, `ServerBlobStore` |
| `server/db.ts` | 251 | `ServerLifeRecord`, `IncomingOp`, `PushResult`, `SyncDatabase` |
| `server/icsProxy.ts` | 44 | `fetchRemoteIcs`, `lookupBarcodeOpenFoodFacts` |
| `server/index.ts` | 316 | `__filename`, `__dirname`, `BuildServerOptions`, `buildDayplanaServer`, `isMain` |
| `server/recipeProxy.ts` | 209 | `ParsedRecipeDraft`, `parseIsoDurationMinutes`, `decodeHtmlEntities`, `findRecipeNode`, `extractInstructions`, `parseServings`, `extractRecipeFromHtml`, `fetchAndParseRecipeUrl` |
| `src/App.tsx` | 189 | `DigitalPlannerView`, `LabWorkspaceView`, `ReportsView`, `CalculatorView`, `SpreadsheetView`, `PresentationView`, `ProjectsView`, `GameDevView` |
| `src/components/Common/ClockWidget.tsx` | 227 | `CLOCK_DESIGN_OPTIONS`, `ROMAN`, `ClockWidget` |
| `src/components/Common/CommandPalette.tsx` | 152 | `PaletteAction`, `CommandPalette` |
| `src/components/Common/GlobalAlarmRingModal.tsx` | 112 | `GlobalAlarmRingModal` |
| `src/components/Common/GlobalSearchDialog.tsx` | 271 | `recordTypeToView`, `GlobalSearchDialog` |
| `src/components/Common/ModalDialog.tsx` | 93 | `ModalDialogProps`, `ModalDialog` |
| `src/components/Common/QuickCaptureDialog.tsx` | 277 | `QuickCaptureDialog` |
| `src/components/Common/SafeTextEditor.tsx` | 392 | `LocalSaveState`, `UseBufferedTextOptions`, `UseBufferedTextResult`, `useBufferedText`, `SafeTextareaProps`, `SafeTextarea`, `SafeInputProps`, `SafeInput` |
| `src/components/Common/SortFilterBar.tsx` | 184 | `SortOption`, `FilterChipOption`, `ExtraSelectFilter`, `SortFilterBarProps`, `SortFilterBar` |
| `src/components/Common/TabSettingsDrawer.tsx` | 65 | `TabSettingsDrawerProps`, `TabSettingsDrawer` |
| `src/components/Common/ToastStack.tsx` | 38 | `ToastStack` |
| `src/components/Common/WeatherCard.tsx` | 293 | `WeatherCard` |
| `src/components/Decor/DecorCanvas.tsx` | 1135 | `WASHI_COLORS`, `RUBBER_STAMPS`, `INK_PALETTE`, `InkTool`, `pointToSegmentDistSq`, `buildSmoothSvgPath`, `DecorCanvasOverlay` |
| `src/components/Settings/OnboardingModal.tsx` | 93 | `OnboardingModal` |
| `src/components/Settings/SettingsView.tsx` | 1583 | `PAPER_OPTIONS`, `QUICK_ACCENTS`, `CHIME_STYLES`, `MODULE_META`, `SettingsView` |
| `src/components/Settings/TrashView.tsx` | 80 | `TrashView` |
| `src/components/Shell/MiniBar.tsx` | 110 | `formatCountdown`, `MiniBar` |
| `src/components/Shell/MobileNav.tsx` | 447 | `TAB_LABELS`, `DrawerGroup`, `DRAWER_GROUPS`, `MobileNav` |
| `src/components/Shell/Sidebar.tsx` | 364 | `NavEntry`, `NavGroup`, `Sidebar` |
| `src/components/Shell/TopBar.tsx` | 445 | `VIEW_TITLES`, `TopBar` |
| `src/core/AppContext.tsx` | 1070 | `ToastItem`, `RunningTimer`, `isRecordVisibleForProfile`, `AppContextValue`, `AppContext`, `applySettingsToDocument`, `AppProvider`, `useApp` |
| `src/core/alarmSchedule.ts` | 178 | `AlarmRingtoneId`, `AlarmPayload`, `DAY_SHORT_LABELS`, `normalizeAlarmPayload`, `formatRepeatDaysSummary`, `formatCountdownMs`, `doesAlarmMatchMoment`, `computeNextAlarmTrigger` |
| `src/core/audio.ts` | 416 | `SoundscapeChannel`, `AlarmRingtoneDef`, `ALARM_RINGTONES`, `getRingtoneLabel`, `ToneDef`, `RINGTONE_PATTERNS`, `OfflineAudioEngine`, `audioEngine` |
| `src/core/automations.ts` | 174 | `AutomationTrigger`, `AutomationAction`, `AutomationRulePayload`, `AutomationExecutionResult`, `MAX_LOOP_DEPTH`, `evaluateAutomations` |
| `src/core/backup.ts` | 159 | `DayplanaBackupPayload`, `exportFullJsonBackup`, `exportFullZipBackup`, `importJsonBackup`, `importZipBackup`, `triggerBrowserDownload`, `saveDirectToDiskFolder`, `recordsToCsv` |
| `src/core/capture.ts` | 208 | `ParsedCapture`, `WEEKDAY_MAP`, `parseQuickCapture` |
| `src/core/db.ts` | 533 | `DayplanaDB`, `db`, `createId`, `DEFAULT_ENABLED_MODULES`, `DEFAULT_EVENT_CATEGORIES`, `DEFAULT_FAMILY_PROFILES`, `DEFAULT_NOTIFICATION_PREFS`, `createDefaultSettings` |
| `src/core/ics.ts` | 260 | `ICS_DAYS`, `escapeIcsText`, `unescapeIcsText`, `toIcsDate`, `toIcsDateTime`, `ruleToRrule`, `parseRrule`, `exportEventsToIcs` |
| `src/core/kitchenActions.ts` | 761 | `NON_LINEAR_KEYWORDS`, `AISLE_KEYWORDS`, `canonicalizeIngredientName`, `inferAisle`, `extractDurationMinutesFromStep`, `parseIngredientLine`, `parseRawRecipeText`, `ScaledIngredientView` |
| `src/core/labStats.ts` | 166 | `WetNirPairRecord`, `WetNirPointResult`, `WetNirSummaryStats`, `meanOf`, `computeWetNirComparison` |
| `src/core/mathEngine.ts` | 698 | `AngleUnit`, `EvalContext`, `MATH_CONSTANTS`, `factorial`, `nPr`, `nCr`, `formatSigFigs`, `toEngineeringNotation` |
| `src/core/mindActions.ts` | 247 | `FilePassageResult`, `fileThoughtPassage`, `extractInlineEntities` |
| `src/core/nativeAlarms.ts` | 183 | `NativeBridgeInfo`, `CapacitorGlobal`, `getCapacitor`, `detectRuntimePlatform`, `hashIdToInt`, `requestAlarmNotificationPermission`, `scheduleNativeNotification`, `cancelNativeNotification` |
| `src/core/planActions.ts` | 544 | `timeToMinutes`, `minutesToTime`, `scheduleActionOnCalendar`, `completeActionAtomically`, `RecurringEditScope`, `applyRecurringEventEdit`, `OverlapMode`, `PositionedEvent` |
| `src/core/recurrence.ts` | 291 | `daysInMonth`, `getNthWeekdayOfMonth`, `getFirstBusinessDay`, `expandRecurrenceDates`, `previewNextOccurrences`, `getSeasonForDate`, `computeNextChoreDueDate`, `computeChoreFreshnessAtDate` |
| `src/core/repository.ts` | 530 | `MAX_UNDO_STEPS`, `TRASH_RETENTION_DAYS`, `MAX_NOTE_REVISIONS`, `ChangeListener`, `listeners`, `subscribeRepository`, `notify`, `SaveOptions` |
| `src/core/sandboxRunner.ts` | 140 | `SandboxExecutionResult`, `CodeTestCase`, `CodeTestRunResult`, `stripSimpleTypeScript`, `runSandboxedJs` |
| `src/core/sanitizer.ts` | 70 | `domPurifyPromise`, `loadDOMPurify`, `ALLOWED_HTML_ELEMENTS`, `ALLOWED_HTML_ATTRS`, `safeSetHTML`, `sanitizeSvgMarkup` |
| `src/core/search.ts` | 194 | `SearchFilter`, `SearchHit`, `isWithinOneEdit`, `extractSearchableText`, `findJumpDate`, `fuzzySearchRecords` |
| `src/core/spreadsheetEngine.ts` | 460 | `SheetCell`, `WorksheetDef`, `WorkbookPayload`, `colIndexToLetter`, `letterToColIndex`, `parseCellRef`, `cellKey`, `expandCellRange` |
| `src/core/sync.ts` | 763 | `SyncStatus`, `SyncStateSnapshot`, `ServerStorageInfo`, `SyncListener`, `syncListeners`, `currentState`, `eventSource`, `syncTimer` |
| `src/core/taskScheduler.ts` | 417 | `ScheduledTaskBlock`, `TaskScheduleResult`, `PRIORITY_RANK`, `computeLearnedTaskDurations`, `computeDynamicTaskSchedule`, `DurationAnalyticsSummary`, `computeDurationAnalytics`, `computeTaskAgeMetadata` |
| `src/core/temporal.ts` | 252 | `TemporalNamespace`, `global`, `temporalReadyPromise`, `ensureTemporal`, `getTemporalSync`, `getSystemTimeZone`, `computeLogicalDateIso`, `addDaysIso` |
| `src/core/types.ts` | 1018 | `OperatingMode`, `ModuleId`, `NavView`, `RecordType`, `EntityLink`, `LifeRecord`, `RecurrenceRule`, `SubtaskItem` |
| `src/core/weather.ts` | 153 | `WeatherForecastDay`, `WeatherSnapshot`, `GeocodedPlace`, `describeWeatherCode`, `fetchWithTimeout`, `searchWeatherLocations`, `fetchLiveWeather` |
| `src/data/changelog.ts` | 150 | `ChangelogRelease`, `PLANADAY_CHANGELOG` |
| `src/data/densities.ts` | 264 | `IngredientDensity`, `COOKING_DENSITIES`, `VOLUME_TO_ML`, `MASS_TO_G`, `findIngredientDensity`, `ConversionResult`, `convertCookingUnit`, `formatRationalFraction` |
| `src/data/facts.ts` | 158 | `LearningFact`, `OFFLINE_LEARNING_FACTS`, `getFactTopics`, `getDailyFact` |
| `src/data/prompts.ts` | 138 | `CategorizedPrompt`, `DIARY_PROMPTS`, `THOUGHT_PROMPTS`, `getDiaryPromptCategories`, `getThoughtPromptCategories` |
| `src/data/sampleData.ts` | 446 | `OnboardingPreset`, `ONBOARDING_PRESETS`, `DEFAULT_NOTEBOOKS`, `applyOnboardingPreset`, `seedSampleData` |
| `src/data/stickers.ts` | 442 | `BuiltInSticker`, `StickerCategory`, `STICKER_CATEGORIES`, `cpToEmoji`, `RawSpec`, `RAW_CATALOG`, `BUILTIN_STICKERS`, `STICKER_BY_ID` |
| `src/data/themes.ts` | 421 | `PaperMaterial`, `FontPairing`, `DensityMode`, `ColorSchemePreference`, `ThemeTokens`, `ThemePreset`, `THEME_PRESETS`, `RGB` |
| `src/main.tsx` | 30 | `bootstrap` |
| `src/modules/creative/BookStudioView.tsx` | 481 | `BookTab`, `BookProjectPayload`, `BookChapterPayload`, `BookEntityPayload`, `countWords`, `BookStudioView` |
| `src/modules/creative/GameDevView.tsx` | 390 | `GameTab`, `GameProjectPayload`, `GameEntityPayload`, `GameDevView` |
| `src/modules/creative/ProjectsView.tsx` | 580 | `ProjectPayload`, `CustomFieldDef`, `CustomSchemaPayload`, `CustomEntityPayload`, `PROJECT_TEMPLATES`, `ProjectsView` |
| `src/modules/kitchen/GroceryView.tsx` | 277 | `STORES`, `GroceryView` |
| `src/modules/kitchen/MealsView.tsx` | 533 | `SLOTS`, `MealsView` |
| `src/modules/kitchen/PantryView.tsx` | 322 | `DEFAULT_ZONES`, `PantryView` |
| `src/modules/kitchen/RecipesView.tsx` | 796 | `RecipesView` |
| `src/modules/lab/LabWetNirView.tsx` | 391 | `fmtNum`, `LabWetNirView` |
| `src/modules/lab/LabWorkspaceView.tsx` | 1501 | `LabSubTab`, `EMAIL_TEMPLATES`, `LabWorkspaceView`, `TruckIcon` |
| `src/modules/life/AllInOneView.tsx` | 164 | `ScrollSectionDef`, `AllInOneView` |
| `src/modules/life/CustomTabView.tsx` | 1211 | `WIDGET_TYPES`, `BUILTIN_TABS`, `formatDurationShort`, `CustomTabView` |
| `src/modules/life/FinanceView.tsx` | 410 | `sumByCurrency`, `FinanceView` |
| `src/modules/life/GuideView.tsx` | 565 | `FeatureDirectoryEntry`, `FEATURE_DIRECTORY`, `GuideView` |
| `src/modules/life/HistoryView.tsx` | 374 | `HistoryEntry`, `OUTCOMES`, `HistoryView` |
| `src/modules/life/HouseholdHealthView.tsx` | 764 | `MedicationPayload`, `MED_FREQUENCY_OPTIONS`, `MED_INSTRUCTION_OPTIONS`, `MED_DOSE_OPTIONS`, `computeEffortScore`, `isMedicationRefillDue`, `HouseholdHealthView` |
| `src/modules/life/LearningMediaView.tsx` | 302 | `LearningMediaView` |
| `src/modules/life/ReportsView.tsx` | 310 | `PeriodPreset`, `computeDateRange`, `ReportsView` |
| `src/modules/life/StudioExtrasView.tsx` | 488 | `BUILTIN_CONTEXT_MODES`, `StudioExtrasView` |
| `src/modules/life/TravelPeopleHomeView.tsx` | 485 | `TravelPeopleHomeView` |
| `src/modules/mind/DiaryView.tsx` | 1090 | `DEFAULT_MOODS`, `EMOTION_TAGS`, `WELLNESS_RATINGS`, `DiaryView` |
| `src/modules/mind/LifeEventsView.tsx` | 271 | `OCCASION_CATEGORIES`, `LifeEventsView` |
| `src/modules/mind/NotesView.tsx` | 1502 | `NotesView` |
| `src/modules/mind/ThoughtInboxView.tsx` | 454 | `ThoughtInboxView` |
| `src/modules/plan/ChoresView.tsx` | 809 | `ChoresView` |
| `src/modules/plan/FlowCalendarView.tsx` | 2298 | `EVENT_TEMPLATES`, `ZOOM_STEPS`, `computePxPerHour`, `FlowCalendarView` |
| `src/modules/plan/GoalsHabitsView.tsx` | 479 | `computeHabitStats`, `GoalsHabitsView` |
| `src/modules/plan/HomeDashboard.tsx` | 622 | `HomeDashboard` |
| `src/modules/plan/PeriodPlannerView.tsx` | 372 | `PeriodPlannerView` |
| `src/modules/plan/QuickGlanceView.tsx` | 668 | `ALL_WIDGETS`, `ALL_ACTIONS`, `QuickGlanceView` |
| `src/modules/plan/TaskCalendarView.tsx` | 504 | `DAY_LABELS`, `TaskCalendarView` |
| `src/modules/plan/TasksView.tsx` | 1031 | `countSubtasks`, `toggleNestedSubtask`, `addNestedSubtask`, `wouldCreateCycle`, `CHECKLIST_TEMPLATES`, `TasksView` |
| `src/modules/plan/TodaySpread.tsx` | 1858 | `MOODS`, `OUTCOMES`, `QuickAddKind`, `TodaySpread` |
| `src/modules/planner/DigitalPlannerView.tsx` | 767 | `PlannerPageTemplate`, `PlannerNavTab`, `PlannerPageDef`, `PlannerBookPayload`, `partitionTabsByPage`, `US_STATES_GRID`, `PAGE_TEMPLATES`, `createDefaultBookPayload` |
| `src/modules/studio/CalculatorView.tsx` | 1240 | `CalcTab`, `GraphSeries`, `toFractionApprox`, `CalculatorView` |
| `src/modules/studio/CodeStudioView.tsx` | 478 | `CodeFile`, `CodeProjectPayload`, `LANGUAGES`, `createStarterCodeProject`, `CodeStudioView` |
| `src/modules/studio/FileManagerView.tsx` | 269 | `DOC_TYPES`, `LAB_TYPES`, `TYPE_TO_VIEW`, `FolderPayload`, `FileManagerView` |
| `src/modules/studio/KanbanView.tsx` | 503 | `KanbanColumn`, `KanbanBoardPayload`, `KanbanCardPayload`, `LIVE_TASK_COLS`, `KanbanView` |
| `src/modules/studio/PhotoStudioView.tsx` | 445 | `PhotoVersion`, `PhotoAssetPayload`, `PhotoStudioView` |
| `src/modules/studio/PresentationView.tsx` | 807 | `SlideElement`, `SlideDef`, `PresentationPayload`, `SLIDE_THEMES`, `createStarterPresentation`, `PresentationView` |
| `src/modules/studio/SpreadsheetView.tsx` | 897 | `makeSheetFromRows`, `buildTemplateWorkbook`, `formatCellDisplay`, `exportWorkbookSpreadsheetMl`, `SpreadsheetView` |
| `src/modules/studio/WhiteboardView.tsx` | 571 | `WbNode`, `WbEdge`, `WbStroke`, `WbBookmark`, `WhiteboardPayload`, `ToolMode`, `WhiteboardView` |
| `src/modules/time/TimeSuiteView.tsx` | 1640 | `StopwatchLap`, `formatStopwatchMs`, `exportStopwatchLapsToCsv`, `ALARM_PROFILES`, `TimeSuiteView` |
| `src/modules/time/ZenSheetOverlay.tsx` | 91 | `ZenSheetOverlay` |
| `src/styles/modules.css` | 371 |  |
| `src/styles/print.css` | 56 |  |
| `src/styles/shell.css` | 737 |  |
| `src/styles/tokens.css` | 271 |  |
| `src/vite-env.d.ts` | 1 |  |
| `tests/expansion-v4.test.ts` | 196 |  |
| `tests/phase0.test.ts` | 217 |  |
| `tests/phase1-reliability.test.ts` | 344 | `setNativeTextareaValue` |
| `tests/phase1.test.ts` | 184 |  |
| `tests/phase2.test.ts` | 105 |  |
| `tests/phase3.test.ts` | 152 |  |
| `tests/phase4.test.ts` | 215 |  |
| `tests/phases3-10.test.ts` | 274 |  |
| `tests/setup.ts` | 6 |  |
| `tests/ui-smoke.test.tsx` | 124 |  |
| `tests/upgrades.test.ts` | 288 |  |
| `tsconfig.json` | 20 |  |
| `tsconfig.server.json` | 14 |  |
| `vite.config.ts` | 88 |  |
