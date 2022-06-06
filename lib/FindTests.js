// @flow

const gracefulFs = require('graceful-fs');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const Parser = require('./Parser');
const Project = require('./Project');

void Project;

// Double stars at the start and end is the correct way to ignore directories in
// the `glob` package.
// https://github.com/isaacs/node-glob/issues/270#issuecomment-273949982
// https://github.com/isaacs/node-glob/blob/f5a57d3d6e19b324522a3fa5bdd5075fd1aa79d1/common.js#L222-L231
const ignoredDirsGlobs = ['**/elm-stuff/**', '**/node_modules/**'];

function resolveGlobs(
  fileGlobs /*: Array<string> */,
  projectRootDir /*: string */
) /*: Array<string> */ {
  return Array.from(
    new Set(
      fileGlobs.flatMap((fileGlob) => {
        const absolutePath = path.resolve(fileGlob);
        try {
          const stat = fs.statSync(absolutePath);
          // If the CLI arg exists…
          return stat.isDirectory()
            ? // …and it’s a directory, find all .elm files in there…
              findAllElmFilesInDir(absolutePath)
            : // …otherwise use it as-is.
              [absolutePath];
        } catch (error) {
          // If the CLI arg does not exist…
          return error.code === 'ENOENT'
            ? // …resolve it as a glob for shells that don’t support globs.
              resolveCliArgGlob(absolutePath, projectRootDir)
            : // The glob package ignores other types of stat errors.
              [];
        }
      })
    ),
    // The `glob` package returns absolute paths with slashes always, even on
    // Windows. All other paths in elm-test use the native directory separator
    // so normalize here.
    (filePath) => path.normalize(filePath)
  );
}

function resolveCliArgGlob(
  fileGlob /*: string */,
  projectRootDir /*: string */
) /*: Array<string> */ {
  // Globs passed as CLI arguments are relative to CWD, while elm-test
  // operates from the project root dir.
  const globRelativeToProjectRoot = path.relative(
    projectRootDir,
    path.resolve(fileGlob)
  );

  // glob@8 (via minimatch@5) had a breaking change where you _have_ to use
  // forwards slash as path separator, regardless of platform, making it
  // unambiguous which characters are separators and which are escapes. This
  // restores the previous behavior, avoiding a breaking change in elm-test.
  // Note: As far I can tell, escaping glob syntax has _never_ worked on
  // Windows. In Elm, needing to escape glob syntax should be very rare, since
  // Elm file paths must match the module name (letters only). So it’s probably
  // more worth supporting `some\folder\*Test.elm` rather than escaping.
  // https://github.com/isaacs/node-glob/issues/468
  // https://github.com/isaacs/minimatch/commit/9104d8d175bdd8843338103be1401f80774d2a10#diff-f41746899d033115e03bebe4fbde76acf2de4bf261bfb221744808f4c8a286cf
  const pattern =
    process.platform === 'win32'
      ? globRelativeToProjectRoot.replace(/\\/g, '/')
      : globRelativeToProjectRoot;

  return glob
    .sync(pattern, {
      cwd: projectRootDir,
      nocase: true,
      absolute: true,
      ignore: ignoredDirsGlobs,
      // Match directories as well and mark them with a trailing slash.
      nodir: false,
      mark: true,
    })
    .flatMap((filePath) =>
      filePath.endsWith('/') ? findAllElmFilesInDir(filePath) : filePath
    );
}

// Recursively search for *.elm files.
function findAllElmFilesInDir(dir /*: string */) /*: Array<string> */ {
  return glob.sync('**/*.elm', {
    cwd: dir,
    nocase: true,
    absolute: true,
    ignore: ignoredDirsGlobs,
    nodir: true,
  });
}

function findTests(
  testFilePaths /*: Array<string> */,
  project /*: typeof Project.Project */
) /*: Promise<Array<{ moduleName: string, possiblyTests: Array<string> }>> */ {
  return Promise.all(
    testFilePaths.map((filePath) => {
      const matchingSourceDirs = project.testsSourceDirs.filter((dir) =>
        filePath.startsWith(`${dir}${path.sep}`)
      );

      // Tests must be in tests/ or in source-directories – otherwise they won’t
      // compile. Elm won’t be able to find imports.
      switch (matchingSourceDirs.length) {
        case 0:
          return Promise.reject(
            Error(
              missingSourceDirectoryError(
                filePath,
                project.elmJson.type === 'package'
              )
            )
          );

        case 1:
          // Keep going.
          break;

        default:
          // This shouldn’t be possible for package projects.
          return Promise.reject(
            new Error(
              multipleSourceDirectoriesError(
                filePath,
                matchingSourceDirs,
                project.testsDir
              )
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

…matches no source directory! Imports won't work then.

${
  isPackageProject
    ? 'Move it to tests/ or src/ in your project root.'
    : 'Move it to tests/ in your project root, or make sure it is covered by "source-directories" in your elm.json.'
}
  `.trim();
}

function multipleSourceDirectoriesError(
  filePath,
  matchingSourceDirs,
  testsDir
) {
  const note = matchingSourceDirs.includes(testsDir)
    ? "Note: The tests/ folder counts as a source directory too (even if it isn't listed in your elm.json)!"
    : '';

  return `
This file:

${filePath}

…matches more than one source directory:

${matchingSourceDirs.join('\n')}

Edit "source-directories" in your elm.json and try to make it so no source directory contains another source directory!

${note}
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

Make sure that all parts start with an uppercase letter and don't contain any spaces or anything like that.
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
  ignoredDirsGlobs,
  noFilesFoundError,
  resolveGlobs,
};
