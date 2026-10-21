/** Hugging Face model source — barrel re-exporting the split modules.
 *
 *  Presets (data) live in constants/presets.ts; search/HTTP in
 *  services/models/hf-search.ts; spec builders in
 *  services/models/spec-builders.ts. This barrel keeps existing imports
 *  working; new code should import from the specific module. */
export * from "@/constants/presets.ts";
export * from "./hf-search.ts";
export * from "./spec-builders.ts";