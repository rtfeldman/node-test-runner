//@flow

const spawn = require('cross-spawn');
const path = require('path');
const packageInfo = require('../package.json');
const ElmCompiler = require('./ElmCompiler');
const Report = require('./Report');

function compile(
  cwd /*: string */,
  testFile /*: string */,
  dest /*: string */,
  pathToElmBinary /*: string */,
  report /*: typeof Report.Report */
) /*: Promise<void> */ {
  return new Promise((resolve, reject) => {
    const compileProcess = ElmCompiler.compile([testFile], {
      output: dest,
      spawn: spawnCompiler({ ignoreStdout: true, cwd }),
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

function compileSources(
  testFilePaths /*: Array<string> */,
  projectRootDir /*: string */,
  pathToElmBinary /*: string */,
  report /*: typeof Report.Report */
) /*: Promise<void> */ {
  return new Promise((resolve, reject) => {
    const compilerReport = report === 'json' ? report : undefined;

    const compileProcess = ElmCompiler.compile(testFilePaths, {
      output: '/dev/null',
      cwd: projectRootDir,
      spawn: spawnCompiler({ ignoreStdout: false, cwd: projectRootDir }),
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

function spawnCompiler({ ignoreStdout, cwd }) {
  return (
    pathToElm /*: string */,
    processArgs /*: Array<string> */,
    processOpts /*: Object */
  ) => {
    const finalOpts = Object.assign({ env: process.env }, processOpts, {
      cwd,
      stdio: [
        process.stdin,
        ignoreStdout ? 'ignore' : process.stdout,
        process.stderr,
      ],
    });

    return spawn(pathToElm, processArgs, finalOpts);
  };
}

function processOptsForReporter(report /*: typeof Report.Report */) {
  if (Report.isMachineReadable(report)) {
    return { env: process.env, stdio: ['ignore', 'ignore', process.stderr] };
  } else {
    return { env: process.env };
  }
}

module.exports = {
  compile,
  compileSources,
  getGeneratedCodeDir,
};
