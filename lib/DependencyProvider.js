// @flow

const fs = require('fs');
const os = require('os');
const path = require('path');
const wasm = require('elm-solve-deps-wasm');
const SyncGet = require('./SyncGet.js');
const collator = new Intl.Collator('en', { numeric: true }); // for sorting SemVer strings

// Initialization work done only once.
wasm.init();
const syncGetWorker /*: {| get: (string) => string, shutDown: () => void |} */ =
  SyncGet.startWorker();

// Cache of existing versions according to the package website.
let onlineVersionsCache /*: Map<string, Array<string>> */ = new Map();

// Memoization cache to avoid doing the same work twice in listAvailableVersions.
// This is to be cleared before each call to solve_deps().
const listVersionsMemoCache /*: Map<string, Array<string>> */ = new Map();

// Solve dependencies completely offline, without any http request.
function solveOffline(
  elmJson /*: string */,
  useTest /*: boolean */,
  extra /*: { [string]: string } */
) /*: string */ {
  listVersionsMemoCache.clear();
  try {
    return wasm.solve_deps(
      elmJson,
      useTest,
      extra,
      fetchElmJsonOffline,
      listAvailableVersionsOffline
    );
  } catch (errorMessage) {
    throw new Error(errorMessage);
  }
}

// Solve dependencies with http requests when required.
function solveOnline(
  elmJson /*: string */,
  useTest /*: boolean */,
  extra /*: { [string]: string } */
) /*: string */ {
  updateOnlineVersionsCache();
  listVersionsMemoCache.clear();
  try {
    return wasm.solve_deps(
      elmJson,
      useTest,
      extra,
      fetchElmJsonOnline,
      listAvailableVersionsOnline
    );
  } catch (errorMessage) {
    throw new Error(errorMessage);
  }
}

function fetchElmJsonOnline(
  pkg /*: string */,
  version /*: string */
) /*: string */ {
  try {
    return fetchElmJsonOffline(pkg, version);
  } catch (_) {
    // `fetchElmJsonOffline` can only fail in ways that are either expected
    // (such as file does not exist or no permissions)
    // or because there was an error parsing `pkg` and `version`.
    // In such case, this will throw again with `cacheElmJsonPath()` so it's fine.
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
  try {
    return fs.readFileSync(homeElmJsonPath(pkg, version), 'utf8');
  } catch (_) {
    // The read can only fail if the elm.json file does not exist
    // or if we don't have the permissions to read it so it's fine to catch all.
    // Otherwise, it means that `homeElmJsonPath()` failed while processing `pkg` and `version`.
    // In such case, again, it's fine to catch all since the next call to `cacheElmJsonPath()`
    // will fail the same anyway.
    return fs.readFileSync(cacheElmJsonPath(pkg, version), 'utf8');
  }
}

// Update the `onlineVersionsCache` global variable.
function updateOnlineVersionsCache() /*: void */ {
  const pubgrubHome = path.join(elmHome(), 'pubgrub');
  fs.mkdirSync(pubgrubHome, { recursive: true });
  const cachePath = path.join(pubgrubHome, 'versions_cache.json');
  const remotePackagesUrl = 'https://package.elm-lang.org/all-packages';
  if (onlineVersionsCache.size === 0) {
    let cacheFile;
    try {
      // Read from disk existing versions which are already cached.
      cacheFile = fs.readFileSync(cachePath, 'utf8');
    } catch (_) {
      // The cache file does not exist so let's reset it.
      updateCacheFromScratch(cachePath, remotePackagesUrl);
      return;
    }
    try {
      onlineVersionsCache = parseOnlineVersions(JSON.parse(cacheFile));
    } catch (error) {
      throw new Error(
        `Failed to parse the cache file ${cachePath}.\n${error.message}`
      );
    }
  }
  updateCacheWithRequestSince(cachePath, remotePackagesUrl);
}

// Reset the cache of existing versions from scratch
// with a request to the package server.
function updateCacheFromScratch(
  cachePath /*: string */,
  remotePackagesUrl /*: string */
) /*: void */ {
  const onlineVersionsJson = syncGetWorker.get(remotePackagesUrl);
  fs.writeFileSync(cachePath, onlineVersionsJson);
  const onlineVersions = JSON.parse(onlineVersionsJson);
  try {
    onlineVersionsCache = parseOnlineVersions(onlineVersions);
  } catch (error) {
    throw new Error(
      `Failed to parse the response from the request to ${remotePackagesUrl}.\n${error.message}`
    );
  }
}

// Update the cache with a request to the package server.
function updateCacheWithRequestSince(
  cachePath /*: string */,
  remotePackagesUrl /*: string */
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
    const onlineVersions = Object.fromEntries(onlineVersionsCache.entries());
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
  const allVersions = [...allVersionsSet].sort(semverCompare).reverse();
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

  const pkgPath = homePkgPath(pkg);
  let offlineVersions;
  try {
    offlineVersions = fs.readdirSync(pkgPath);
  } catch (_) {
    // The directory doesn't exist or we don't have permissions.
    // It's fine to catch all cases and return an empty list.
    offlineVersions = [];
  }

  // Reverse order of subdirectories to have newest versions first.
  offlineVersions.sort(semverCompare).reverse();
  listVersionsMemoCache.set(pkg, offlineVersions);
  return offlineVersions;
}

// Helper functions ##################################################

function semverCompare(a /*: string */, b /*: string */) /*: number */ {
  return collator.compare(a, b);
}

function parseOnlineVersions(
  json /*: mixed */
) /*: Map<string, Array<string>> */ {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error(
      `Expected an object, but got: ${
        json === null ? 'null' : Array.isArray(json) ? 'Array' : typeof json
      }`
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

  for (const [index, item] of json.entries()) {
    if (typeof item !== 'string') {
      throw new Error(
        `Expected${JSON.stringify(
          key
        )}->${index} to be a string, but got: ${typeof item}`
      );
    }
  }

  // $FlowFixMe[incompatible-return]: We dynamically checked that `json` is an `Array<string>`.
  return json;
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
  solveOffline,
  solveOnline,
};
