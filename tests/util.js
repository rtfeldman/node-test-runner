const path = require('path');

const fixturesDir = path.join(__dirname, 'fixtures');

const dummyBinPath = path.join(fixturesDir, 'dummy-bin');
const newPath = process.env.PATH + path.delimiter + dummyBinPath;
const spawnOpts = {
  silent: true,
  env: Object.assign({}, process.env, {
    PATH: newPath,
    Path: newPath,
  }),
};

module.exports = {
  fixturesDir,
  spawnOpts,
  dummyBinPath,
};
