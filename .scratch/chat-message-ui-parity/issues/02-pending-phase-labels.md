# 02: Pending row names the phase the model is in

**What to build:** While a tool is running, the pending row names it — "Building page" for the HTML preview, "Calculating" for the calculator, "Looking up time" for the date and time tool, and "Preparing tool" for any tool with no specific name — joined to the elapsed seconds with a middle dot. When no tool is in flight the row stays as it is today: dots plus elapsed time, no label.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Running the HTML-preview tool shows "Building page · 3s" in the pending row.
- [ ] Each tool maps to its own label; a tool name with no mapping shows "Preparing tool".
- [ ] With no tool in flight the row shows no label at all, matching upstream where the label appears only during a tool call.
- [ ] Elapsed seconds continue to work exactly as before when no label applies.
- [ ] The existing spoken accessibility label keeps working and now includes the phase name.
- [ ] The label updates live when the model moves from one tool to the next, without the row flickering through an empty state.
