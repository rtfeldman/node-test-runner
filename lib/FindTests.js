// @flow

const gracefulFs = require('graceful-fs');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const Parser = require('./Parser');
const Project = require('./Project.js');

void Project;

function flatMap/*:: <T, U> */(
  array /*: Array<T> */,
  f /*: (T) => Array<U> */
) /*: Array<U> */ {
  return array.reduce((result, item) => result.concat(f(item)), []);
}

// Resolve arguments that look like globs for shells that don’t support globs.
function resolveGlobs(fileGlobs /*: Array<string> */) /*: Array<string> */ {
  return flatMap(flatMap(fileGlobs, globify), resolveFilePath);
}

function globify(globString /*: string */) /*: Array<string> */ {
  // Without `path.resolve`, `../tests` gives 0 results even if `../tests`
  // exists (at least on MacOS).
  return glob.sync(path.resolve(globString), {
    nocase: true,
    ignore: '**/elm-stuff/**',
    nodir: false,
    absolute: true,
  });
}

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(elmFilePathOrDir /*: string */) /*: Array<string> */ {
  const candidates = !fs.existsSync(elmFilePathOrDir)
    ? []
    : fs.lstatSync(elmFilePathOrDir).isDirectory()
    ? flatMap(
        glob.sync('/**/*.elm', {
          root: elmFilePathOrDir,
          nocase: true,
          ignore: '/**/elm-stuff/**',
          nodir: true,
        }),
        resolveFilePath
      )
    : [path.resolve(elmFilePathOrDir)];

  // Exclude everything having anything to do with elm-stuff
  return candidates.filter(
    (candidate) => !candidate.split(path.sep).includes('elm-stuff')
  );
}

function getGlobsToWatch(
  project /*: typeof Project.Project */
) /*: Array<string> */ {
  return project.testsSourceDirs.map((sourceDirectory) =>
    // TODO: Test this on Windows.
    path.posix.join(sourceDirectory, '**', '*.elm')
  );
}

function findTests(
  testFilePaths /*: Array<string> */,
  sourceDirs /*: Array<string> */,
  isPackageProject /*: boolean */
) /*: Promise<Array<{ moduleName: string, possiblyTests: Array<string> }>> */ {
  return Promise.all(
    testFilePaths.map((filePath) => {
      const matchingSourceDirs = sourceDirs.filter((dir) =>
        filePath.startsWith(`${dir}${path.sep}`)
      );

      // Tests must be in tests/ or in source-directories – otherwise they won’t
      // compile. Elm won’t be able to find imports.
      switch (matchingSourceDirs.length) {
        case 0:
          return Promise.reject(
            Error(missingSourceDirectoryError(filePath, isPackageProject))
          );

        case 1:
          // Keep going.
          break;

        default:
          // This shouldn’t be possible for package projects.
          return Promise.reject(
            new Error(
              multipleSourceDirectoriesError(filePath, matchingSourceDirs)
            )
          );
      }

      // By finding the module name from the file path we can import it even if
      // the file is full of errors. Elm will then report what’s wrong.
      const moduleNameParts = path
        .relative(matchingSourceDirs[0], filePath)
        .replace(/\.elm$/, '')
        .split(path.sep);
      const moduleName = moduleNameParts.join('.');

      if (!moduleNameParts.every(Parser.isUpperName)) {
        return Promise.reject(
          new Error(
            badModuleNameError(filePath, matchingSourceDirs[0], moduleName)
          )
        );
      }

      return Parser.extractExposedPossiblyTests(
        filePath,
        // We’re reading files asynchronously in a loop here, so it makes sense
        // to use graceful-fs to avoid “too many open files” errors.
        gracefulFs.createReadStream
      ).then((possiblyTests) => ({
        moduleName,
        possiblyTests,
      }));
    })
  );
}

function missingSourceDirectoryError(filePath, isPackageProject) {
  return `
This file:

${filePath}

…matches no source directory! Imports won’t work then.

${
  isPackageProject
    ? 'Move it to tests/ or src/ in your project root.'
    : 'Move it to tests/ in your project root, or make sure it is covered by "source-directories" in your elm.json.'
}
  `.trim();
}

function multipleSourceDirectoriesError(filePath, matchingSourceDirs) {
  return `
This file:

${filePath}

…matches more than one source directory:

${matchingSourceDirs.join('\n')}

Edit "source-directories" in your elm.json and try to make it so no source directory contains another source directory!
  `.trim();
}

function badModuleNameError(filePath, sourceDir, moduleName) {
  return `
This file:

${filePath}

…located in this directory:

${sourceDir}

…is problematic. Trying to construct a module name from the parts after the directory gives:

${moduleName}

…but module names need to look like for example:

Main
Http.Helpers

Make sure that all parts start with an uppercase letter and don’t contain any spaces or anything like that.
  `.trim();
}

function noFilesFoundError(
  projectRootDir /*: string */,
  testFileGlobs /*: Array<string> */
) /*: string */ {
  return testFileGlobs.length === 0
    ? `
${noFilesFoundInTestsDir(projectRootDir)}

To generate some initial tests to get things going: elm-test init

Alternatively, if your project has tests in a different directory,
try calling elm-test with a glob such as: elm-test "src/**/*Tests.elm"
      `.trim()
    : `
No files found matching:

${testFileGlobs.join('\n')}

Are the above patterns correct? Maybe try running elm-test with no arguments?
      `.trim();
}

function noFilesFoundInTestsDir(projectRootDir) {
  const testsDir = path.join(projectRootDir, 'tests');
  try {
    const stats = fs.statSync(testsDir);
    return stats.isDirectory()
      ? 'No .elm files found in the tests/ directory.'
      : `Expected a directory but found something else at: ${testsDir}\nCheck it out! Could you remove it?`;
  } catch (error) {
    return error.code === 'ENOENT'
      ? 'The tests/ directory does not exist.'
      : `Failed to read the tests/ directory: ${error.message}`;
  }
}

module.exports = {
  findTests,
  getGlobsToWatch,
  noFilesFoundError,
  resolveGlobs,
};
