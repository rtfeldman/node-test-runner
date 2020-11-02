// @flow

// Poor man’s type alias. We can’t use /*:: type Report = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
const Report /*: 'console' | 'json' | 'junit' */ = 'console';

function parse(string /*: string */) /*: Result<string, typeof Report> */ {
  switch (string) {
    case 'console':
    case 'json':
    case 'junit':
      return { tag: 'Ok', value: string };
    default:
      return {
        tag: 'Error',
        error: `Expected console, json or junit, but got: ${string}`,
      };
  }
}

function isMachineReadable(report /*: typeof Report */) /*: boolean */ {
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
  parse,
  isMachineReadable,
};
