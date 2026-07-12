const path = require('path');
const os = require('os');

/**
 * @returns { string }
 */
function elmHome() {
  const elmHomeEnv = process.env['ELM_HOME'];
  return elmHomeEnv === undefined ? defaultElmHome() : elmHomeEnv;
}

/**
 * @returns { string }
 */
function defaultElmHome() {
  return process.platform === 'win32'
    ? defaultWindowsElmHome()
    : defaultUnixElmHome();
}

/**
 * @returns { string }
 */
function defaultUnixElmHome() {
  return path.join(os.homedir(), '.elm');
}

/**
 * @returns { string }
 */
function defaultWindowsElmHome() {
  const appData = process.env['APPDATA'];
  const dir =
    appData === undefined
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : appData;
  return path.join(dir, 'elm');
}

/**
 * @param { string } pkg
 * @returns { string }
 */
function packagePath(pkg) {
  const parts = splitAuthorPkg(pkg);
  return path.join(elmHome(), '0.19.2', 'packages', parts.author, parts.pkg);
}

/**
 * @param { string } pkgIdentifier
 * @returns { {
    author: string,
    pkg: string,
  } }
 */
function splitAuthorPkg(pkgIdentifier) {
  const [author = 'unknown', pkg = 'unknown'] = pkgIdentifier.split('/');
  return { author, pkg };
}

module.exports = {
  elmHome,
  packagePath,
  splitAuthorPkg,
};
