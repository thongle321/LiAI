/** checkMicAccess: the mic's state WITHOUT prompting.
 *
 *  Voice-mode entry reads this as its setup gate — the gate must never
 *  pop the OS dialog (asking is the setup sheet's job, over
 *  ensureMicAccess). These pin the mapping from the native module's
 *  permission shape to the four outcomes, including the two "askable"
 *  and "permanent" splits.
 */

import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { checkMicAccess } from "../mic-access";

/** The slice of the native permission response the mapping reads. */
function seed(res: { granted: boolean; canAskAgain: boolean }): void {
  (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockResolvedValue(
    res,
  );
}

describe("checkMicAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("granted passes without ever asking", async () => {
    seed({ granted: true, canAskAgain: true });

    await expect(checkMicAccess()).resolves.toBe("granted");
    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync,
    ).not.toHaveBeenCalled();
  });

  it("askable-but-unanswered reads undetermined", async () => {
    seed({ granted: false, canAskAgain: true });

    await expect(checkMicAccess()).resolves.toBe("undetermined");
    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync,
    ).not.toHaveBeenCalled();
  });

  it("a permanent denial reads settings", async () => {
    seed({ granted: false, canAskAgain: false });

    await expect(checkMicAccess()).resolves.toBe("settings");
    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync,
    ).not.toHaveBeenCalled();
  });

  it("a native module gap reads unavailable, without throwing", async () => {
    (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error("no native module"),
    );

    await expect(checkMicAccess()).resolves.toBe("unavailable");
  });
});

