# Current source inventory

Commit `d82bdc7` at version 4.0.0 supplies the discovered scope. The owner asked for code-based inventory. The [requirement matrix](../02_COMPLETE_FEATURE_VERIFICATION_MATRIX.md) allocates requirement IDs to 54 reachable workspace entry points, several cross-system behaviors and all 88 declared record types, including bespoke and specialized lab records. The single custom tab instance route depends on user-created tabs, and the Wet/NIR scene is an internal Laboratory subtab.

## Canonical records

`src/core/types.ts:111–199` declares 88 types. Creation and UI population differ by type. The following list preserves source order.

- 1. `task`
- 2. `chore`
- 3. `habit`
- 4. `goal`
- 5. `routine`
- 6. `event`
- 7. `timeblock`
- 8. `note`
- 9. `notebook`
- 10. `thought`
- 11. `diary`
- 12. `life_event`
- 13. `countdown`
- 14. `alarm`
- 15. `timer`
- 16. `interval_preset`
- 17. `recipe`
- 18. `pantry_lot`
- 19. `pantry_zone`
- 20. `meal_plan`
- 21. `food_log`
- 22. `grocery_item`
- 23. `person`
- 24. `household_member`
- 25. `medication`
- 26. `workout`
- 27. `wellness_log`
- 28. `bill`
- 29. `budget_envelope`
- 30. `expense`
- 31. `warranty`
- 32. `wishlist_item`
- 33. `review_card`
- 34. `media_item`
- 35. `hobby_project`
- 36. `trip`
- 37. `packing_template`
- 38. `party`
- 39. `gift`
- 40. `home_asset`
- 41. `vehicle`
- 42. `pet_plant`
- 43. `storage_item`
- 44. `custom_space`
- 45. `decor_item`
- 46. `custom_sticker`
- 47. `automation_rule`
- 48. `spread_template`
- 49. `saved_view`
- 50. `period_reflection`
- 51. `triage_item`
- 52. `context_mode`
- 53. `quick_capture`
- 54. `planner_book`
- 55. `planner_page`
- 56. `lab_sample`
- 57. `lab_subcontract`
- 58. `lab_inventory`
- 59. `lab_order`
- 60. `lab_budget`
- 61. `lab_price_entry`
- 62. `lab_price_template`
- 63. `lab_research`
- 64. `lab_email_draft`
- 65. `lab_task`
- 66. `lab_meeting`
- 67. `lab_calibration`
- 68. `lab_wet_nir`
- 69. `lab_work_hour`
- 70. `lab_qms_item`
- 71. `calc_saved`
- 72. `spreadsheet`
- 73. `presentation`
- 74. `project`
- 75. `custom_schema`
- 76. `custom_entity`
- 77. `game_project`
- 78. `game_entity`
- 79. `book_project`
- 80. `book_chapter`
- 81. `book_entity`
- 82. `kanban_board`
- 83. `kanban_card`
- 84. `whiteboard`
- 85. `code_project`
- 86. `code_snippet`
- 87. `photo_asset`
- 88. `file_folder`

`src/core/repository.ts` abstracts record revision, history, tombstones and outbox. `src/core/db.ts` defines browser IndexedDB and preferences. `src/core/sync.ts` implements the client protocol and mode settings. `server/db.ts`, `server/blobs.ts` and `server/index.ts` are the SQLite, binary and HTTP sides. The matrix links feature-level behavior to specific engines and modules where feasible.

## Runtime API inventory

- Public metadata and storage status. `GET /api/health`, `GET /api/storage/info`.
- Explicit SQLite snapshot. `POST /api/storage/backup`.
- Synchronization. Record push and pull, plus the SSE notify endpoint under `/api/sync`.
- Binary transfer. `PUT /api/blobs/:hash` and `GET /api/blobs/:hash`.
- Integration proxies. Recipe URL, calendar feed, and barcode provider handlers under `/api/proxy`.
- Configuration and test operations under `/api/push-config`.
- Static web/PWA entry points, JS assets and service worker. `src/App.tsx`, `public/sw.js`, `vite.config.ts`.

## Scripted coverage boundaries

`src/components/Shell/Sidebar.tsx` and `MobileNav.tsx` define navigation surfaces. Route snapshots are a reachability baseline. They do not verify every button, form, keyboard gesture, custom setting or all business rules. For each exact criterion, see the R/C mapping and evidence columns.
