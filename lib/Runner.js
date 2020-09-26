// @flow

const spawn = require('cross-spawn'),
  fs = require('fs-extra'),
  readline = require('readline'),
  path = require('path'),
  util = require('util');

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

const readFile = util.promisify(fs.readFile);

function findTests(
  testFilePaths /*: Array<string> */
) /*: Promise<Array<{ moduleName: string, tests: Array<string> }>> */ {
  return Promise.all(
    testFilePaths.map((filePath) =>
      // TODOx: Do parsing in a clever way that doesn’t read the whole file.
      readFile(filePath, 'utf8').then((content) => {
        const match = /^(?:(?:port|effect)\s+)?module\s+(\S+)/.exec(content);
        if (match) {
          var moduleName = match[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // Check for modules where the name doesn't match the filename.
          // A module path matches if it lines up completely with a known one.
          // elm-make won't get a chance to detect this; they'll be filtered out first.
          // TODOx: Is this true? Won’t Elm give a nicer error message if we don’t do this?
          if (
            !(
              testModulePaths.length === modulePath.length &&
              testModulePaths.every(
                (testModulePath, index) => testModulePath === modulePath[index]
              )
            )
          ) {
            return Promise.reject(
              filePath +
                ' has a module declaration of "' +
                moduleName +
                '" - which does not match its filename!'
            );
          }

          return {
            moduleName,
            path: filePath,
            tests: extractExposedMaybeTests(content),
          };
        } else {
          return Promise.reject(
            filePath +
              ' has an invalid module declaration. Check the first line of the file and make sure it has a valid module declaration there!'
          );
        }
      })
    )
  );
}

function extractExposedMaybeTests(content) {
  // TODOx: Implement POC extractor.
  return ['TODO' + content.slice(0, 0)];
}

module.exports = {
  findTests: findTests,
  getIndirectDeps: getIndirectDeps,
  getFirstLine: getFirstLine,
};
