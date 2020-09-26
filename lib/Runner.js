// @flow

const spawn = require('cross-spawn'),
  fs = require('fs-extra'),
  readline = require('readline'),
  path = require('path');

function getFirstLine(pathToFile /*: string */) /*: Promise<string> */ {
  return new Promise((resolve, reject) => {
    const readable = fs.createReadStream(pathToFile);
    const reader = readline.createInterface({ input: readable });
    let foundLine = false;

    readable.on('error', (err) => reject(err));

    reader.on('line', (line) => {
      foundLine = true;
      reader.close();
      readable.close();
      resolve(line);
    });
    reader.on('close', () => {
      if (!foundLine) {
        reject(new Error(`File ${pathToFile} is empty!`));
      }
    });
    reader.on('error', (err) => reject(err));
  });
}

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
  sourceDirs /*: Array<string> */
) /*: Promise<Array<{ moduleName: string, tests: Array<string> }>> */ {
  return Promise.all(
    testFilePaths.map((filePath) => {
      const matchingSourceDirs = sourceDirs.filter((dir) =>
        filePath.startsWith(`${dir}${path.sep}`)
      );

      // Tests must be in tests/ or in source-directories – otherwise they won’t
      // compile. Elm won’t be able to find imports.
      switch (matchingSourceDirs.length) {
        case 0:
          throw new Error(
            `Cannot find a source directory for: ${filePath}\n\nMove it to tests/ in your project root, or make sure it is covered by "source-directories" in your elm.json.`
          );

        case 1:
          // Keep going.
          break;

        default:
          throw new Error(
            `This file matches several source directories: ${filePath}\n\n${matchingSourceDirs.join(
              '\n'
            )}\n\nEdit "source-directories" in your elm.json and try to make it so no source directory contains another source directory!`
          );
      }

      // By finding the module name from the file path we can import it even if
      // the file is full of errors. Elm will then report what’s wrong.
      const moduleName = path
        .relative(matchingSourceDirs[0], filePath)
        .replace(/\.elm$/, '')
        .split(path.sep)
        .join('.');

      return extractExposedMaybeTests(filePath).then((tests) => ({
        moduleName,
        tests,
      }));
    })
  );
}

function extractExposedMaybeTests(filePath) {
  // TODOx: Implement POC extractor.
  // Use readline like in getFirstLine. Then remove getFirstLine.
  return Promise.resolve(['TODO' + filePath.slice(0, 0)]);
}

module.exports = {
  findTests: findTests,
  getIndirectDeps: getIndirectDeps,
  getFirstLine: getFirstLine,
};
