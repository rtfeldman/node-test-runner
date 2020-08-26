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

function moduleFromFilePath(filePathArg) {
  var parsed = path.parse(path.normalize(filePathArg));
  var basename = path.basename(parsed.base, '.elm');

  // Turn these into module name checks to be performed, in order.
  // e.g. 'tests/All/Passing.elm' ===> ['Passing', 'All', 'tests']
  // This way, if we're given 'All.Passing' as a module name, we can also
  // flip it into ['Passing', 'All'], and see if the first N elements line up.
  return parsed.dir
    .split(path.sep)
    .concat([basename])
    .filter(function (segment) {
      return segment !== '';
    })
    .reverse();
}

function moduleFromTestName(testName) {
  return testName.split('.').reverse();
}

function filterMap(array, f) {
  return array.map(f).filter(Boolean);
}

function findTests(
  elmVersion /*: ?string */,
  testRootDir /*: string */,
  testFilePaths /*: Array<string> */
) /*: Promise<Array<{ moduleName: string, tests: Array<string> }>> */ {
  return new Promise(function (resolve, reject) {
    const args = elmVersion ? ['--elm-version=' + elmVersion] : [];
    // TODO: Have elmi-to-json only read test file paths, not all paths.
    // args = args.concat(testFilePaths);
    let proc = spawn(readElmiPath, args.concat(['--for-elm-test']), {
      cwd: testRootDir,
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
        reject('Finding test interfaces failed, exiting with code ' + code);
      }

      let modules;

      try {
        modules = JSON.parse(jsonStr).testModules;
      } catch (err) {
        reject('Received invalid JSON from test interface search: ' + err);
        return;
      }

      var filteredModules = filterMap(modules, function (mod) {
        // Must have at least 1 value of type Test. Otherwise ignore this module.
        const normalizedPath = path.resolve(path.join(testRootDir, mod.path));
        if (mod.tests.length > 0 && testFilePaths.includes(normalizedPath)) {
          return {
            moduleName: mod.moduleName,
            path: normalizedPath,
            tests: mod.tests,
          };
        } else {
          return undefined;
        }
      });

      return verifyModules(testFilePaths)
        .then(function () {
          resolve(filteredModules);
        })
        .catch(reject);
    });
  });
}

// Check for modules where the name doesn't match the filename.
// elm-make won't get a chance to detect this; they'll be filtered out first.
function verifyModules(filePaths) {
  return Promise.all(
    filePaths.map(function (filePath) {
      return getFirstLine(filePath).then(function (line) {
        var matches = line.match(/^(?:(?:port|effect)\s+)?module\s+(\S+)\s*/);

        if (matches) {
          var moduleName = matches[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // A module path matches if it lines up completely with a known one.
          if (
            !testModulePaths.every(function (testModulePath, index) {
              return testModulePath === modulePath[index];
            })
          ) {
            return Promise.reject(
              filePath +
                ' has a module declaration of "' +
                moduleName +
                '" - which does not match its filename!'
            );
          }
        } else {
          return Promise.reject(
            filePath +
              ' has an invalid module declaration. Check the first line of the file and make sure it has a valid module declaration there!'
          );
        }
      });
    })
  );
}

module.exports = {
  findTests: findTests,
  getIndirectDeps: getIndirectDeps,
  getFirstLine: getFirstLine,
};
