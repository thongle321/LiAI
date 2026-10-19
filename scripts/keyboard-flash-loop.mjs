/**
 * Keyboard-flash feedback loop (Phase 1 of docs/research/2026-10-10-
 * pocketpal-chat-keyboard-port.md §4a).
 *
 *   node scripts/keyboard-flash-loop.mjs [--toggles 20] [--settle 900]
 *
 * Drives the attached Android device: taps the composer to raise the
 * keyboard, ESCAPEs to drop it, and samples raw `screencap` frames through
 * the transition. A frame whose band signature matches NEITHER settled
 * state (keyboard down, keyboard up) is a transient — the flash.
 *
 * Why two bands: the two surviving suspects look different on screen.
 * `KeyboardChatScrollView` writing its padding unanimated moves the
 * composer band only. `windowSoftInputMode="adjustResize"` shrinking the
 * window moves EVERYTHING, including the header, and no layout
 * compensation can hold that. This loop tells them apart, which is the
 * distinction the port doc's §4 protocol asked a human to eyeball.
 *
 * HONEST LIMIT: each `screencap` round-trip is ~150-300ms, so a one-frame
 * (16ms) flash can fall between samples. The repetition count exists to
 * raise the reproduction rate, not to improve resolution. A clean run is
 * "no flash observed in N toggles", NOT "there is no flash" — see the
 * probe loop in the port doc for an event-resolution instrument.
 *
 * Exit 0 = no transient observed. Exit 1 = a transient was caught.
 */

import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const TOGGLES = flag("toggles", 20);
const SETTLE_MS = flag("settle", 900);

function adb(argsList, { binary = false } = {}) {
  const out = execFileSync("adb", argsList, {
    encoding: binary ? "buffer" : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out;
}

/** The first usable transport; the phone advertises itself twice (TCP + mDNS). */
function device() {
  const lines = adb(["devices"]).split("\n").slice(1);
  const serials = lines
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === "device")
    .map((p) => p[0]);
  if (serials.length === 0) throw new Error("no adb device attached");
  for (const s of serials) {
    if (spawnSync("adb", ["-s", s, "shell", "echo", "ok"]).status === 0) return s;
  }
  throw new Error(`found ${serials.length} devices but none answered a shell`);
}

const SERIAL = device();
console.log(`device: ${SERIAL}`);

let SIZE = null;
/** Raw screencap: w, h, format, [colorspace], then RGBA_8888 pixels.
 *
 *  The pixel block is the WHOLE buffer minus a small header, so the header
 *  size is derived by subtraction — hardcoding it (12 vs 16) breaks on one
 *  API level. Getting this backwards yields an empty slice, NaN means, and
 *  a loop that silently reports "no flash" forever. */
function frame() {
  const buf = adb(["-s", SERIAL, "exec-out", "screencap"], { binary: true });
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const header = buf.length - width * height * 4;
  if (width <= 0 || height <= 0 || header < 8 || header > 64) {
    throw new Error(`unparseable screencap: ${buf.length} bytes, header guess ${header}`);
  }
  const data = buf.subarray(header);
  if (SIZE === null) {
    SIZE = { width, height };
    console.log(`screen: ${width}x${height} (header ${header} bytes)`);
  }
  return { width, height, data };
}

/** Mean RGB of one horizontal band, plus how many distinct colours it holds.
 *  The colour count is what catches a strip that changes fill for a frame:
 *  the mean barely moves, the histogram does. */
function band(f, top, bottom) {
  const { width, height, data } = f;
  const y0 = Math.floor(height * top);
  const y1 = Math.floor(height * bottom);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const seen = new Set();
  for (let y = y0; y < y1; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
      const key = (data[i] >> 3 << 10) | (data[i + 1] >> 3 << 5) | (data[i + 2] >> 3);
      if (seen.size < 64) seen.add(key);
    }
  }
  return { mean: [r / n, g / n, b / n], colours: seen.size };
}

/** A NaN here means the parse failed, and every distance built from it is
 *  silently false — which would make the loop report "no flash" forever. */
function assertFinite(bandSig, where) {
  if (!bandSig.mean.every(Number.isFinite)) {
    throw new Error(`non-finite band mean in ${where} — screencap parse failed`);
  }
  return bandSig;
}

const dist = (a, b) =>
  Math.abs(a.mean[0] - b.mean[0]) + Math.abs(a.mean[1] - b.mean[1]) + Math.abs(a.mean[2] - b.mean[2]);
/** Per-channel mean shifts under ~6/255 are compression noise on a flat fill. */
const NOISE = 18;

function wait(ms) {
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], {
    windowsHide: true,
  });
}

/** Sample the transition, returning every frame's two band signatures.
 *  ONE capture per sample: the top and bottom bands have to come from the
 *  same frame or the whole-screen test compares two different instants. */
async function sample(durationMs) {
  const frames = [];
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    try {
      const f = frame();
      frames.push({
        bottom: assertFinite(band(f, 0.78, 0.97), "bottom"),
        top: assertFinite(band(f, 0.02, 0.12), "top"),
      });
    } catch {
      break; // a screencap can fail mid-animation; skip that sample
    }
  }
  return frames;
}

async function settled() {
  const f = frame();
  return {
    bottom: assertFinite(band(f, 0.78, 0.97), "settled bottom"),
    top: assertFinite(band(f, 0.02, 0.12), "settled top"),
  };
}

const results = [];
let caught = 0;
let framesSampled = 0;
let elapsedMs = 0;

console.log(`\ncomposing 2 settled reference states…`);
await wait(600);
const DOWN = await settled();
await wait(400);

// The composer text field sits at ~0.75 of screen height on this layout
// (measured off a 1080x2392 capture: field centre y≈1794). 0.88 is the tab
// bar — tapping there opens nothing, and the red-capability guard below
// catches exactly that mistake.
const { width, height } = SIZE;
const tapX = Math.round(width / 2);
const tapY = Math.round(height * 0.75);

for (let i = 1; i <= TOGGLES; i++) {
  spawnSync("adb", ["-s", SERIAL, "shell", "input", "tap", String(tapX), String(tapY)]);
  const rising = await sample(SETTLE_MS);
  await wait(400);
  const UP = await settled();

  // RED-CAPABILITY GUARD, on the first toggle only: if the two settled
  // states look the same, the tap never raised the keyboard and the loop
  // is not driving the bug path at all. A "no transient" verdict from a
  // loop that never toggled is worse than no verdict.
  if (i === 1) {
    const gap = dist(UP.bottom, DOWN.bottom);
    if (gap <= NOISE) {
      console.error(
        `\nABORT: the two settled states are indistinguishable (Δ=${Math.round(gap)},` +
          ` threshold ${NOISE}). The tap at ${tapX},${tapY} did not raise the` +
          ` keyboard, so this loop cannot see the bug. Check the composer` +
          ` coordinates, or whether the screen is the chat screen at all.`,
      );
      process.exit(2);
    }
    console.log(
      `settled states differ by Δ=${Math.round(gap)} in the composer band — the` +
        ` tap does raise the keyboard, so the loop is driving the path.`,
    );
  }

  spawnSync("adb", ["-s", SERIAL, "shell", "input", "keyevent", "111"]); // ESCAPE
  const falling = await sample(SETTLE_MS);
  await wait(400);

  for (const [label, frames] of [["rise", rising], ["fall", falling]]) {
    framesSampled += frames.length;
    elapsedMs += SETTLE_MS * 2;
    for (const [n, f] of frames.entries()) {
      const dBottom = dist(f.bottom, DOWN.bottom);
      const dUpBottom = dist(f.bottom, UP.bottom);
      const dTop = dist(f.top, DOWN.top);
      if (dBottom > NOISE && dUpBottom > NOISE) {
        // Differs from BOTH settled states → a transient.
        caught += 1;
        results.push({
          toggle: i,
          phase: label,
          frame: n,
          wholeScreen: dTop > NOISE,
          dBottom: Math.round(dBottom),
          dUpBottom: Math.round(dUpBottom),
          dTop: Math.round(dTop),
        });
      }
    }
  }
  process.stdout.write(`\r  toggle ${i}/${TOGGLES} — ${caught} transient(s) so far   `);
}
console.log("\n");
const fps = elapsedMs > 0 ? (framesSampled / elapsedMs) * 1000 : 0;
// A flash that lasts one frame at 60Hz is ~16ms. Quantify what this run
// could actually have seen, so "no transient" is read with its resolution.
console.log(
  `sampled ${framesSampled} frames across the transitions (~${fps.toFixed(1)} fps).`,
);
console.log(
  `A ${Math.round(1000 / Math.max(fps, 0.1))}ms sampling window: a flash shorter than that can fall between samples.`,
);

if (caught === 0) {
  console.log(`VERDICT: no transient observed in ${TOGGLES} toggles.`);
  console.log("This is NOT proof there is no flash — see HONEST LIMIT at the top.");
  process.exit(0);
}

const wholeScreen = results.filter((r) => r.wholeScreen).length;
console.log(`VERDICT: ${caught} transient frame(s) in ${TOGGLES} toggles.`);
console.log(`  ${wholeScreen}/${caught} also changed the header band → WHOLE-SCREEN move`);
console.log(
  wholeScreen > caught / 2
    ? "  → points at window resize (adjustResize), not layout compensation"
    : "  → bottom band only: composer/list content (contentInset snap is the ranked suspect)",
);
console.log("\nfirst 10:");
for (const r of results.slice(0, 10)) console.log("   ", JSON.stringify(r));
process.exit(1);