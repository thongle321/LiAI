/** The Settings free-space row, which makes the download failure advice true.
 *
 * The failure dialog tells the user to "Check the free space reported in
 * Settings" (lib/models/download-error.ts) and until this row existed,
 * Settings showed no free-space figure anywhere — following the advice led
 * nowhere. Two seams, split the way this repo splits everything: the
 * decidable part (what the row SAYS for a given reading) is a pure function
 * tested directly, and the native part (the read, the refresh, the failure)
 * is guarded by source assertion, since there is no renderer under
 * `node --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { freeSpaceLabel } from "../lib/models/free-space.ts";

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

const ROW = "components/StorageSettings.tsx";
const SETTINGS = "app/(drawer)/settings.tsx";

describe("freeSpaceLabel", () => {
  it("formats a reading with the app's own byte formatter", () => {
    // Same strings the download cards print, so one figure has one format.
    assert.equal(freeSpaceLabel(1_500_000_000), "1.5 GB free");
    assert.equal(freeSpaceLabel(1024), "1.02 kB free");
  });

  it("says so plainly when the reading failed, instead of showing a figure", () => {
    assert.equal(freeSpaceLabel(null), "Couldn't read storage");
    // A nonsense reading is a failed reading: never render "-1 B free".
    assert.equal(freeSpaceLabel(-1), "Couldn't read storage");
    assert.equal(freeSpaceLabel(Number.NaN), "Couldn't read storage");
  });
});

describe("settings storage row", () => {
  const src = read(ROW);

  it("reads free space with the platform API and uses the shared label", () => {
    assert.match(src, /getFreeDiskStorageAsync/, "free space comes from expo-file-system");
    assert.match(src, /freeSpaceLabel/, "the figure is formatted by lib/models/free-space");
    assert.doesNotMatch(
      src,
      /formatBytes|\/ *1024|Math\.(round|floor)/,
      "no ad-hoc byte formatting in the component",
    );
  });

  it("reads on mount and can be read again on demand", () => {
    assert.match(src, /useEffect\(/, "the reading is taken when the screen is shown");
    assert.match(src, /RefreshCw/, "the row offers a refresh control");
  });

  it("survives a failed reading", () => {
    assert.match(src, /\.catch\(/, "a failed free-space read must not throw out of the effect");
  });

  it("is on the Settings screen, inside the shared card pattern", () => {
    const settings = read(SETTINGS);
    assert.match(settings, /<StorageSettings \/>/);
    assert.match(src, /<SettingsSection/);
    assert.match(src, /className="row"/, "rows live in the .row card, as everywhere else");
  });

  it("leaves the failure dialog's advice text alone", () => {
    // The copy is the reason this row exists; changing it would move the
    // goalposts instead of making it true.
    assert.match(
      read("lib/models/download-error.ts"),
      /Check the free space reported in Settings, then try again\./,
    );
  });
});