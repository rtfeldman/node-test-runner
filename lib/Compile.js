const { supportsColor } = require('./chalk');
const ElmCompiler = require('./ElmCompiler');
const Report = require('./Report');
const Spawn = require('./Spawn');

/**
 * @param { string } cwd
 * @param { string } testFile
 * @param { string } dest
 * @param { string } pathToElmBinary
 * @param { import('./Report').Report } report
 * @returns { Promise<void> }
 */
function compile(cwd, testFile, dest, pathToElmBinary, report) {
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

/**
 * @param { Array<string> } testFilePaths
 * @param { string } projectRootDir
 * @param { string } pathToElmBinary
 * @param { import('./Report').Report } report
 * @returns { Promise<void> }
 */
function compileSources(
  testFilePaths,
  projectRootDir,
  pathToElmBinary,
  report
) {
  return new Promise((resolve, reject) => {
    const compileProcess = ElmCompiler.compile(testFilePaths, {
      output: '/dev/null',
      cwd: projectRootDir,
      spawn: spawnCompiler({ ignoreStdout: false, cwd: projectRootDir }),
      pathToElm: pathToElmBinary,
      reportJson: report === 'json',
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

/**
 * @param { { ignoreStdout: boolean, cwd: string } } options
 * @returns { (
    pathToElm: string,
    processArgs: Array<string>,
    processOpts: import('child_process').SpawnOptions
  ) => import('child_process').ChildProcess }
 */
function spawnCompiler({ ignoreStdout, cwd }) {
  return (pathToElm, processArgs, processOpts) => {
    // It might seem useless to specify 'pipe' and then just write all data to
    // `process.stdout`/`process.stderr`, but it does make a difference: The Elm
    // compiler turns off colors when it’s used in a pipe. In summary:
    //
    // 'inherit' -> Colors, automatically written to stdout/stderr
    // 'pipe' -> No colors, we need to explicitly write to stdout/stderr
    const stdout = ignoreStdout ? 'ignore' : supportsColor ? 'inherit' : 'pipe';
    const stderr = supportsColor ? 'inherit' : 'pipe';

    /** @type { import('child_process').SpawnOptions } */
    const finalOpts = {
      env: process.env,
      ...processOpts,
      cwd,
      stdio: ['inherit', stdout, stderr],
    };

    const child = Spawn.spawn(pathToElm, processArgs, finalOpts);

    if (stdout === 'pipe' && child.stdout !== null) {
      child.stdout.on('data', (data) => process.stdout.write(data));
    }

    if (stderr === 'pipe' && child.stderr !== null) {
      child.stderr.on('data', (data) => process.stderr.write(data));
    }

    return child;
  };
}

/**
 * @param { import('./Report').Report } report
 * @returns { import('child_process').SpawnOptions }
 */
function processOptsForReporter(report) {
  if (Report.isMachineReadable(report)) {
    return { env: process.env, stdio: ['ignore', 'ignore', process.stderr] };
  } else {
    return { env: process.env };
  }
}

module.exports = {
  compile,
  compileSources,
};
