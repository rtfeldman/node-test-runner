// @flow

// Poor man’s type alias. We can’t use /*:: type Report = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
const Report /*: 'console' | 'json' | 'junit' */ = 'console';

const all = ['json', 'junit', 'console'];

/**
 * @param { typeof Report } report
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
  Report,
  all,
  isMachineReadable,
};
