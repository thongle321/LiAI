# 05: A real storage row in Settings

**What to build:** Settings reports how much free space the device has. Today the
download failure dialog tells the user to check the free space reported in
Settings, and Settings shows no free-space figure anywhere — following the advice
leads nowhere.

**Blocked by:** None (can start immediately)

**Status:** done
- [x] Settings displays the device's free space
- [x] The figure is formatted with the existing byte formatter rather than an ad-hoc one
- [x] The reading is taken when the screen is shown, and the user can refresh it
- [x] The reading can fail without breaking the screen
- [x] The failure dialog's existing advice text is unchanged and now points at something real
- [x] This is a single storage row, not a usage breakdown, a model browser, or a cleanup action
