// @flow
const supportsColor = require('./supports-color');

// Find more colors/styles in
// https://github.com/chalk/ansi-styles/blob/main/index.js

/**
 * @param { string } string
 * @returns { string }
 */
function red(string) {
  return supportsColor ? `\x1B[31m${string}\x1B[39m` : string;
}

/**
 * @param { string } string
 * @returns { string }
 */
function blue(string) {
  return supportsColor ? `\x1B[34m${string}\x1B[39m` : string;
}

module.exports = {
  supportsColor,

  red,
  blue,
};
