/** Companions route: library grid + editor sheet (PocketPal's Pals tab).
 *
 * Thin route per the architecture rule — the screen body lives in
 * components/companions/, this file only owns the editor sheet state, since
 * the editor is opened from both the grid and (later) chat surfaces.
 */

import { useState } from "react";

import { CompanionsScreen } from "@/components/companions/companions-screen.tsx";
import { CompanionEditorSheet } from "@/components/companions/companion-editor-sheet.tsx";
import type { Companion } from "@/types/companion.ts";

export default function CompanionsRoute() {
  const [editing, setEditing] = useState<Partial<Companion> | null>(null);
  return (
    <>
      <CompanionsScreen
        onOpen={(companion) => setEditing(companion)}
        onCreate={(template) => setEditing(template)}
      />
      <CompanionEditorSheet companion={editing} onClose={() => setEditing(null)} />
    </>
  );
}
