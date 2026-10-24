/** Whisper-tier copy for the setup surfaces (PocketParity #1017's
 *  asrTierLabel/asrTierHint, as LiAI's English constants — LiAI has no
 *  i18n layer for the reference's l10n keys to ride).
 *
 *  The names are the reference's tier names verbatim; the hints are its
 *  tier hints verbatim. The SETTINGS tier rows use the rich labels they
 *  already carried; sheets show `Tier · size` lines via asrTierLabel. */

import type { AsrTier } from "@/services/asr/types.ts";

export const ASR_TIER_LABEL: Record<AsrTier, string> = {
  base: "Base",
  small: "Small",
  "large-turbo": "Large Turbo",
};

export const ASR_TIER_HINT: Record<AsrTier, string> = {
  base: "Default, fast",
  small: "More accurate, slower. Better for other languages",
  "large-turbo": "Very slow on most phones",
};
