//@flow

const path = require('path'),
  ElmCompiler = require('./ElmCompiler'),
  spawn = require('cross-spawn'),
  packageInfo = require('../package.json');

function compile(
  testFile /*: string */,
  dest /*: string */,
  pathToElmBinary /*: string */,
  report /*: string */
) /*: Promise<void> */ {
  return new Promise((resolve, reject) => {
    const compileProcess = ElmCompiler.compile([testFile], {
      output: dest,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      processOpts: processOptsForReporter(report),
    });

    compileProcess.on('close', function (exitCode) {
      if (exitCode !== 0) {
        reject(new Error(`\`elm make\` failed with exit code ${exitCode}.`));
      } else {
        resolve();
      }
    });
  });
}

function getGeneratedCodeDir(projectRootDir /*: string */) /*: string */ {
  return path.join(
    projectRootDir,
    'elm-stuff',
    'generated-code',
    'elm-community',
    'elm-test',
    packageInfo.version
  );
}

function getTestRootDir(projectRootDir /*: string */) /*: string */ {
  return path.resolve(path.join(projectRootDir, 'tests'));
}

function compileSources(
  testFilePaths /*: Array<string> */,
  projectRootDir /*: string */,
  pathToElmBinary /*: string */,
  report /*: string */
) /*: Promise<void> */ {
  return new Promise((resolve, reject) => {
    const compilerReport = report === 'json' ? report : undefined;

    const compileProcess = ElmCompiler.compile(testFilePaths, {
      output: '/dev/null',
      cwd: projectRootDir,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      report: compilerReport,
      processOpts: processOptsForReporter(report),
    });

    compileProcess.on('close', function (exitCode) {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`\`elm make\` failed with exit code ${exitCode}.`));
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

function isMachineReadableReporter(reporter /*: string */) /*: boolean */ {
  return reporter === 'json' || reporter === 'junit';
}

module.exports = {
  compile,
  compileSources,
  getTestRootDir,
  getGeneratedCodeDir,
  isMachineReadableReporter,
};
