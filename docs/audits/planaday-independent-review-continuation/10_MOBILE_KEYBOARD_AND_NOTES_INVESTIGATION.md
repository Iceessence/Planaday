# Mobile keyboard and Notes verification

## Android correction and cursor

On the API 35 phone emulator, the native Gboard keyboard was opened for `begin  end`. The caret was set between the spaces. The harness tapped Gboard keys for `teh` and then its `the` suggestion. The result was `begin the end`, caret position 10. Save and force-stop/relaunch recovered those exact bytes from the audit app. This covers one single-word correction, middle-of-line placement and one keyboard engine. Device-specific autocorrect, composition across paragraphs, alternate keyboards, keyboard dismissal, insertion at selection boundaries and undo still need native coverage. [Gboard preflight](evidence/android-native/preflight.json) · [Typing](evidence/android-native/keyboard.json) · [Correction and reopen](evidence/android-native/keyboard-finish.json)

Chromium's IME replacement and selected-span cursor test passed. After rotation, the same note remained editable. The emulated browser IME fixture tests the text control only. The size harness also checked insertion at start, middle and end for six preloaded notes. [30-minute scenario](evidence/long-notes/browser-results.json) · [Note size evidence](evidence/notes-size/results.json)

## PD-016 writes a draft to the wrong note

BR-003 created synthetic Alpha and Beta, edited Alpha and dispatched selection of Beta while the editor was focused, without an intervening blur. After debounce, Alpha still held its original text and Beta held the Alpha draft. Both values were read from local IndexedDB and authenticated by the corresponding isolated SQLite records. The same source revision was used as the build. This confirms a persistent data-integrity failure and raises PD-016 to P0.

The trigger uses browser-dispatched selection to exercise the focus ordering. Conventional pointer/touch, keyboard Tab, rapid multi-switch, visibility change, path navigation and cold restart timing require separate trials. A normal safety design binds each queued edit to its record ID and revision at capture, preserves the old record on selection changes and surfaces save conflicts. [Exact workflow evidence](evidence/browser-workflows/results.json)

## Reported crash

The historical crash cause is undetermined. Equal-payload browser controls showed substantial multiline insertion cost in Chromium even in a bare textarea and additional cost in Planaday. Preloading and editing a 100,000-word note succeeded. A 30-minute focused edit run passed, which does not cover native or mixed-use long duration. [Timing and limitations](15_LONG_DURATION_STABILITY_RESULTS.md)
