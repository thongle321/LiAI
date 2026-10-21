/**
 * Keyboard-transition jank loop — the feedback loop for the composer flash.
 *
 *   node scripts/keyboard-jank-loop.mjs [--toggles 5] [--budget 20] [--median 24]
 *
 * Why frame timing and not pixels: a "flash" is dropped frames. This reads
 * Android's own per-frame accounting (`dumpsys gfxinfo <pkg> framestats`) at
 * frame resolution, needs no change to the app, and runs in seconds. The
 * pixel loop (scripts/keyboard-flash-loop.mjs) is the wrong tool — over
 * WiFi ADB it samples at ~0.6fps, so a 16ms flash cannot fall between its
 * samples. Frame timing is what actually resolves it.
 *
 * Method: warm the app first (a cold start contributes seconds-long frames
 * and drowns the signal), RESET the counters, then do N keyboard toggles and
 * read the percentiles. Only the transitions are in the window.
 *
 * Exit 1 = over budget (the flash is reproducible). Exit 0 = within budget.
 * Exit 2 = the app was not measuring, so no verdict was produced.
 */

import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const TOGGLES = flag("toggles", 5);
const BUDGET_PCT = flag("budget", 20);
const BUDGET_MEDIAN = flag("median", 24); // a 60Hz frame is 16.7ms; 24 leaves slack

const wait = (ms) =>
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], {
    windowsHide: true,
  });

function device() {
  const rows = execFileSync("adb", ["devices"], { encoding: "utf8" })
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === "device");
  for (const [serial] of rows) {
    if (spawnSync("adb", ["-s", serial, "shell", "echo", "ok"]).status === 0) return serial;
  }
  throw new Error("no adb device answered a shell");
}

const SERIAL = device();
const sh = (cmd) => execFileSync("adb", ["-s", SERIAL, "shell", cmd], { encoding: "utf8" });

// Measure THIS app, or produce no verdict at all. A run that silently
// measured the launcher reports "green" for a home screen that never opened a
// keyboard — a false green is worse than a hard failure. Matching happens in
// Node: quoting `grep -o` through adb shell is fragile and yields no match.
const PKG = "com.anonymous.liai";
// Read the FOCUSED window's line specifically. Regexing the whole
// `dumpsys window` dump and taking the first package match finds any window
// on the device — including the launcher behind the app — and then reports
// "not foreground" for an app that is plainly in front of the user.
const focusedPackage = () => {
  const line = sh("dumpsys window").split("\n").find((l) => l.includes("mCurrentFocus")) ?? "";
  return (line.match(/com\.[a-z0-9_]+\.[a-z0-9_]+/) ?? [])[0];
};

if (focusedPackage() !== PKG) {
  console.log(`launching ${PKG} (focused was ${focusedPackage() ?? "unknown"})…`);
  spawnSync("adb", ["-s", SERIAL, "shell", "am", "start", "-n", `${PKG}/.MainActivity`], {
    stdio: "ignore",
  });
  wait(5000);
  if (focusedPackage() !== PKG) {
    console.error(`ABORT: ${PKG} is not focused after launch (it is ${focusedPackage() ?? "unknown"}).`);
    process.exit(2);
  }
}
console.log(`device: ${SERIAL}   measuring: ${PKG}`);

// Composer field centre, measured off a 1080x2392 capture (y≈1794).
const tap = () => sh("input tap 540 1794");
const dismiss = () => sh("input keyevent 111");

console.log("warming the app (cold-start frames would drown the signal)…");
tap();
wait(1400);
dismiss();
wait(2500);

sh(`dumpsys gfxinfo ${PKG} reset`);

for (let i = 1; i <= TOGGLES; i++) {
  tap();
  wait(1200);
  dismiss();
  wait(1200);
}

const out = sh(`dumpsys gfxinfo ${PKG} framestats`);
const num = (label) => {
  const m = out.match(new RegExp(`${label}[^0-9]*([0-9.]+)`));
  return m ? Number(m[1]) : null;
};
const total = num("Total frames rendered");
const jankyPct = num("Janky frames:") ?? num("Janky frames");
const median = num("50th percentile:");
const p90 = num("90th percentile:");
const p99 = num("99th percentile:");

if (total === null || jankyPct === null) {
  console.error(out.slice(0, 400));
  throw new Error("could not read gfxinfo — is the app still foregrounded?");
}

console.log(`\n${TOGGLES} keyboard toggles → ${total} frames`);
console.log(`  janky:      ${jankyPct}%   (budget ${BUDGET_PCT}%)`);
console.log(`  median:     ${median}ms    (budget ${BUDGET_MEDIAN}ms, a 60Hz frame is 16.7)`);
console.log(`  90th/99th:  ${p90}ms / ${p99}ms`);

if (jankyPct > BUDGET_PCT || median > BUDGET_MEDIAN) {
  console.log("\nVERDICT: RED — the keyboard transition drops frames. The flash is reproducible.");
  process.exit(1);
}
console.log("\nVERDICT: green — transitions stay inside budget.");
process.exit(0);