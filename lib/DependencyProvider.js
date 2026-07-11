const fs = require('fs');
const path = require('path');
const wasm = require('elm-solve-deps-wasm');
const ElmHome = require('./ElmHome.js');
const SyncGet = require('./SyncGet.js');
const collator = new Intl.Collator('en', { numeric: true }); // for sorting SemVer strings

// Initialization work done only once.
wasm.init();
// Lazily start the worker until needed.
// This is important for the tests, which never exit otherwise.
/** @type { undefined | import('./SyncGet').SyncGetWorker } */
let syncGetWorker_ = undefined;
/**
 * @returns { import('./SyncGet').SyncGetWorker }
 */
function syncGetWorker() {
  if (syncGetWorker_ === undefined) {
    syncGetWorker_ = SyncGet.startWorker();
  }
  return syncGetWorker_;
}

// Cache of existing versions according to the package website.
class OnlineVersionsCache {
  /** @type { Map<string, Array<string>> } */
  map = new Map();

  /**
   * @returns { void }
   */
  update() {
    const pubgrubHome = path.join(ElmHome.elmHome(), 'pubgrub');
    fs.mkdirSync(pubgrubHome, { recursive: true });
    const cachePath = path.join(pubgrubHome, 'versions_cache.json');
    const remotePackagesUrl = 'https://package.elm-lang.org/all-packages';
    if (this.map.size === 0) {
      let cacheFile;
      try {
        // Read from disk existing versions which are already cached.
        cacheFile = fs.readFileSync(cachePath, 'utf8');
      } catch (_) {
        // The cache file does not exist so let's reset it.
        this.map = onlineVersionsFromScratch(cachePath, remotePackagesUrl);
        return;
      }
      try {
        this.map = parseOnlineVersions(JSON.parse(cacheFile));
      } catch (error) {
        throw new Error(
          `Failed to parse the cache file ${cachePath}.\n${error.message}`
        );
      }
    }
    this.updateWithRequestSince(cachePath, remotePackagesUrl);
  }

  /**
   * Update the cache with a request to the package server.
   *
   * @param { string } cachePath
   * @param { string } remotePackagesUrl
   * @returns { void }
   */
  updateWithRequestSince(cachePath, remotePackagesUrl) {
    // Count existing versions.
    let versionsCount = 0;
    for (const versions of this.map.values()) {
      versionsCount += versions.length;
    }

    // Complete cache with a remote call to the package server.
    const remoteUrl = remotePackagesUrl + '/since/' + (versionsCount - 1); // -1 to check if no package was deleted.
    const newVersions = JSON.parse(syncGetWorker().get(remoteUrl));
    if (newVersions.length === 0) {
      // Reload from scratch since it means at least one package was deleted from the registry.
      this.map = onlineVersionsFromScratch(cachePath, remotePackagesUrl);
      return;
    }
    // Check that the last package in the list was already in cache
    // since the list returned by the package server is sorted newest first.
    const { pkg, version } = splitPkgVersion(newVersions.pop());
    const cachePkgVersions = this.map.get(pkg);
    if (
      cachePkgVersions !== undefined &&
      cachePkgVersions[cachePkgVersions.length - 1] === version
    ) {
      // Insert (in reverse) newVersions into onlineVersionsCache map.
      for (const pkgVersion of newVersions.reverse()) {
        const { pkg, version } = splitPkgVersion(pkgVersion);
        const versionsOfPkg = this.map.get(pkg);
        if (versionsOfPkg === undefined) {
          this.map.set(pkg, [version]);
        } else {
          versionsOfPkg.push(version);
        }
      }
      // Save the updated onlineVersionsCache to disk.
      const onlineVersions = Object.fromEntries(this.map.entries());
      fs.writeFileSync(cachePath, JSON.stringify(onlineVersions));
    } else {
      // There was a problem and a package got deleted from the server.
      this.map = onlineVersionsFromScratch(cachePath, remotePackagesUrl);
    }
  }

  /**
   * @param { string } pkg
   * @returns { Array<string> }
   */
  getVersions(pkg) {
    const versions = this.map.get(pkg);
    return versions === undefined ? [] : versions;
  }
}

class OnlineAvailableVersionLister {
  /**
   * Memoization cache to avoid doing the same work twice in list.
   * @type { Map<string, Array<string>> }
   */
  memoCache = new Map();
  /** @type { OnlineVersionsCache } */
  onlineCache;

  /**
   * @param {OnlineVersionsCache} onlineCache
   */
  constructor(onlineCache) {
    onlineCache.update();
    this.onlineCache = onlineCache;
  }

  /**
   * @param { string } pkg
   * @param { undefined | string } pinnedVersion
   * @returns { Array<string> }
   */
  list(pkg, pinnedVersion) {
    const memoVersions = this.memoCache.get(pkg);
    if (memoVersions !== undefined) {
      return prioritizePinnedIndirectVersion(memoVersions, pinnedVersion);
    }
    const offlineVersions = readVersionsInElmHomeAndSort(pkg);
    const allVersionsSet = new Set(this.onlineCache.getVersions(pkg));
    // Combine local and online versions.
    for (const version of offlineVersions) {
      allVersionsSet.add(version);
    }
    const allVersions = [...allVersionsSet].sort(flippedSemverCompare);
    this.memoCache.set(pkg, allVersions);
    return prioritizePinnedIndirectVersion(allVersions, pinnedVersion);
  }
}

class OfflineAvailableVersionLister {
  /**
   * Memoization cache to avoid doing the same work twice in list.
   * @type { Map<string, Array<string>> }
   */
  cache = new Map();

  /**
   * @param { string } pkg
   * @param { undefined | string } pinnedVersion
   * @returns { Array<string> }
   */
  list(pkg, pinnedVersion) {
    const memoVersions = this.cache.get(pkg);
    if (memoVersions !== undefined) {
      return prioritizePinnedIndirectVersion(memoVersions, pinnedVersion);
    }

    const offlineVersions = readVersionsInElmHomeAndSort(pkg);

    this.cache.set(pkg, offlineVersions);
    return prioritizePinnedIndirectVersion(offlineVersions, pinnedVersion);
  }
}

/**
 * @param { string } pkg
 * @returns { Array<string> }
 */
function readVersionsInElmHomeAndSort(pkg) {
  const pkgPath = ElmHome.packagePath(pkg);
  /** @type {Array<string>} */
  let offlineVersions;
  try {
    offlineVersions = fs.readdirSync(pkgPath);
  } catch (_) {
    // The directory doesn't exist or we don't have permissions.
    // It's fine to catch all cases and return an empty list.
    offlineVersions = [];
  }

  return offlineVersions.sort(flippedSemverCompare);
}

class DependencyProvider {
  /** @type { OnlineVersionsCache } */
  cache = new OnlineVersionsCache();

  /**
   * Solve dependencies completely offline, without any http request.
   *
   * @param { string } elmJson
   * @param { boolean } useTest
   * @param { Record<string, string> } extra
   * @returns { string }
   */
  solveOffline(elmJson, useTest, extra) {
    const lister = new OfflineAvailableVersionLister();
    const dependencies = JSON.parse(elmJson).dependencies;
    const indirectDeps =
      dependencies === undefined ? undefined : dependencies.indirect;

    try {
      return wasm.solve_deps(
        elmJson,
        useTest,
        extra,
        fetchElmJsonOffline,
        /** @type { (pkg: string) => Array<string> } */
        (pkg) =>
          lister.list(
            pkg,
            indirectDeps === undefined ? undefined : indirectDeps[pkg]
          )
      );
    } catch (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  /**
   * Solve dependencies with http requests when required.
   *
   * @param { string } elmJson
   * @param { boolean } useTest
   * @param { Record<string, string> } extra
   * @returns { string }
   */
  solveOnline(elmJson, useTest, extra) {
    const lister = new OnlineAvailableVersionLister(this.cache);
    const dependencies = JSON.parse(elmJson).dependencies;
    const indirectDeps =
      dependencies === undefined ? undefined : dependencies.indirect;

    try {
      return wasm.solve_deps(
        elmJson,
        useTest,
        extra,
        fetchElmJsonOnline,
        /** @type { (pkg: string) => Array<string> } */
        (pkg) =>
          lister.list(
            pkg,
            indirectDeps === undefined ? undefined : indirectDeps[pkg]
          )
      );
    } catch (errorMessage) {
      throw new Error(errorMessage);
    }
  }
}

/**
 * @param { string } pkg
 * @param { string } version
 * @returns { string }
 */
function fetchElmJsonOnline(pkg, version) {
  try {
    return fetchElmJsonOffline(pkg, version);
  } catch (_) {
    // `fetchElmJsonOffline` can only fail in ways that are either expected
    // (such as file does not exist or no permissions)
    // or because there was an error parsing `pkg` and `version`.
    // In such case, this will throw again with `cacheElmJsonPath()` so it's fine.
    const remoteUrl = remoteElmJsonUrl(pkg, version);
    const elmJson = syncGetWorker().get(remoteUrl);
    const cachePath = cacheElmJsonPath(pkg, version);
    const parentDir = path.dirname(cachePath);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(cachePath, elmJson);
    return elmJson;
  }
}

/**
 * @param { string } pkg
 * @param { string } version
 * @returns { string }
 */
function fetchElmJsonOffline(pkg, version) {
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

/**
 * Reset the cache of existing versions from scratch
 * with a request to the package server.
 *
 * @param { string } cachePath
 * @param { string } remotePackagesUrl
 * @returns { Map<string, Array<string>> }
 */
function onlineVersionsFromScratch(cachePath, remotePackagesUrl) {
  const onlineVersionsJson = syncGetWorker().get(remotePackagesUrl);
  fs.writeFileSync(cachePath, onlineVersionsJson);
  const onlineVersions = JSON.parse(onlineVersionsJson);
  try {
    return parseOnlineVersions(onlineVersions);
  } catch (error) {
    throw new Error(
      `Failed to parse the response from the request to ${remotePackagesUrl}.\n${error.message}`
    );
  }
}

// Helper functions ##################################################

/**
 * Enforces respecting pinned indirect dependencies.
 *
 * When Elm apps have pinned indirect versions, e.g.:
 *
 * "indirect": {
 *   "elm/virtual-dom": "1.0.3"
 * }
 *
 * We must prioritize these versions for the wasm dependency solver.
 *
 * Otherwise the wasm solver will take liberties that will result in
 * tests running with dependency versions distinct from those used by
 * the real live application.
 *
 * Assumes versions is sorted descending (newest -> oldest).
 *
 * @param { Array<string> } versions
 * @param { void | string } pinnedVersion
 * @returns { Array<string> }
 */
function prioritizePinnedIndirectVersion(versions, pinnedVersion) {
  if (pinnedVersion === undefined || !versions.includes(pinnedVersion)) {
    return versions;
  }

  // the pinned version and any newer version, in ascending order
  const desirableVersions = versions
    .filter((v) => v >= pinnedVersion)
    .reverse();

  // older versions, in descending order
  const olderVersions = versions.filter((v) => v < pinnedVersion);

  return desirableVersions.concat(olderVersions);
}

/**
 * Compares two versions so that newer versions appear first when sorting with this function.
 *
 * @param { string } a
 * @param { string } b
 * @returns { number }
 */
function flippedSemverCompare(a, b) {
  return collator.compare(b, a);
}

/**
 * @param { unknown } json
 * @returns { Map<string, Array<string>> }
 */
function parseOnlineVersions(json) {
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

/**
 * @param { string } key
 * @param { unknown } json
 * @returns { Array<string> }
 */
function parseVersions(key, json) {
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

  // TODO $FlowFixMe[incompatible-return]: We dynamically checked that `json` is an `Array<string>`.
  return json;
}

/**
 * @param { string } pkg
 * @param { string } version
 * @returns { string }
 */
function remoteElmJsonUrl(pkg, version) {
  return `https://package.elm-lang.org/packages/${pkg}/${version}/elm.json`;
}

/**
 * @param { string } pkg
 * @param { string } version
 * @returns { string }
 */
function cacheElmJsonPath(pkg, version) {
  const parts = ElmHome.splitAuthorPkg(pkg);
  return path.join(
    ElmHome.elmHome(),
    'pubgrub',
    'elm_json_cache',
    parts.author,
    parts.pkg,
    version,
    'elm.json'
  );
}

/**
 * @param { string } pkg
 * @param { string } version
 * @returns { string }
 */
function homeElmJsonPath(pkg, version) {
  return path.join(ElmHome.packagePath(pkg), version, 'elm.json');
}

/**
 * @param { string } str
 * @returns { {
    pkg: string,
    version: string,
  } }
 */
function splitPkgVersion(str) {
  const [pkg = 'unknown', version = '99.99.99'] = str.split('@');
  return { pkg, version };
}

module.exports = {
  DependencyProvider,
  prioritizePinnedIndirectVersion,
};
