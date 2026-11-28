# Mobile, tablet and desktop product vision

## Mobile phones

Prioritize one-handed capture, next action, today agenda, writing and notifications. Keep three to five pinned destinations with visible labels. Search includes recent and pinned records, with an accessible clear affordance. In a detail view, expose one primary action and move advanced settings into a labelled sheet. Photos and files use a stacked list and a folder chooser. Keep multiline fields full width, reveal save and attachment readiness, and maintain focus when the keyboard opens and closes.

For Notes, anchor the editing session to a durable record draft and provide optional full-screen writing. Support selected-range replacements, physical IME composition, content recovery, undo and paste progress. For Calendar, start with agenda/day and show time zone and recurrence. Offer adjust-time controls as an accessible alternative to drags. Test pencil/pen modes with target feedback and reserve gestures for explicit canvas mode. Dedicated device features include native share, photo permission control, offline capture stage, home-widget and action caps by platform. [Current UI evidence](04_UI_UX_REVIEW.md)

## Tablets

Use an optional two-pane layout under adequate width. Offer a note list and editor, day calendar and task queue, or planner spread and pen/color controls. Preserve scroll/selection and reversible layout changes on rotation. Make stylus gestures explicit and ensure keyboard, switch-control, tap and pen paths perform equivalent record actions.

## Desktop

Use workspace-specific two- or three-panel layouts, resizable editor and inspector, saved widths, a durable path to refresh, focus management and keyboard shortcuts. Lab should present queue → sample/analysis details → history. Author workspace should present binder → text → continuity/notes, with an explicit preview. Creative views can use a canvas and selectable quick inspector. File Hub can display relationships and versions with a preview that respects permissions and rendition status.

Use an existing command palette as the common entry point to commands and search. Separate keyboard actions for open, go to related record, focus search and close editor. Add multi-window and multi-monitor support after save/reopen and navigation state are proven in a single window. Retain print, offline backups and explicit open-in-external-tool actions.

```text
Phone · Daily             Tablet · Notes                 Desktop · Book Studio
Today     Search   (+)    Notebooks | Note + actions     Binder | Draft   | Continuity
Next event / open tasks   List      | Editor            Scenes | Editor  | Characters
Capture sheet or drawer   Context   | Attachment drawer  Status | Preview | Related items
Today  Calendar  Notes    Optional one-pane focus        Saved layout + shortcuts
```

Acceptance covers populated layouts at all requested widths, landscape, screen enlargement, keyboard avoidance, reduced motion, assistive readers, native Android iOS cases and Electron. Use web feature detection and visible capability indicators to state which actions are available on each device. [Relevant proposals](15_COMPLETE_NEW_FEATURE_CATALOG.md) · [Release gates](21_EXPANDED_PRODUCT_ROADMAP.md)
