const { withAndroidManifest } = require('expo/config-plugins');

// Keep camera-less devices installable: mark camera features optional.
const OPTIONAL_CAMERA_FEATURES = ['android.hardware.camera', 'android.hardware.camera.any'];

function ensureOptionalCameraFeatures(manifest) {
  const existing = manifest['uses-feature'];
  const list = [];
  if (Array.isArray(existing)) {
    list.push(...existing);
  } else if (existing) {
    list.push(existing);
  }
  const byName = new Map();
  for (const entry of list) {
    const name = entry?.$?.['android:name'];
    if (name) byName.set(name, entry);
  }
  for (const name of OPTIONAL_CAMERA_FEATURES) {
    const entry = byName.get(name);
    if (entry) {
      entry.$ = { ...(entry.$ || {}), 'android:name': name, 'android:required': 'false' };
    } else {
      byName.set(name, { $: { 'android:name': name, 'android:required': 'false' } });
    }
  }
  manifest['uses-feature'] = [...byName.values()];
  return manifest;
}

module.exports = (config) =>
  withAndroidManifest(config, (configWithManifest) => {
    configWithManifest.modResults.manifest = ensureOptionalCameraFeatures(
      configWithManifest.modResults.manifest,
    );
    return configWithManifest;
  });
