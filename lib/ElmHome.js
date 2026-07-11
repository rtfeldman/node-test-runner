// @flow

const path = require('path');
const os = require('os');

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
  const parts = pkgIdentifier.split('/');
  return { author: parts[0], pkg: parts[1] };
}

module.exports = {
  elmHome,
  packagePath,
  splitAuthorPkg,
};
