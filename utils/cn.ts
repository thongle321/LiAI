import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge classNames with deduplication (Uniwind does not dedupe on its own;
 *  see the Uniwind FAQ "How do you handle merging and deduplicating
 *  classNames"). Mandated by AGENTS.md for any BEM+utility overlap. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}