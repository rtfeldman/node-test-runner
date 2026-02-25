// @flow
const supportsColor = require('./supports-color');

// Find more colors/styles in
// https://github.com/chalk/ansi-styles/blob/main/index.js

function red(string /*: string */) /*: string */ {
  return supportsColor ? `\x1B[31m${string}\x1B[39m` : string;
}

function blue(string /*: string */) /*: string */ {
  return supportsColor ? `\x1B[34m${string}\x1B[39m` : string;
}

module.exports = {
  supportsColor,

  red,
  blue,
};
