//@flow

const path = require('path'),
  elmCompiler = require('node-elm-compiler'),
  spawn = require('cross-spawn');

function compile(
  testFile /*:string*/,
  dest /*:string*/,
  verbose /*:boolean*/,
  pathToElmBinary /*:string*/,
  report /*:string*/
) {
  return new Promise((resolve, reject) => {
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

function compileAll(
  testFilePaths /*:Array<string>*/,
  generatedCodeDir /*:string*/,
  verbose /*:boolean*/,
  pathToElmBinary /*:string*/,
  report /*:string*/
) {
  return new Promise((resolve, reject) => {
    const compilerReport = report === 'json' ? report : undefined;

    const compileProcess = elmCompiler.compile(testFilePaths, {
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
            testFilePaths.join(' ')
        );
      }
    });
  });
}

function spawnCompiler(report /*:string*/) {
  return (
    pathToElm /*:string*/,
    processArgs /*:Array<string>*/,
    processOpts /*:Object*/
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

function isMachineReadableReporter(reporter /*:string*/) {
  return reporter === 'json' || reporter === 'junit';
}

module.exports = { compile, compileAll, isMachineReadableReporter };
