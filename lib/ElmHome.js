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

function packagePath(pkg /*: string */) /*: string */ {
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

module.exports = {
  elmHome,
  packagePath,
  splitAuthorPkg,
};
