/** Per-test hygiene (setupFilesAfterEnv), mirroring pocketpal-ai's
 *  jest/setupFilesAfterEnv.ts. Anything that must be true BEFORE a module is
 *  imported belongs in setup.ts; anything that must be true AFTER each test
 *  belongs here.
 */

import { resetRouterMock } from "./router-mock.ts";

// One recorded navigation must not satisfy an assertion in another test.
beforeEach(() => {
  resetRouterMock();
});

// Fake timers left armed leak into the next suite and hang it.
afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});

afterAll(() => {
  jest.useRealTimers();
});