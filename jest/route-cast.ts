/** The cast that lets a test name a route the app's generated route union
 *  does not know about.
 *
 *  The inline trees `renderRouter` drives are not part of the app's
 *  generated route union (expo-router types `href` from `.expo/types`), so
 *  their names have to be cast. Kept in one place so the cast has one
 *  explanation.
 */
export const route = (name: string) => name as never;
