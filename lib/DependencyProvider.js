let fs = require('fs');
let os = require('os');
let path = require('path');
let process = require('process');
let request = require('sync-request');

// Cache of existing versions according to the package website.
let onlineVersionsCache = new Map();

// Memoization cache to avoid doing the same work twice in listAvailableVersions.
// This is to be cleared before each call to solve_deps().
let listVersionsMemoCache = new Map();

module.exports = {
  fetchElmJsonOffline: fetchElmJsonOffline,
  fetchElmJsonOnline: fetchElmJsonOnline,
  updateOnlineVersionsCache: updateOnlineVersionsCache,
  clearListVersionsMemoCacheBeforeSolve: () => listVersionsMemoCache.clear(),
  listAvailableVersionsOnline: listAvailableVersionsOnline,
  listAvailableVersionsOffline: listAvailableVersionsOffline,
};

// fetchElmJson(pkg: &str, version: &str) -> String;
function fetchElmJsonOnline(pkg, version) {
  try {
    return fetchElmJsonOffline(pkg, version);
  } catch (_) {
    let remoteUrl = remoteElmJsonUrl(pkg, version);
    let elmJson = request('GET', remoteUrl).getBody('utf8'); // need utf8 to convert from gunzipped buffer
    let cachePath = cacheElmJsonPath(pkg, version);
    let parentDir = path.dirname(cachePath);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(cachePath, elmJson);
    return elmJson;
  }
}

// fetchElmJson(pkg: &str, version: &str) -> String;
function fetchElmJsonOffline(pkg, version) {
  console.log('Fetching: ' + pkg + ' @ ' + version);
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

function updateOnlineVersionsCache() {
  let pubgrubHome = path.join(elmHome(), 'pubgrub');
  fs.mkdirSync(pubgrubHome, { recursive: true });
  let cachePath = path.join(pubgrubHome, 'versions_cache.json');
  let remotePackagesUrl = 'https://package.elm-lang.org/all-packages';
  if (onlineVersionsCache.size == 0) {
    try {
      // Read from disk what is already cached, and complete with a request to the package server.
      let cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      onlineVersionsCache = new Map(Object.entries(cache));
      updateCacheWithRequestSince(cachePath, remotePackagesUrl);
    } catch (_) {
      // The cache file does not exist, let's download it all.
      updateCacheFromScratch(cachePath, remotePackagesUrl);
    }
  } else {
    // The cache is not empty, we just need to update it.
    updateCacheWithRequestSince(cachePath, remotePackagesUrl);
  }
}

// Reset the cache of existing versions from scratch
// with a request to the package server.
function updateCacheFromScratch(cachePath, remotePackagesUrl) {
  let onlineVersionsJson = request('GET', remotePackagesUrl).getBody('utf8');
  fs.writeFileSync(cachePath, onlineVersionsJson);
  let onlineVersions = JSON.parse(onlineVersionsJson);
  onlineVersionsCache = new Map(Object.entries(onlineVersions));
}

// Update the cache with a request to the package server.
function updateCacheWithRequestSince(cachePath, remotePackagesUrl) {
  // Count existing versions.
  let versionsCount = 0;
  for (let versions of onlineVersionsCache.values()) {
    versionsCount += versions.length;
  }

  // Complete cache with a remote call to the package server.
  let remoteUrl = remotePackagesUrl + '/since/' + (versionsCount - 1); // -1 to check if no package was deleted.
  let newVersions = JSON.parse(request('GET', remoteUrl).getBody('utf8'));
  if (newVersions.length == 0) {
    // Reload from scratch since it means at least one package was deleted from the registry.
    updateCacheFromScratch(cachePath, remotePackagesUrl);
    return;
  }
  // Check that the last package in the list was already in cache
  // since the list returned by the package server is sorted newest first.
  let { pkg, version } = splitPkgVersion(newVersions.pop());
  let cachePkgVersions = onlineVersionsCache.get(pkg);
  if (
    cachePkgVersions != undefined &&
    cachePkgVersions[cachePkgVersions.length - 1] == version
  ) {
    // Insert (in reverse) newVersions into onlineVersionsCache.
    for (let pkgVersion of newVersions.reverse()) {
      let { pkg, version } = splitPkgVersion(pkgVersion);
      let versionsOfPkg = onlineVersionsCache.get(pkg);
      if (versionsOfPkg == undefined) {
        onlineVersionsCache.set(pkg, [version]);
      } else {
        versionsOfPkg.push(version);
      }
    }
    // Save the updated onlineVersionsCache to disk.
    let onlineVersions = Object.fromEntries(onlineVersionsCache.entries());
    fs.writeFileSync(cachePath, JSON.stringify(onlineVersions));
  } else {
    // There was a problem and a package got deleted from the server.
    updateCacheFromScratch(cachePath, remotePackagesUrl);
  }
}

// listAvailableVersions(pkg: &str) -> Vec<JsValue>;
function listAvailableVersionsOnline(pkg) {
  let memoVersions = listVersionsMemoCache.get(pkg);
  if (memoVersions != undefined) {
    return memoVersions;
  }
  let offlineVersions = listAvailableVersionsOffline(pkg);
  let allVersionsSet = new Set(versionsFromOnlineCache(pkg));
  // Combine local and online versions.
  for (let version of offlineVersions) {
    allVersionsSet.add(version);
  }
  let allVersions = [...allVersionsSet].sort().reverse();
  listVersionsMemoCache.set(pkg, allVersions);
  return allVersions;
}

// onlineVersionsCache is a Map with pkg as keys.
function versionsFromOnlineCache(pkg) {
  let versions = onlineVersionsCache.get(pkg);
  return versions ? versions : [];
}

// listAvailableVersions(pkg: &str) -> Vec<JsValue>;
function listAvailableVersionsOffline(pkg) {
  let memoVersions = listVersionsMemoCache.get(pkg);
  if (memoVersions != undefined) {
    return memoVersions;
  }

  console.log('List versions of: ' + pkg);
  let offlineVersions;
  try {
    offlineVersions = fs.readdirSync(homePkgPath(pkg));
  } catch (_) {
    console.log(
      `Directory "${homePkgPath(pkg)}" does not exist for package ${pkg}.`
    );
    console.log(
      `Offline mode, so we return [] for the list of versions of ${pkg}.`
    );
    offlineVersions = [];
  }

  // Reverse order of subdirectories to have newest versions first.
  offlineVersions.reverse();
  listVersionsMemoCache.set(pkg, offlineVersions);
  return offlineVersions;
}

// Helper functions ##################################################

// Polyfill to convert an object into a Map:
// const map = new Map(Object.entries({foo: 'bar'}));
Object.entries =
  typeof Object.entries === 'function'
    ? Object.entries
    : (obj) => Object.keys(obj).map((k) => [k, obj[k]]);

// Polyfill to convert a Map into an object:
// const obj = Object.fromEntries(map.entries());
Object.fromEntries =
  typeof Object.fromEntries === 'function'
    ? Object.fromEntries
    : (entries) => {
        var res = {};
        for (var i = 0; i < entries.length; i++) {
          res[entries[i][0]] = entries[i][1];
        }
        return res;
      };

function remoteElmJsonUrl(pkg, version) {
  return `https://package.elm-lang.org/packages/${pkg}/${version}/elm.json`;
}

function cacheElmJsonPath(pkg, version) {
  let parts = splitAuthorPkg(pkg);
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

function homeElmJsonPath(pkg, version) {
  return path.join(homePkgPath(pkg), version, 'elm.json');
}

function homePkgPath(pkg) {
  let parts = splitAuthorPkg(pkg);
  return path.join(elmHome(), '0.19.1', 'packages', parts.author, parts.pkg);
}

function splitAuthorPkg(pkgIdentifier) {
  let parts = pkgIdentifier.split('/');
  return { author: parts[0], pkg: parts[1] };
}

function splitPkgVersion(str) {
  let parts = str.split('@');
  return { pkg: parts[0], version: parts[1] };
}

function elmHome() {
  let elmHomeEnv = process.env['ELM_HOME'];
  return elmHomeEnv ? elmHomeEnv : defaultElmHome();
}

function defaultElmHome() {
  return process.platform === 'win32'
    ? defaultWindowsElmHome()
    : defaultUnixElmHome();
}

function defaultUnixElmHome() {
  return path.join(os.homedir(), '.elm');
}

function defaultWindowsElmHome() {
  return path.join(process.env.APPDATA, 'elm');
}
