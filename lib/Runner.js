// @flow

const spawn = require('cross-spawn'),
  path = require('path'),
  Parser = require('./Parser');

var readElmiPath = require('elmi-to-json').paths['elmi-to-json'];

function getIndirectDeps(projectRootDir /*: string */) /*: Promise<Object> */ {
  return new Promise(function (resolve, reject) {
    var proc = spawn(readElmiPath, ['--for-elm-test'], {
      cwd: projectRootDir,
      env: process.env,
    });
    let jsonStr = '';
    let stderrStr = '';

    proc.stdout.on('data', function (data) {
      jsonStr += data;
    });

    proc.stderr.on('data', function (data) {
      stderrStr += data;
    });

    proc.on('close', function (code) {
      if (stderrStr !== '') {
        reject(stderrStr);
      } else if (code !== 0) {
        reject('Finding package interface failed, exiting with code ' + code);
      }

      try {
        let outline = JSON.parse(jsonStr).outline;

        if (outline.type !== 'ValidPkg') {
          reject(
            'Invalid package - please run `elm make` instead of `elm test` and fix the errors you see!'
          );
        } else {
          resolve(outline.exactDeps);
        }
      } catch (err) {
        reject('Received invalid JSON from package interface search: ' + err);
      }
    });
  });
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
      const moduleName = path
        .relative(matchingSourceDirs[0], filePath)
        .replace(/\.elm$/, '')
        .split(path.sep)
        .join('.');

      return Parser.extractExposedPossiblyTests(filePath).then(
        (possiblyTests) => ({
          moduleName,
          possiblyTests,
        })
      );
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

module.exports = {
  findTests: findTests,
  getIndirectDeps: getIndirectDeps,
};
