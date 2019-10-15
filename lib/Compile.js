//@flow

const path = require('path'),
  elmCompiler = require('node-elm-compiler'),
  Runner = require('./Runner.js'),
  spawn = require('cross-spawn'),
  fs = require('fs-extra'),
  packageInfo = require('../package.json'),
  elmTestVersion = packageInfo.version;

function compile(
  testFile /*: string */,
  dest /*: string */,
  verbose /*: boolean */,
  pathToElmBinary /*: string */,
  report /*: string */
) {
  return new Promise/*:: <void> */((resolve, reject) => {
    const compileProcess = elmCompiler.compile([testFile], {
      output: dest,
      verbose: verbose,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      processOpts: processOptsForReporter(report),
    });

    compileProcess.on('close', function(exitCode) {
      if (exitCode !== 0) {
        reject('Compilation failed');
      } else {
        resolve();
      }
    });
  });
}

function compileTests(
  generatedCodeDir /*: string */,
  testFilePaths /*: Array<string> */,
  projectRootDir /*: string */,
  verbose /*: boolean */,
  pathToElmBinary /*: string */,
  report /*: string */
) {
  const originalElmStuff = path.join(projectRootDir, 'elm-stuff');

  return new Promise/*:: <void> */((resolve, reject) => {
    const compilerReport = report === 'json' ? report : undefined;

    const relativeTestFilePaths = testFilePaths.map(function(absolutePath) {
      return path.relative(generatedCodeDir, absolutePath);
    });

    // Use the existing elm-stuff as a starting point for our generated
    // elm-stuff, so elm make doesn't have to start from scratch
    const targetElmStuff = path.join(generatedCodeDir, 'elm-stuff');

    return fs.copy(originalElmStuff, targetElmStuff).then(function() {
      const compileProcess = elmCompiler.compile(relativeTestFilePaths, {
        output: '/dev/null',
        cwd: generatedCodeDir,
        verbose: verbose,
        spawn: spawnCompiler(report),
        pathToElm: pathToElmBinary,
        report: compilerReport,
        processOpts: processOptsForReporter(report),
      });

      compileProcess.on('close', function(exitCode) {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(
            'Compilation failed while attempting to build ' +
              relativeTestFilePaths.join(' ')
          );
        }
      });
    });
  });
}

function getGeneratedCodeDir(projectRootDir /*: string */) {
  return path.join(
    projectRootDir,
    'elm-stuff',
    'generated-code',
    'elm-community',
    'elm-test',
    packageInfo.version
  );
}

function getTestRootDir(projectRootDir /*: string */) {
  return path.resolve(path.join(projectRootDir, 'tests'));
}

function compileAll(
  elmVersion /*: ?string */,
  testFilePaths /*: Array<string> */,
  projectRootDir /*: string */,
  verbose /*: boolean */,
  pathToElmBinary /*: string */,
  report /*: string */
) {
  // First, compile the sources so that elmi-to-json will have
  // up-to-date .elmi files to read.
  return compileSources(
    testFilePaths,
    projectRootDir,
    verbose,
    pathToElmBinary,
    report
  ).then(() => {
    const elmJson = path.join(projectRootDir, 'elm.json');
    const sourceDirs = fs.readJsonSync(elmJson)['source-directories'];

    // Next, have elmi-to-json read the .elmi files so we can tell
    // what all the exposed values of type Test are.
    return Runner.findTests(
      elmVersion,
      projectRootDir,
      testFilePaths,
      sourceDirs,
      verbose
    );
  });
}

function compileSources(
  testFilePaths /*: Array<string> */,
  projectRootDir /*: string */,
  verbose /*: boolean */,
  pathToElmBinary /*: string */,
  report /*: string */
) {
  return new Promise/*:: <void> */((resolve, reject) => {
    const compilerReport = report === 'json' ? report : undefined;

    const compileProcess = elmCompiler.compile(testFilePaths, {
      output: '/dev/null',
      cwd: projectRootDir,
      verbose: verbose,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      report: compilerReport,
      processOpts: processOptsForReporter(report),
    });

    compileProcess.on('close', function(exitCode) {
      if (exitCode === 0) {
        resolve();
      } else {
        const msg =
          'Compilation failed while attempting to ' +
          (testFilePaths.length > 0
            ? 'build ' + testFilePaths.join(' ')
            : 'run `elm make` on ' + projectRootDir);

        reject(msg);
      }
    });
  });
}

function spawnCompiler(report /*: string */) {
  return (
    pathToElm /*: string */,
    processArgs /*: Array<string> */,
    processOpts /*: Object */
  ) => {
    const finalOpts = Object.assign({ env: process.env }, processOpts, {
      stdio: [
        process.stdin,
        report === 'console' ? process.stdout : 'ignore',
        process.stderr,
      ],
    });

    return spawn(pathToElm, processArgs, finalOpts);
  };
}

function processOptsForReporter(reporter) {
  if (isMachineReadableReporter(reporter)) {
    return { env: process.env, stdio: ['ignore', 'ignore', process.stderr] };
  } else {
    return { env: process.env };
  }
}

function isMachineReadableReporter(reporter /*: string */) {
  return reporter === 'json' || reporter === 'junit';
}

module.exports = {
  compile,
  compileSources,
  compileAll,
  getTestRootDir,
  getGeneratedCodeDir,
  isMachineReadableReporter,
};
