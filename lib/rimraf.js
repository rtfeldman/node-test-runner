// Copied from:
// https://github.com/nodejs/node/blob/feff38501a69f9860a6bc8f6647c3d5a2c8bc1c9/lib/internal/fs/rimraf.js
//
// Changes made:
// - Removed the async version
// - Removed the maxRetries and retryDelay options
//
// We can remove this file and use `fs.rmdirSync(dir, { recursive: true })`
// once Node.js 10 is EOL 2021-04-30.

'use strict';

const fs = require('fs');
const {
  chmodSync,
  lstatSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
} = fs;
const { sep, toNamespacedPath } = require('path');
const notEmptyErrorCodes = new Set(['ENOTEMPTY', 'EEXIST', 'EPERM']);
const isWindows = process.platform === 'win32';
const epermHandlerSync = isWindows ? fixWinEPERMSync : _rmdirSync;
const readdirEncoding = 'buffer';
const separator = Buffer.from(sep);

function rimrafSync(path) {
  let stats;

  try {
    stats = lstatSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') return;

    // Windows can EPERM on stat.
    if (isWindows && err.code === 'EPERM') fixWinEPERMSync(path, err);
  }

  try {
    // SunOS lets the root user unlink directories.
    if (stats !== undefined && stats.isDirectory()) _rmdirSync(path, null);
    else _unlinkSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    if (err.code === 'EPERM') return epermHandlerSync(path, err);
    if (err.code !== 'EISDIR') throw err;

    _rmdirSync(path, err);
  }
}

function _unlinkSync(path) {
  try {
    return unlinkSync(path);
  } catch (_err) {
    // Node.js ignores errors here.
  }
}

function _rmdirSync(path, originalErr) {
  try {
    rmdirSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    if (err.code === 'ENOTDIR') throw originalErr;

    if (notEmptyErrorCodes.has(err.code)) {
      // Removing failed. Try removing all children and then retrying the
      // original removal. Windows has a habit of not closing handles promptly
      // when files are deleted, resulting in spurious ENOTEMPTY failures. Work
      // around that issue by retrying on Windows.
      const pathBuf = Buffer.from(path);

      readdirSync(pathBuf, readdirEncoding).forEach((child) => {
        const childPath = Buffer.concat([pathBuf, separator, child]);

        rimrafSync(childPath);
      });

      try {
        return fs.rmdirSync(path);
      } catch (_err) {
        // Node.js ignores errors here.
      }
    }
  }
}

function fixWinEPERMSync(path, options, originalErr) {
  try {
    chmodSync(path, 0o666);
  } catch (err) {
    if (err.code === 'ENOENT') return;

    throw originalErr;
  }

  let stats;

  try {
    stats = statSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') return;

    throw originalErr;
  }

  if (stats.isDirectory()) _rmdirSync(path, options, originalErr);
  else _unlinkSync(path, options);
}

// Inspired by:
// https://github.com/nodejs/node/blob/feff38501a69f9860a6bc8f6647c3d5a2c8bc1c9/lib/fs.js#L896-L900
function rmdirSyncRecursive(dirPath) {
  return rimrafSync(toNamespacedPath(dirPath));
}

module.exports = { rmdirSyncRecursive };
