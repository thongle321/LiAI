
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
  expect(selectHexagonDevice([CPU, HTP])).toEqual(HTP);
  expect(selectHexagonDevice([CPU])).toEqual(undefined);
  expect(selectHexagonDevice([])).toEqual(undefined);
});

test("selectHexagonDevice rejects llama.cpp wildcard entries", () => {
  // Names carrying * or ? are disabled/wildcard entries, not hardware.
  expect(selectHexagonDevice([dev("HTP*", "npu")])).toEqual(undefined);
  expect(selectHexagonDevice([dev("HTP?", "npu")])).toEqual(undefined);
});

test("selectGpuDevice takes the gpu-typed device", () => {
  expect(selectGpuDevice([CPU, GPU])).toEqual(GPU);
  expect(selectGpuDevice([CPU, HTP])).toEqual(undefined);
  expect(selectGpuDevice([])).toEqual(undefined);
});

test("getDeviceAvailability summarizes what the phone reports", () => {
  expect(getDeviceAvailability([HTP, GPU, CPU])).toEqual({
    hasHexagon: true,
    hasGpu: true,
  });
  expect(getDeviceAvailability([CPU])).toEqual({
    hasHexagon: false,
    hasGpu: false,
  });
});

test("resolveComputeDevices: opted-in NPU resolves to the real HTP name", () => {
  expect(resolveComputeDevices(true, 25, [CPU, HTP])).toEqual({
    devices: ["HTPv73"],
    nGpuLayers: 25,
  });
});

test("resolveComputeDevices: opted-in NPU with no HTP falls back to default", () => {
  // No raw "HTP*" wildcard is ever passed through: without hardware the
  // instruction is omitted (platform default), never a dangling name.
  expect(resolveComputeDevices(true, 25, [CPU, GPU])).toEqual({
    devices: undefined,
    nGpuLayers: 25,
  });
  expect(resolveComputeDevices(true, 25, [CPU])).toEqual({
    devices: undefined,
    nGpuLayers: 0,
  });
});

test("resolveComputeDevices: CPU-only phones init like PocketPal's CPU option", () => {
  expect(resolveComputeDevices(false, 25, [CPU])).toEqual({
    devices: undefined,
    nGpuLayers: 0,
  });
  expect(resolveComputeDevices(false, 25, [CPU, GPU])).toEqual({
    devices: undefined,
    nGpuLayers: 25,
  });
});
