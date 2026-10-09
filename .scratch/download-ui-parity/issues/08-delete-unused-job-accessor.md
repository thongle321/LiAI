# 08: Delete the unused job-listing accessor

**What to build:** The download driver exposes a way to list every tracked job. It
works, and nothing calls it. With no global download overlay there is no new
cross-screen surface that would want it. Dead code that no caller wants is a lie
about what the app does.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The job-listing accessor and its declaration on the driver's interface are gone
- [ ] Nothing references either
- [ ] A source assertion keeps it deleted
- [ ] Typecheck and the full suite stay green
