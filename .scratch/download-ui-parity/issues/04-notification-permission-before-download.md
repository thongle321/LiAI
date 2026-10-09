# 04: Ask for notification permission before a download

**What to build:** Starting a download asks for the notification permission on
Android, so the foreground-service notification the download posts is actually
visible. On Android 13 and later nothing in the app requests that permission
today, so the notification is silently suppressed and the one surface where this
app's download experience is ahead of the reference app is the one surface nobody
sees.

Declining must not block the download.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Starting a download requests the notification permission before the transfer begins
- [x] Declining the permission does not block or fail the download
- [x] The request is made from the download path, not at app launch
- [x] Platform versions that need no runtime permission request nothing
- [x] The call site is guarded by a source assertion, since the permission API is native and cannot be exercised under the test runner
- [x] The known trade-off is recorded: requesting per download means a user who declined may be asked again, which is the reference app's behaviour

**Note:** the ticket brief said `expo-notifications` was already a dependency. It
is not installed and not in `package.json`, and AGENTS.md forbids adding a
dependency without approval. The runtime permission is requested through
react-native's own `PermissionsAndroid`, which is already installed and is what
`POST_NOTIFICATIONS` needs; the `PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS`
constant and `request(permission)` shapes were read from the installed
`node_modules/react-native/Libraries/PermissionsAndroid/PermissionsAndroid.d.ts`.
`POST_NOTIFICATIONS` is already declared in
`modules/native-download/android/src/main/AndroidManifest.xml`, so the runtime
request is honoured — no manifest edit was needed.
