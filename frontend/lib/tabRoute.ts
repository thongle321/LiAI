/** Bottom-tab deep links back to chat.
 *
 * Vision is a panel mode inside the chat screen, not a route — so the
 * voice tab can't link to it directly. The intent rides as a query
 * param the chat screen reads on mount. Pure helper, hence unit-tested.
 */
export function routeForTab(tab: "chat" | "vision"): string {
  return tab === "vision" ? "/chat?tab=vision" : "/chat";
}
