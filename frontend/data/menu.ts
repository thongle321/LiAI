export type MenuAction = "see" | "chat" | "voice" | "more" | "new";

export type MenuItem = { label: string; action: MenuAction };

/** Header dropdown entries (navigation data, kept typed). */
export const MENU: MenuItem[] = [
  { label: "SEE", action: "see" },
  { label: "CHAT", action: "chat" },
  { label: "VOICE", action: "voice" },
  { label: "MORE", action: "more" },
  { label: "New conversation", action: "new" },
];
