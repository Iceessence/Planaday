# iOS and WebKit testing

Windows Playwright WebKit 26.5 launched the isolated application at desktop and 393 × 852 iPhone-sized settings. Both cases created, edited and saved a note, then verified the same content in IndexedDB after reload. The mobile case selected the Notes workspace through the drawer. The engine/device profile supplies browser compatibility evidence only. [WebKit results](evidence/web-webkit/results.json)

The checkout contains a Capacitor configuration and a native notification abstraction that branches for native platforms. The checked-in build workflow packages Android and Windows and does not produce an iOS app. No iOS project, Xcode or physical iPhone was available. iOS Safari install UI, Web Push entitlement, actual software keyboard, suspension, permission prompts, camera picker, lock screen, home-screen PWA upgrade and restore require iPhone or supported simulator verification.

Report status for iOS-specific behavior is **BLOCKED — ENVIRONMENT**. Windows WebKit checks do not represent Safari or iOS policy delivery.
