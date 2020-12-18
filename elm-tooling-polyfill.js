// Only `elm-tooling/getExecutable` supports Node.js 10, the rest of it is
// Node.js 12+. Luckily, all that’s needed is to polyfill `.flatMap`.
// We can get rid of this when Node.js 10 becomes EOL 2021-04-30 and support for
// Node.js 10 is dropped.
// Note: This is only used during development and CI of node-test-runner, not
// for users of the npm package.
if (Array.prototype.flatMap === undefined) {
  Array.prototype.flatMap = function flatMap(...args) {
    return [].concat(...this.map(...args));
  };
}
