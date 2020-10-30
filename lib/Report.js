// @flow

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
        message: `Expected console, json or junit, but got: ${string}`,
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
