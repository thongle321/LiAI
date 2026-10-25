import { phononEngine } from "../index.ts";

test("phonon engine smoke", async () => {
  expect(phononEngine.id).toBe("phonon");
  const voices = await phononEngine.getVoices();
  expect(voices.length).toBeGreaterThan(0);
  expect(await phononEngine.isInstalled()).toBe(false);
});