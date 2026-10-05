/** Background release of the loaded model.
 *
 * Run: node --test tests/offload.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  watchBackgroundRelease,
  suspendBackgroundRelease,
  type AppStateLike,
} from "../lib/inference/offload.ts";

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

describe("picker suspension (G14)", () => {
  // Opening the OS picker or the camera backgrounds the app. A background
  // release there frees the model mid-pick, so the send that follows turns
  // into a load-then-fail. Bracketing the pick is the whole fix.
  function watched() {
    const app = fakeAppState();
    let released = 0;
    watchBackgroundRelease(app.source, {
      isEnabled: () => true,
      release: () => {
        released += 1;
      },
    });
    return { app, releases: () => released };
  }

  it("holds the model while the picker is open, and releases after", () => {
    const { app, releases } = watched();
    const resume = suspendBackgroundRelease();
    app.fire("background");
    assert.equal(releases(), 0, "the model must survive the pick");
    resume();
    app.fire("background");
    assert.equal(releases(), 1, "and release again once we are back");
  });

  it("overlapping suspensions only finish together", () => {
    const { app, releases } = watched();
    const outer = suspendBackgroundRelease();
    const inner = suspendBackgroundRelease();
    inner();
    app.fire("background");
    assert.equal(releases(), 0, "the outer one still holds it");
    outer();
    app.fire("background");
    assert.equal(releases(), 1);
  });

  it("a resume handle used twice cannot corrupt the count", () => {
    // handleAttach has several exits; a double-resume must not leave the
    // model permanently pinned, nor drive the counter negative and
    // silently disable suspension for every later pick.
    const resume = suspendBackgroundRelease();
    resume();
    resume();
    const { app, releases } = watched();
    app.fire("background");
    assert.equal(releases(), 1, "the next pick is not stranded unsuspended");
  });

  it("the attach path actually brackets the pick", () => {
    // The counter above is only worth anything if the picker path calls
    // it. A try/finally, not a bare call: handleAttach has an early return
    // when the pick fails, and a non-finally resume would pin the model
    // in memory forever after one declined photo.
    const src = readFileSync("components/chat/MessageInput.tsx", "utf8");
    assert.match(src, /const resume = suspendBackgroundRelease\(\)/);
    assert.match(
      src,
      /try \{[\s\S]*?await pickImages\(source\)[\s\S]*?\} finally \{[\s\S]*?resume\(\);[\s\S]*?\}/,
    );
  });
});
