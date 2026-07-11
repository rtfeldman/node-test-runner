// @flow

/**
 * @typedef { 'console' | 'json' | 'junit' } Report
 */

const all = ['json', 'junit', 'console'];

/**
 * @param { Report } report
 * @returns { boolean }
 */
function isMachineReadable(report) {
  switch (report) {
    case 'json':
    case 'junit':
      return true;
    case 'console':
      return false;
  }
}

module.exports = {
  all,
  isMachineReadable,
};
