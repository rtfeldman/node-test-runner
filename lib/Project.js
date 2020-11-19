// @flow

const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');

// Poor man’s type alias. We can’t use /*:: type Project = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
const Project /*: {
  rootDir: string,
  testsDir: string,
  generatedCodeDir: string,
  testsSourceDirs: Array<string>,
  elmJson: typeof ElmJson.ElmJson,
} */ = {
  rootDir: '',
  testsDir: '',
  generatedCodeDir: '',
  testsSourceDirs: [],
  elmJson: ElmJson.ElmJson,
};

function getTestsDir(rootDir /*: string */) /*: string */ {
  return path.join(rootDir, 'tests');
}

function init(
  rootDir /*: string */,
  version /*: string */
) /*: typeof Project */ {
  const testsDir = getTestsDir(rootDir);

  // The tests/ directory is not required. You can also co-locate tests with
  // their source files.
  const shouldAddTestsDirAsSource = fs.existsSync(testsDir);

  const elmJson = ElmJson.read(rootDir);

  const projectSourceDirs =
    elmJson.type === 'package' ? ['src'] : elmJson['source-directories'];

  const testsSourceDirs /*: Array<string> */ = projectSourceDirs
    .map((src) => path.resolve(rootDir, src))
    .concat(shouldAddTestsDirAsSource ? [testsDir] : []);

  const generatedCodeDir = path.join(
    rootDir,
    'elm-stuff',
    'generated-code',
    'elm-community',
    'elm-test',
    version
  );

  return {
    rootDir,
    testsDir,
    generatedCodeDir,
    testsSourceDirs,
    elmJson,
  };
}

module.exports = {
  Project,
  getTestsDir,
  init,
};
