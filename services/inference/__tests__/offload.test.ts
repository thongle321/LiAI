/** The background release listener.
 *
 * `offload.ts` decides WHEN a model is freed; the auto-release record in
 * `auto-release.ts` decides whether the next launch warms it back up. These
 * lock the listener's own contract, which the record depends on: exactly
 * one release per backgrounding, exactly one restore per return, and
 * nothing at all for a model the user deactivated by hand.
 */

import {
  suspendBackgroundRelease,
  watchBackgroundRelease,
  type AppStateLike,
} from "../offload";

/** A fake AppState: the listener subscribes once, the test emits. */
function fakeAppState() {
  let handler: ((status: string) => void) | null = null;
  const source: AppStateLike = {
    addEventListener: (_type, h) => {
      handler = h;
      return {
        remove: () => {
          handler = null;
        },
      };
    },
  };
  return {
    source,
    emit: (status: string) => handler?.(status),
  };
}

function watcher(enabled = true) {
  const app = fakeAppState();
  const calls = { release: 0, restore: 0 };
  const stop = watchBackgroundRelease(app.source, {
    isEnabled: () => enabled,
    release: () => {
      calls.release += 1;
    },
    restore: () => {
      calls.restore += 1;
    },
  });
  return { app, calls, stop };
}

describe("watchBackgroundRelease", () => {
  it("releases the model when the app goes to the background", () => {
    const { app, calls } = watcher();

    app.emit("background");

    expect(calls.release).toEqual(1);
  });

  it("restores the model on the way back in", () => {
    const { app, calls } = watcher();

    app.emit("background");
    app.emit("active");

    expect(calls.restore).toEqual(1);
  });

  it("restores only what it released", () => {
    // A model the user deactivated by hand was never released here, so
    // returning must not resurrect it.
    const { app, calls } = watcher();

    app.emit("active");

    expect(calls.release).toEqual(0);
    expect(calls.restore).toEqual(0);
  });

  it("restores once even though `active` arrives more than once", () => {
    // The notification shade and a permission prompt each deliver `active`
    // again; each extra restore is a full model read nobody asked for.
    const { app, calls } = watcher();

    app.emit("background");
    app.emit("active");
    app.emit("active");

    expect(calls.restore).toEqual(1);
  });

  it("ignores an `inactive` blip", () => {
    // A phone call or the app switcher must not cost a reload.
    const { app, calls } = watcher();

    app.emit("inactive");

    expect(calls.release).toEqual(0);
  });

  it("releases nothing when the setting is off", () => {
    const { app, calls } = watcher(false);

    app.emit("background");

    expect(calls.release).toEqual(0);
  });

  it("releases nothing while a system UI holds the release", () => {
    // The camera and the gallery background the app; freeing the model
    // mid-pick turns the send that follows into a load-then-fail.
    const { app, calls } = watcher();
    const resume = suspendBackgroundRelease();

    app.emit("background");
    expect(calls.release).toEqual(0);

    resume();
    app.emit("background");
    expect(calls.release).toEqual(1);
  });

  it("stops listening once the subscription is removed", () => {
    const { app, calls, stop } = watcher();

    stop();
    app.emit("background");

    expect(calls.release).toEqual(0);
  });
});
