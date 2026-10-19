/** Public entry for the model store. */

import { asyncStorage } from "./models/storage";

import { createModelStore } from "./models";

export const useModelStore = createModelStore(asyncStorage);
export type { ModelStore } from "./models";
