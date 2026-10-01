/** Background release of the loaded model.
 *
 * Run: node --test tests/offload.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { watchBackgroundRelease, type AppStateLike } from "../lib/inference/offload.ts";

function fakeAppState() {
  let handlers: Array<(status: string) => void> = [];
  const source: AppStateLike = {
    addEventListener: (_type, handler) => {
      handlers.push(handler);
      return {
        // A real remove() detaches the handler, not just flags it: that is
        // the whole point of unsubscribing, so the fake must do it too.
        remove: () => {
          handlers = handlers.filter((h) => h !== handler);
        },
      };
    },
  };
  return {
    source,
    fire: (status: string) => handlers.forEach((h) => h(status)),
    handlerCount: () => handlers.length,
  };
}

describe("background release", () => {
  it("releases the model when the app is backgrounded", () => {
    const app = fakeAppState();
    let released = 0;
    watchBackgroundRelease(app.source, {
      isEnabled: () => true,
      release: () => {
        released += 1;
      },
    });
    app.fire("background");
    assert.equal(released, 1);
  });

  it("keeps the model when the user turned offloading off", () => {
    const app = fakeAppState();
    let released = 0;
    watchBackgroundRelease(app.source, {
      isEnabled: () => false,
      release: () => {
        released += 1;
      },
    });
    app.fire("background");
    assert.equal(released, 0, "the toggle has to be able to stop this");
  });

  it("ignores inactive, which is only a blip", () => {
    // A phone call or the app switcher sends `inactive` before
    // `background`; releasing on it would cost a reload for nothing.
    const app = fakeAppState();
    let released = 0;
    watchBackgroundRelease(app.source, {
      isEnabled: () => true,
      release: () => {
        released += 1;
      },
    });
    app.fire("inactive");
    app.fire("active");
    assert.equal(released, 0);
  });

  it("reads the toggle at the moment it fires, not at subscribe time", () => {
    const app = fakeAppState();
    let released = 0;
    let enabled = false;
    watchBackgroundRelease(app.source, {
      isEnabled: () => enabled,
      release: () => {
        released += 1;
      },
    });
    app.fire("background");
    assert.equal(released, 0);
    enabled = true;
    app.fire("background");
    assert.equal(released, 1);
  });

  it("stops releasing once unsubscribed", () => {
    const app = fakeAppState();
    let released = 0;
    const stop = watchBackgroundRelease(app.source, {
      isEnabled: () => true,
      release: () => {
        released += 1;
      },
    });
    stop();
    app.fire("background");
    assert.equal(released, 0);
    assert.equal(app.handlerCount(), 0, "the subscription is actually removed");
  });
});
