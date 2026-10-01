import { test } from "node:test";
import assert from "node:assert/strict";
import type { NativeBackendDeviceInfo } from "llama.rn";
import {
  getDeviceAvailability,
  resolveComputeDevices,
  selectGpuDevice,
  selectHexagonDevice,
} from "../lib/inference/deviceSelection.ts";

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
