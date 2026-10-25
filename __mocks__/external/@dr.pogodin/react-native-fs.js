/** Virtual-filesystem fake for @dr.pogodin/react-native-fs: a Map-backed
 *  FS the TTS engine suites drive. Every function is a jest.fn with a
 *  working default, so a suite can override per case
 *  (e.g. fs.exists.mockResolvedValueOnce(false)) without leaking past the
 *  file — jest resets module mocks between suites. Shared here, not
 *  per-suite, because several engines consume it.
 *
 *  hash() defaults to a controlled map (__hashes); a suite seeds the
 *  sha256 it wants a dest to report, mirroring what the real file would
 *  hash to.
 */

const contents = new Map();
const hashes = new Map();

/** Virtual directories mkdir has seen — `mkdir` records them so tests can
 *  assert tree construction. */
const dirs = new Set();

function dirname(path) {
  return path.slice(0, path.lastIndexOf('/'));
}

const mkdir = jest.fn(async (path) => {
  dirs.add(path);
});

const exists = jest.fn(async (path) => {
  return contents.has(path) || dirs.has(path);
});

const readFile = jest.fn(async (path) => {
  if (!contents.has(path)) {
    const err = new Error('ENOENT: no such file ' + path);
    err.code = 'ENOENT';
    throw err;
  }
  return contents.get(path);
});

const writeFile = jest.fn(async (path, data) => {
  contents.set(path, String(data));
  dirs.add(dirname(path));
});

const unlink = jest.fn(async (path) => {
  if (dirs.has(path)) {
    for (const key of [...contents.keys(), ...dirs]) {
      if (key === path || key.indexOf(path + '/') === 0) {
        contents.delete(key);
        dirs.delete(key);
      }
    }
    dirs.delete(path);
    return;
  }
  contents.delete(path);
});

const stat = jest.fn(async (path) => ({
  size: (contents.get(path) ?? '').length,
  mtime: new Date(),
}));

const hash = jest.fn(async (path) => {
  const seeded = hashes.get(path);
  if (seeded !== undefined) return seeded;
  return 'deadbeef' + '0'.repeat(56);
});

const downloadFile = jest.fn((options) => {
  const text = 'bytes:' + options.fromUrl;
  contents.set(options.toFile, text);
  dirs.add(dirname(options.toFile));
  const result = { statusCode: 200, bytesWritten: text.length };
  return { jobId: 1, promise: Promise.resolve(result) };
});

const read = jest.fn(async (path) => contents.get(path) ?? '');

module.exports = {
  // Directory roots, as the real module exposes them.
  DocumentDirectoryPath: '/documents',
  LibraryDirectoryPath: '/library',
  CachesDirectoryPath: '/caches',
  MainBundlePath: '/bundle',
  ExternalDirectoryPath: '/external',
  exists,
  readFile,
  writeFile,
  unlink,
  mkdir,
  stat,
  hash,
  downloadFile,
  read,
  // Test controls.
  __contents: contents,
  __dirs: dirs,
  __hashes: hashes,
  __reset() {
    contents.clear();
    dirs.clear();
    for (const key of Array.from(hashes.keys())) delete hashes[key];
    [exists, readFile, writeFile, unlink, mkdir, stat, hash, downloadFile, read].forEach(
      function (fn) {
        fn.mockClear();
      },
    );
  },
};
