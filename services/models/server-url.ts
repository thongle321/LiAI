// isServerUrl — the QR-scan validation rule ported from PocketPal's
// `ServerQRScanner`. Accepts only http:/https: codes that parse into a
// non-empty hostname; everything else is treated as an unrelated QR
// (rejected payload, camera keeps scanning).
export function isServerUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.hostname.length > 0
  );
}
