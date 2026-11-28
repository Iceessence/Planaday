# Physical phone testing

**BLOCKED — ENVIRONMENT.** USB enumeration, ADB device list and authorized mDNS discovery did not identify a physical Android phone before the emulator started. The owner selected emulator continuation. The Android evidence therefore covers native APK/WebView and emulator Gboard, plus emulator OS time and lifecycle cases.

Physical testing would require a USB-debuggable Android phone already authorized for this host and a user-approved test-only installation. Use the distinct audit package identity with synthetic data. Confirm the device appears as `device` in `adb devices -l` before issuing test commands. Test Gboard/Samsung Keyboard where installed, manual suggestions and automatic replacements, swipe typing, dictation, selection, rotation, background transfer, lock and reboot notifications. Test offline after checking the native permission channels. iPhone testing requires an authorized physical Safari session or a macOS/Xcode environment.

[Native Android test results](07_ANDROID_APPLICATION_TEST_RESULTS.md) · [Mobile keyboard analysis](10_MOBILE_KEYBOARD_AND_NOTES_INVESTIGATION.md)
