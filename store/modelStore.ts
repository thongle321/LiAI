/** Public entry for the model store.
 *
 * The implementation is split into focused slices under `./models/`; this
 * path stays stable so consumers import `useModelStore` from one place.
 */

export { useModelStore } from "./models";
export type { ModelStore } from "./models";
