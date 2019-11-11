// @flow

const fs = require('fs-extra'),
  findParentDir = require('find-parent-dir'),
  _ = require('lodash'),
  spawn = require('cross-spawn'),
  firstline = require('firstline'),
  path = require('path'),
  finder = require('./finder.js');

function isJsFile(filename) {
  return /\.js$/.test(filename);
}

function isElmFile(filename /*: string */) {
  return /\.elm$/.test(filename);
}

function findNearestElmPackageDir(filePaths /*: Array<string> */) {
  // For each of the given files, try to find an ancestor elm.json
  // As soon as we find one, return it.
  for (var index = 0; index < filePaths.length; index++) {
    var currentFilePath = filePaths[index];
    var currentDir = fs.lstatSync(currentFilePath).isDirectory()
      ? currentFilePath
      : path.dirname(currentFilePath);
    var result = findParentDir.sync(currentDir, 'elm.json');

    if (result !== null) {
      return result;
    }
  }

  // If we didn't find any, fall back on the current working directory.
  return process.cwd();
}

var readElmiPath = require('elmi-to-json').paths['elmi-to-json'];

function getIndirectDeps(projectRootDir /*: string */) /*: Promise<Object> */ {
  return new Promise(function(resolve, reject) {
    var proc = spawn(readElmiPath, ['--for-elm-test'], {
      cwd: projectRootDir,
      env: process.env,
    });
    let jsonStr = '';
    let stderrStr = '';

    proc.stdout.on('data', function(data) {
      jsonStr += data;
    });

    proc.stderr.on('data', function(data) {
      stderrStr += data;
    });

    proc.on('close', function(code) {
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
  return _.compact(parsed.dir.split(path.sep).concat([basename])).reverse();
}

function moduleFromTestName(testName) {
  return testName.split('.').reverse();
}

function findTests(
  elmVersion /*: ?string */,
  testRootDir /*: string */,
  testFilePaths /*: Array<string> */,
  testSourceDirs /*: Array<string> */,
  verbose /*: boolean */
) /*: Promise<Array<{ moduleName: string, tests: Array<string> }>> */ {
  return new Promise(function(resolve, reject) {
    function finish() {
      const args = elmVersion ? ['--elm-version=' + elmVersion] : [];
      let proc = spawn(readElmiPath, args.concat(['--for-elm-test']), {
        cwd: testRootDir,
        env: process.env,
      });
      let jsonStr = '';
      let stderrStr = '';

      proc.stdout.on('data', function(data) {
        jsonStr += data;
      });

      proc.stderr.on('data', function(data) {
        stderrStr += data;
      });

      proc.on('close', function(code) {
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
        }

        var filteredModules = _.flatMap(modules, function(mod) {
          // Must have at least 1 value of type Test. Otherwise ignore this module.
          if (mod.tests.length > 0) {
            return [
              {
                moduleName: mod.moduleName,
                path: path.resolve(path.join(testRootDir, mod.path)),
                tests: mod.tests,
              },
            ];
          } else {
            return [];
          }
        });

        return verifyModules(testFilePaths)
          .then(function() {
            return Promise.all(filteredModules.map(filterExposing))
              .then(resolve)
              .catch(reject);
          })
          .catch(reject);
      });
    }

    return finish();
  });
}

// Check for modules where the name doesn't match the filename.
// elm-make won't get a chance to detect this; they'll be filtered out first.
function verifyModules(filePaths) {
  return Promise.all(
    _.map(filePaths, function(filePath) {
      return firstline(filePath).then(function(line) {
        var matches = line.match(/^(?:(?:port|effect)\s+)?module\s+(\S+)\s*/);

        if (matches) {
          var moduleName = matches[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // A module path matches if it lines up completely with a known one.
          if (
            !testModulePaths.every(function(testModulePath, index) {
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

function filterExposing(pathAndModule /*: {
  moduleName: string,
  path: string,
  tests: Array<string>,
} */) /*: Promise<{
  moduleName: string,
  path: string,
  tests: Array<string>,
}> */ {
  return new Promise(function(resolve, reject) {
    return finder
      .readExposing(pathAndModule.path)
      .then(function(exposedValues) {
        var newTests =
          exposedValues.length === 1 && exposedValues[0] === '..'
            ? // null exposedValues means "the module was exposing (..), so keep everything"
              pathAndModule.tests
            : // Only keep the tests that were exposed.
              _.intersection(exposedValues, pathAndModule.tests);

        if (newTests.length < pathAndModule.tests.length) {
          return reject(
            '\n`' +
              pathAndModule.path +
              '` is a module with top-level Test values which it does not expose:\n\n' +
              _.difference(pathAndModule.tests, newTests)
                .map(function(test) {
                  return test + ' : Test';
                })
                .join('\n') +
              '\n\nThese tests will not get run. Please either expose them or move them out of the top level.'
          );
        } else {
          return resolve({
            moduleName: pathAndModule.moduleName,
            path: pathAndModule.path,
            tests: newTests,
          });
        }
      })
      .catch(reject);
  });
}

module.exports = {
  findTests: findTests,
  isElmFile: isElmFile,
  findNearestElmPackageDir: findNearestElmPackageDir,
  getIndirectDeps: getIndirectDeps,
};
