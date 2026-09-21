/** Model source strategies barrel export. */

export { ModelSourceStrategy } from "./ModelSourceStrategy";
export { HuggingFaceSourceStrategy } from "./HuggingFaceSourceStrategy";
export { DirectUrlSourceStrategy } from "./DirectUrlSourceStrategy";
export { RemoteApiSourceStrategy } from "./RemoteApiSourceStrategy";

import { HuggingFaceSourceStrategy } from "./HuggingFaceSourceStrategy";
import { DirectUrlSourceStrategy } from "./DirectUrlSourceStrategy";
import { RemoteApiSourceStrategy } from "./RemoteApiSourceStrategy";
import type { ModelSourceStrategy } from "./ModelSourceStrategy";

/** Registry of all available model source strategies */
export const modelSourceStrategies: ModelSourceStrategy[] = [
  new HuggingFaceSourceStrategy(),
  new DirectUrlSourceStrategy(),
  new RemoteApiSourceStrategy(),
];

/** Get a strategy by ID */
export function getStrategyById(id: string): ModelSourceStrategy | undefined {
  return modelSourceStrategies.find((s) => s.id === id);
}

/** Get all strategies */
export function getAllStrategies(): ModelSourceStrategy[] {
  return modelSourceStrategies;
}