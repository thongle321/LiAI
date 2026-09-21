/** Bottom-tab deep links.
 *
 * Vision is a standalone route (own screen), not a panel mode — so
 * the voice tab links straight to it. Pure helper, hence unit-tested.
 */
export function routeForTab(tab: "chat" | "vision"): string {
  return tab === "vision" ? "/vision" : "/chat";
}
