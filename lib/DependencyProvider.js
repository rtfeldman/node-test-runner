// @flow

const fs = require('fs');
const os = require('os');
const path = require('path');

// Cache of existing versions according to the package website.
let onlineVersionsCache /*: Map<string, Array<string>> */ = new Map();

// Memoization cache to avoid doing the same work twice in listAvailableVersions.
// This is to be cleared before each call to solve_deps().
const listVersionsMemoCache /*: Map<string, Array<string>> */ = new Map();

function fetchElmJsonOnline(
  pkg /*: string */,
  version /*: string */,
  syncGetWorker
) /*: string */ {
  try {
    return fetchElmJsonOffline(pkg, version);
  } catch (_) {
    const remoteUrl = remoteElmJsonUrl(pkg, version);
    const elmJson = syncGetWorker.get(remoteUrl);
    const cachePath = cacheElmJsonPath(pkg, version);
    const parentDir = path.dirname(cachePath);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(cachePath, elmJson);
    return elmJson;
  }
}

function fetchElmJsonOffline(
  pkg /*: string */,
  version /*: string */
) /*: string */ {
  // console.log('Fetching: ' + pkg + ' @ ' + version);
  try {
    return fs.readFileSync(homeElmJsonPath(pkg, version), 'utf8');
  } catch (_) {
    try {
      return fs.readFileSync(cacheElmJsonPath(pkg, version), 'utf8');
    } catch (_) {
      throw `Offline mode, so we fail instead of doing a remote request.`;
    }
  }
}

function updateOnlineVersionsCache(syncGetWorker) /*: void */ {
  const pubgrubHome = path.join(elmHome(), 'pubgrub');
  fs.mkdirSync(pubgrubHome, { recursive: true });
  const cachePath = path.join(pubgrubHome, 'versions_cache.json');
  const remotePackagesUrl = 'https://package.elm-lang.org/all-packages';
  if (onlineVersionsCache.size === 0) {
    try {
      // Read from disk what is already cached, and complete with a request to the package server.
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      onlineVersionsCache = parseOnlineVersions(cache);
      updateCacheWithRequestSince(cachePath, remotePackagesUrl, syncGetWorker);
    } catch (_) {
      // The cache file does not exist, let's download it all.
      updateCacheFromScratch(cachePath, remotePackagesUrl, syncGetWorker);
    }
  } else {
    // The cache is not empty, we just need to update it.
    updateCacheWithRequestSince(cachePath, remotePackagesUrl, syncGetWorker);
  }
}

// Reset the cache of existing versions from scratch
// with a request to the package server.
function updateCacheFromScratch(
  cachePath /*: string */,
  remotePackagesUrl /*: string */,
  syncGetWorker
) /*: void */ {
  const onlineVersionsJson = syncGetWorker.get(remotePackagesUrl);
  fs.writeFileSync(cachePath, onlineVersionsJson);
  const onlineVersions = JSON.parse(onlineVersionsJson);
  onlineVersionsCache = parseOnlineVersions(onlineVersions);
}

// Update the cache with a request to the package server.
function updateCacheWithRequestSince(
  cachePath /*: string */,
  remotePackagesUrl /*: string */,
  syncGetWorker
) /*: void */ {
  // Count existing versions.
  let versionsCount = 0;
  for (const versions of onlineVersionsCache.values()) {
    versionsCount += versions.length;
  }

  // Complete cache with a remote call to the package server.
  const remoteUrl = remotePackagesUrl + '/since/' + (versionsCount - 1); // -1 to check if no package was deleted.
  const newVersions = JSON.parse(syncGetWorker.get(remoteUrl));
  if (newVersions.length === 0) {
    // Reload from scratch since it means at least one package was deleted from the registry.
    updateCacheFromScratch(cachePath, remotePackagesUrl);
    return;
  }
  // Check that the last package in the list was already in cache
  // since the list returned by the package server is sorted newest first.
  const { pkg, version } = splitPkgVersion(newVersions.pop());
  const cachePkgVersions = onlineVersionsCache.get(pkg);
  if (
    cachePkgVersions !== undefined &&
    cachePkgVersions[cachePkgVersions.length - 1] === version
  ) {
    // Insert (in reverse) newVersions into onlineVersionsCache.
    for (const pkgVersion of newVersions.reverse()) {
      const { pkg, version } = splitPkgVersion(pkgVersion);
      const versionsOfPkg = onlineVersionsCache.get(pkg);
      if (versionsOfPkg === undefined) {
        onlineVersionsCache.set(pkg, [version]);
      } else {
        versionsOfPkg.push(version);
      }
    }
    // Save the updated onlineVersionsCache to disk.
    const onlineVersions = fromEntries(onlineVersionsCache.entries());
    fs.writeFileSync(cachePath, JSON.stringify(onlineVersions));
  } else {
    // There was a problem and a package got deleted from the server.
    updateCacheFromScratch(cachePath, remotePackagesUrl);
  }
}

function listAvailableVersionsOnline(pkg /*: string */) /*: Array<string> */ {
  const memoVersions = listVersionsMemoCache.get(pkg);
  if (memoVersions !== undefined) {
    return memoVersions;
  }
  const offlineVersions = listAvailableVersionsOffline(pkg);
  const allVersionsSet = new Set(versionsFromOnlineCache(pkg));
  // Combine local and online versions.
  for (const version of offlineVersions) {
    allVersionsSet.add(version);
  }
  const allVersions = [...allVersionsSet].sort().reverse();
  listVersionsMemoCache.set(pkg, allVersions);
  return allVersions;
}

// onlineVersionsCache is a Map with pkg as keys.
function versionsFromOnlineCache(pkg /*: string */) /*: Array<string> */ {
  const versions = onlineVersionsCache.get(pkg);
  return versions === undefined ? [] : versions;
}

function listAvailableVersionsOffline(pkg /*: string */) /*: Array<string> */ {
  const memoVersions = listVersionsMemoCache.get(pkg);
  if (memoVersions !== undefined) {
    return memoVersions;
  }

  // console.log('List versions of: ' + pkg);
  let offlineVersions;
  try {
    offlineVersions = fs.readdirSync(homePkgPath(pkg));
  } catch (_) {
    // console.log(
    //   `Directory "${homePkgPath(pkg)}" does not exist for package ${pkg}.`
    // );
    // console.log(
    //   `Offline mode, so we return [] for the list of versions of ${pkg}.`
    // );
    offlineVersions = [];
  }

  // Reverse order of subdirectories to have newest versions first.
  offlineVersions.reverse();
  listVersionsMemoCache.set(pkg, offlineVersions);
  return offlineVersions;
}

function clearListVersionsMemoCacheBeforeSolve() /*: void */ {
  listVersionsMemoCache.clear();
}

// Helper functions ##################################################

// We can replace this with using `Object.fromEntires` once Node.js 10 is
// EOL 2021-04-30 and support for Node.js 10 is dropped.
function fromEntries(entries) {
  const res = {};
  for (const [key, value] of entries) {
    res[key] = value;
  }
  return res;
}

function parseOnlineVersions(
  json /*: mixed */
) /*: Map<string, Array<string>> */ {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error(
      `Expected an object, but got: ${json === null ? 'null' : typeof json}`
    );
  }

  const result = new Map();

  for (const [key, value] of Object.entries(json)) {
    result.set(key, parseVersions(key, value));
  }

  return result;
}

function parseVersions(
  key /*: string */,
  json /*: mixed */
) /*: Array<string> */ {
  if (!Array.isArray(json)) {
    throw new Error(
      `Expected ${JSON.stringify(key)} to be an array, but got: ${typeof json}`
    );
  }

  const result = [];

  for (const [index, item] of json.entries()) {
    if (typeof item !== 'string') {
      throw new Error(
        `Expected${JSON.stringify(
          key
        )}->${index} to be a string, but got: ${typeof item}`
      );
    }
    result.push(item);
  }

  return result;
}

function remoteElmJsonUrl(
  pkg /*: string */,
  version /*: string */
) /*: string */ {
  return `https://package.elm-lang.org/packages/${pkg}/${version}/elm.json`;
}

function cacheElmJsonPath(
  pkg /*: string */,
  version /*: string */
) /*: string */ {
  const parts = splitAuthorPkg(pkg);
  return path.join(
    elmHome(),
    'pubgrub',
    'elm_json_cache',
    parts.author,
    parts.pkg,
    version,
    'elm.json'
  );
}

function homeElmJsonPath(
  pkg /*: string */,
  version /*: string */
) /*: string */ {
  return path.join(homePkgPath(pkg), version, 'elm.json');
}

function homePkgPath(pkg /*: string */) /*: string */ {
  const parts = splitAuthorPkg(pkg);
  return path.join(elmHome(), '0.19.1', 'packages', parts.author, parts.pkg);
}

function splitAuthorPkg(pkgIdentifier /*: string */) /*: {
  author: string,
  pkg: string,
} */ {
  const parts = pkgIdentifier.split('/');
  return { author: parts[0], pkg: parts[1] };
}

function splitPkgVersion(str /*: string */) /*: {
  pkg: string,
  version: string,
} */ {
  const parts = str.split('@');
  return { pkg: parts[0], version: parts[1] };
}

function elmHome() /*: string */ {
  const elmHomeEnv = process.env['ELM_HOME'];
  return elmHomeEnv === undefined ? defaultElmHome() : elmHomeEnv;
}

function defaultElmHome() /*: string */ {
  return process.platform === 'win32'
    ? defaultWindowsElmHome()
    : defaultUnixElmHome();
}

function defaultUnixElmHome() /*: string */ {
  return path.join(os.homedir(), '.elm');
}

function defaultWindowsElmHome() /*: string */ {
  const appData = process.env.APPDATA;
  const dir =
    appData === undefined
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : appData;
  return path.join(dir, 'elm');
}

module.exports = {
  fetchElmJsonOffline,
  fetchElmJsonOnline,
  updateOnlineVersionsCache,
  clearListVersionsMemoCacheBeforeSolve,
  listAvailableVersionsOnline,
  listAvailableVersionsOffline,
};
