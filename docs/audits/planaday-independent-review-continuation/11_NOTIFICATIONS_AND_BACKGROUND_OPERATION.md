# Notifications and background operation

## Android 15 emulator results

The audit package was granted POST_NOTIFICATIONS and the exact-alarm app operation in the isolated emulator. A 12-second timer was created using the application UI. The Capacitor plugin returned a pending item. The resulting Android notification record was matched to the scheduled ID to distinguish earlier alerts. These runs establish native delivery, without qualifying lock-screen presentation or audible settings on a physical device.

| ID | Lifecycle condition | Scheduled native ID | Observation |
|---|---|---:|---|
| AN-006A | App in foreground | 1344630038 | Matching Android notification record present after target. |
| AN-006B | Branch to Android Home | 27158552 | Matching Android notification record present after target. |
| AN-006C | Display sleep issued before trigger | 323705606 | Matching Android notification record observed after the sleep interval and before returning to the app. |
 
Each scenario sampled after the target interval, so there is no precise delivery-time claim. Physical lock-screen appearance, sound, long idle/Doze, actual process kill before due, force-stop, reboot, permission revocation, channels, reschedule/cancel/snooze, recurrence and quiet hours remain unqualified. The APK notes persistence after force-stop was a separate test.

## Background transfer

AN-008 queued an offline note edit before API 35 emulator display sleep. The ADB reverse connection was restored, and the isolated SQLite server received the edited body during the 45-second sleep observation, before app wake. Power state reported Asleep at both observations. This qualifies one reconnect and sleep case; physical secure lock, prolonged Doze, network changes and process death remain open. [Native sync evidence](evidence/android-native/background-sync.json)

The Chromium loopback test saved an offline edit locally and sent it after reconnect. Current client code attempts visibility-change/pagehide flush and schedules retries and SSE/polling. The built web service worker handles cache requests and has no durable Background Sync handler. Reports distinguish browser resume behavior from Android background scheduling and physical system restrictions. [Two-profile evidence](evidence/browser-workflows/results.json)

## Owner procedure for the supported native scenario

Use the verified, supported APK/Android WebView version. Enable notifications for Planaday in Android settings, including its delivery channel, and allow alarms/reminders access if the OS offers that app-specific setting. Create a short test timer, lock the phone, and check whether the OS publishes the timer notification. Start with generic notification text if the subject is confidential. The current production Dayplana image and user-installed APK identity still need a version check. No permission or notification settings were changed on the owner's physical device or production server.

[Native scheduled/delivered records](evidence/android-native/notifications.json) · [Android app checks](07_ANDROID_APPLICATION_TEST_RESULTS.md)
