# 04: Ask for notification permission before a download

**What to build:** Starting a download asks for the notification permission on
Android, so the foreground-service notification the download posts is actually
visible. On Android 13 and later nothing in the app requests that permission
today, so the notification is silently suppressed and the one surface where this
app's download experience is ahead of the reference app is the one surface nobody
sees.

Declining must not block the download.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Starting a download requests the notification permission before the transfer begins
- [ ] Declining the permission does not block or fail the download
- [ ] The request is made from the download path, not at app launch
- [ ] Platform versions that need no runtime permission request nothing
- [ ] The call site is guarded by a source assertion, since the permission API is native and cannot be exercised under the test runner
- [ ] The known trade-off is recorded: requesting per download means a user who declined may be asked again, which is the reference app's behaviour
