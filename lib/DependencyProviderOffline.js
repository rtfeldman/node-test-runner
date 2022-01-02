let fs = require('fs');
let os = require('os');
let path = require('path');
let process = require('process');

// fetchElmJson(pkg: &str, version: &str) -> String;
module.exports.fetchElmJson = function fetchElmJson(pkg, version) {
  // console.log("Fetching: " + pkg + " @ " + version);
  try {
    return fs.readFileSync(homeElmJsonPath(pkg, version), 'utf8');
  } catch (_) {
    try {
      return fs.readFileSync(cacheElmJsonPath(pkg, version), 'utf8');
    } catch (_) {
      let remoteUrl = remoteElmJsonUrl(pkg, version);
      throw `Not doing a remote request to ${remoteUrl}. Please run at least once elm-test first.`;
    }
  }
};

// listAvailableVersions(pkg: &str) -> Vec<JsValue>;
module.exports.listAvailableVersions = function listAvailableVersions(pkg) {
  // console.log("List versions of: " + pkg);
  let subdirectories;
  try {
    subdirectories = fs.readdirSync(homePkgPath(pkg));
  } catch (_) {
    console.log(`Directory "${homePkgPath(pkg)} does not exist`);
    console.log(
      `Not doing a request to the package server to find out existing versions. Please run at least once elm-test first.`
    );
    return [];
  }

  // Reverse order of subdirectories to have newest versions first.
  return subdirectories.reverse();
};

// Helper functions ##################################################

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
