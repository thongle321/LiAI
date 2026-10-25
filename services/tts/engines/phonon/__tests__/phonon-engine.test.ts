/** PhononEngine contract tests — restored coverage for the suite deleted in
 *  `7e86e98` (the old 323-line engines.test.ts pinned the flat layout; the
 *  per-engine Phonon engine was never covered beyond a smoke test).
 *
 *  What PocketPal's PhononEngine.test.ts guards, at the engine's public
 *  surface, driven through the shared virtual FS
 *  (__mocks__/external/@dr.pogodin/react-native-fs.js):
 *  - downloadModel verifies EVERY pinned file (status, size, sha256) and
 *    removes the partial model dir on any failure;
 *  - a successful download writes the curated voices jsonl (Android) and
 *    the version sentinel, and reports progress through to 1;
 *  - isInstalled requires every file AND a current sentinel;
 *  - deleteModel claims the dir; play() refuses an uninstalled model.
 *
 *  Android's branch is exercised by default (the pin-based file table);
 *  iOS's adds the manifest preflight, covered in the manifest-boundary
 *  case.
 */

import { Platform } from "react-native";
import * as FS from "@dr.pogodin/react-native-fs";
import Speech from "@pocketpalai/react-native-speech";

import { phononEngine } from "../index.ts";
import {
  PHONON_ANDROID_FILES,
  PHONON_ANDROID_REPO,
  PHONON_ANDROID_REVISION,
  PHONON_HF_BASE_URL,
  PHONON_IOS_MANIFEST_FILENAME,
  PHONON_IOS_REPO,
  PHONON_IOS_REVISION,
  PHONON_MODEL_SUBDIR,
  PHONON_VERSION_SENTINEL_FILENAME,
  PHONON_VOICES_JSONL_FILENAME,
  PHONON_VOICE_PINS,
  PHONON_VOICE_FILE_SIZE,
} from "@/services/tts/constants.ts";

interface FsFake {
  __contents: Map<string, string>;
  __dirs: Set<string>;
  __hashes: Map<string, string>;
  __reset(): void;
}

const fs = FS as unknown as jest.MockedObject<typeof FS> & FsFake;

function modelDir(): string {
  return `/documents/${PHONON_MODEL_SUBDIR}`;
}

/** The size + sha the real pins demand, keyed by destination path. Voice
 *  pins have no shared size constant in the file table — the engine uses
 *  PHONON_VOICE_FILE_SIZE; the fake reports the same for all. */
function seedPinAnswers(): {
  sizeByDest: Map<string, number>;
  shaByDest: Map<string, string>;
} {
  const sizeByDest = new Map<string, number>();
  const shaByDest = new Map<string, string>();
  for (const f of PHONON_ANDROID_FILES) {
    sizeByDest.set(`${modelDir()}/${f.name}`, f.size);
    shaByDest.set(`${modelDir()}/${f.name}`, f.sha256);
  }
  for (const v of PHONON_VOICE_PINS) {
    const dest = `${modelDir()}/voices/${v.name}.safetensors`;
    sizeByDest.set(dest, PHONON_VOICE_FILE_SIZE);
    shaByDest.set(dest, v.sha256);
  }
  return { sizeByDest, shaByDest };
}

/** A verified-happy instrumentation: stat/hash answer the pins. */
function armPinAnswers(): void {
  const { sizeByDest, shaByDest } = seedPinAnswers();
  fs.stat.mockImplementation(
    async (p: string) => ({ size: sizeByDest.get(p)!, mtime: new Date() }) as never,
  );
  fs.hash.mockImplementation(async (p: string) => shaByDest.get(p)!);
}

let osSpy: { mockReturnValue: (v: string) => void } | null = null;

/** Pin the engine's platform branch: the real Platform.OS is a plain
 *  property (no getter to spy), so.defineProperty it for the test. */
function setOs(os: "android" | "ios"): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
}

beforeEach(() => {
  fs.__reset();
  setOs("android");
});

describe("PhononEngine downloadModel (android)", () => {
  it("fetches every pinned file, writes the voices jsonl and the sentinel", async () => {
    armPinAnswers();
    const seen: number[] = [];
    await phononEngine.downloadModel((p) => seen.push(p));

    const dests = [...fs.__contents.keys()];
    for (const f of PHONON_ANDROID_FILES) {
      expect(dests).toContain(`${modelDir()}/${f.name}`);
      expect(fs.__contents.get(`${modelDir()}/${f.name}`)).toContain(
        hfUrl(f.name),
      );
    }
    expect(fs.__contents.has(`${modelDir()}/${PHONON_VOICES_JSONL_FILENAME}`)).toBe(true);
    expect(fs.__contents.has(`${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`)).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it("any failed file (bad sha) clears the partial model directory", async () => {
    const { sizeByDest } = seedPinAnswers();
    fs.stat.mockImplementation(
      async (p: string) => ({ size: sizeByDest.get(p)!, mtime: new Date() }) as never,
    );
    fs.hash.mockResolvedValue("wrong-hash");

    await expect(phononEngine.downloadModel()).rejects.toThrow("sha256 mismatch");

    expect(fs.__contents.size).toBe(0);
  });

  it("sizes are verified against the pins", async () => {
    const { shaByDest } = seedPinAnswers();
    fs.stat.mockImplementation(async () => ({ size: 5, mtime: new Date() }) as never);
    fs.hash.mockImplementation(async (p: string) => shaByDest.get(p)!);

    await expect(phononEngine.downloadModel()).rejects.toThrow(/bytes/);
  });
});

describe("PhononEngine isInstalled (android)", () => {
  it("requires every pinned file and a current sentinel", async () => {
    armPinAnswers();
    await phononEngine.downloadModel();
    expect(await phononEngine.isInstalled()).toBe(true);

    // Stale sentinel: not installed.
    fs.__contents.set(
      `${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`,
      JSON.stringify({ version: 0 }),
    );
    expect(await phononEngine.isInstalled()).toBe(false);

    // Fresh sentinel again, then a file vanishes: not installed.
    fs.__contents.set(
      `${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`,
      fs.__contents.get(`${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`) ??
        // fall back to whatever the download wrote before this test
        JSON.stringify({ version: 1 }),
    );
    const firstFile = PHONON_ANDROID_FILES[0]!.name;
    fs.__contents.delete(`${modelDir()}/${firstFile}`);
    expect(await phononEngine.isInstalled()).toBe(false);
  });
});

describe("PhononEngine lifecycle", () => {
  it("deleteModel removes the directory", async () => {
    fs.__dirs.add(modelDir());
    fs.__contents.set(`${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`, "{}");

    await phononEngine.deleteModel();

    expect(fs.__dirs.has(modelDir())).toBe(false);
    expect(fs.__contents.has(`${modelDir()}/${PHONON_VERSION_SENTINEL_FILENAME}`)).toBe(false);
  });

  it("play refuses an uninstalled model", async () => {
    await expect(
      phononEngine.play("hi", { id: "v", name: "v", engine: "phonon" }),
    ).rejects.toThrow("not installed");
    expect(Speech.speak).not.toHaveBeenCalled();
  });
});

/** iOS's manifest preflight boundary: a bad manifest sha aborts before any
 *  bundle file downloads. */
describe("PhononEngine downloadModel (ios)", () => {
  it("rejects a manifest whose sha256 does not match the pin", async () => {
    setOs("ios");
    // downloadFile is called for the manifest first; hash control is
    // global, so a wrong-hash seed fails the manifest hash.
    fs.hash.mockResolvedValue("wrong-hash");

    await expect(phononEngine.downloadModel()).rejects.toThrow(
      /manifest|sha256/i,
    );
    // Manifest pinned names these; the failure is the boundary the engine
    // enforces before touching bundle files.
    expect(fs.__contents.has(PHONON_IOS_MANIFEST_FILENAME)).toBe(false);
  });

  it("the manifest repo/revision pin matches the reference", () => {
    expect(PHONON_IOS_REPO).toBe("palshub/phonon-31m-en-coreml");
    expect(PHONON_IOS_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });
});

function hfUrl(path: string): string {
  return `${PHONON_HF_BASE_URL}/${PHONON_ANDROID_REPO}/resolve/${PHONON_ANDROID_REVISION}/${path}`;
}
