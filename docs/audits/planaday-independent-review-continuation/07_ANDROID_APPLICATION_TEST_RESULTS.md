# Android application testing

Built an isolated debug APK from the 4.0.0 web build at `d82bdc7`. The app used audit identity `org.planaday.audit.d82bdc7`, Capacitor 7.6.10 and Local Notifications 7.0.7. The Gradle build used Java 21 and SDK 35. APK packaging declared Android minimum SDK 23 and target 35. The APK template version name was 1.0. Native package metadata and the web application version are separate release fields. See [build](evidence/android-build.txt) and [APK badging](evidence/android-apk-metadata.txt).

| Emulator | Installed build and browser engine | Outcome |
|---|---|---|
| Android 10 / API 29, phone profile | Installed. Stock Android System WebView 74.0.3729.185. | Splash/blank application. WebView logged `SyntaxError: Unexpected token ?` in the production JS. The package accepted installation but the shipped JS does not execute in this tested WebView. A current WebView on Android 10 still needs qualification. [WebView log](evidence/android-5566/current-webview-syntax.log) |
| Android 15 / API 35, phone profile | Installed and launched. Google WebView 124.0.6367.219, 1080 × 2400 native and 412 × 915 CSS pixels. | Android bridge, Notes editing with Gboard, saved text after force-stop, and timed native notifications in foreground, background and screen sleep passed defined cases. |
| Android 16 / API 36, tablet profile | Installed and launched, 2560 × 1600 at density 320, Google WebView 133.0.6943.137. | Native bridge and Notes local save followed by force-stop/reopen passed. The proof is in [Android 16 evidence](evidence/android-5568/smoke.json). |

AN-008 staged a note update offline, put the API 35 emulator to sleep, then restored the network route. SQLite received the exact body before emulator wake. [Android background sync evidence](evidence/android-native/background-sync.json)

Native plugin discovery verified `LocalNotifications`. APK declarations include POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM and RECEIVE_BOOT_COMPLETED. Camera access and system photo picker need a separate workflow. Physical OEM restrictions, Play Store release signing, upgrade from the owner's installed version, iOS and notification restart remain separate.

The 35 AVD used WHPX. The system images and emulator were installed into the audit SDK after the owner approved the license prompt. The test installation used a separate app ID and synthetic records. [Native logs and screenshots](evidence/android-native/) · [Notifications](11_NOTIFICATIONS_AND_BACKGROUND_OPERATION.md)
