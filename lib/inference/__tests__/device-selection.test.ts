const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

import type { NativeBackendDeviceInfo } from "llama.rn";
import {
  getDeviceAvailability,
  resolveComputeDevices,
  selectGpuDevice,
  selectHexagonDevice,
} from "../deviceSelection";

// Port of PocketPal's deviceSelection.ts selection rules
// (pocketpal-ai/src/utils/deviceSelection.ts): the UI gates and the init
// patch must follow what the phone actually reports, not the platform.

const dev = (
  deviceName: string,
  type: string,
): NativeBackendDeviceInfo => ({
  backend: type === "gpu" ? "OpenCL" : "CPU",
  type,
  deviceName,
  maxMemorySize: 0,
});

const HTP = dev("HTPv73", "npu");
const GPU = dev("Adreno (TM) 740", "gpu");
const CPU = dev("CPU", "cpu");

test("selectHexagonDevice takes the first real HTP device", () => {
  assert.equal(selectHexagonDevice([CPU, HTP]), HTP);
  assert.equal(selectHexagonDevice([CPU]), undefined);
  assert.equal(selectHexagonDevice([]), undefined);
});

test("selectHexagonDevice rejects llama.cpp wildcard entries", () => {
  // Names carrying * or ? are disabled/wildcard entries, not hardware.
  assert.equal(selectHexagonDevice([dev("HTP*", "npu")]), undefined);
  assert.equal(selectHexagonDevice([dev("HTP?", "npu")]), undefined);
});

test("selectGpuDevice takes the gpu-typed device", () => {
  assert.equal(selectGpuDevice([CPU, GPU]), GPU);
  assert.equal(selectGpuDevice([CPU, HTP]), undefined);
  assert.equal(selectGpuDevice([]), undefined);
});

test("getDeviceAvailability summarizes what the phone reports", () => {
  assert.deepEqual(getDeviceAvailability([HTP, GPU, CPU]), {
    hasHexagon: true,
    hasGpu: true,
  });
  assert.deepEqual(getDeviceAvailability([CPU]), {
    hasHexagon: false,
    hasGpu: false,
  });
});

test("resolveComputeDevices: opted-in NPU resolves to the real HTP name", () => {
  assert.deepEqual(resolveComputeDevices(true, 25, [CPU, HTP]), {
    devices: ["HTPv73"],
    nGpuLayers: 25,
  });
});

test("resolveComputeDevices: opted-in NPU with no HTP falls back to default", () => {
  // No raw "HTP*" wildcard is ever passed through: without hardware the
  // instruction is omitted (platform default), never a dangling name.
  assert.deepEqual(resolveComputeDevices(true, 25, [CPU, GPU]), {
    devices: undefined,
    nGpuLayers: 25,
  });
  assert.deepEqual(resolveComputeDevices(true, 25, [CPU]), {
    devices: undefined,
    nGpuLayers: 0,
  });
});

test("resolveComputeDevices: CPU-only phones init like PocketPal's CPU option", () => {
  assert.deepEqual(resolveComputeDevices(false, 25, [CPU]), {
    devices: undefined,
    nGpuLayers: 0,
  });
  assert.deepEqual(resolveComputeDevices(false, 25, [CPU, GPU]), {
    devices: undefined,
    nGpuLayers: 25,
  });
});
