/** Model source strategies barrel export. */

export { ModelSourceStrategy } from "./ModelSourceStrategy";
export { HuggingFaceSourceStrategy } from "./HuggingFaceSourceStrategy";
export { RemoteApiSourceStrategy } from "./RemoteApiSourceStrategy";

import { HuggingFaceSourceStrategy } from "./HuggingFaceSourceStrategy";
import { RemoteApiSourceStrategy } from "./RemoteApiSourceStrategy";
import type { ModelSourceStrategy } from "./ModelSourceStrategy";

/** Registry of all available model source strategies */
export const modelSourceStrategies: ModelSourceStrategy[] = [
  new HuggingFaceSourceStrategy(),
  new RemoteApiSourceStrategy(),
];

/** Get a strategy by ID */
export function getStrategyById(id: string): ModelSourceStrategy | undefined {
  return modelSourceStrategies.find((s) => s.id === id);
}