const path = require('path');

const fixturesDir = path.join(__dirname, 'fixtures');

const elmHome = path.join(fixturesDir, 'elm-home');
const dummyBinPath = path.join(fixturesDir, 'dummy-bin');
const newPath = process.env.PATH + path.delimiter + dummyBinPath;
const spawnOpts = {
  silent: true,
  env: Object.assign({ ELM_HOME: elmHome }, process.env, {
    PATH: newPath,
    Path: newPath,
  }),
};

module.exports = {
  fixturesDir,
  spawnOpts,
  dummyBinPath,
};
