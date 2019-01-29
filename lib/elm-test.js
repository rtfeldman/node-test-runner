// @flow

var packageInfo = require('../package.json');
var chalk = require('chalk');
var Install = require('./install.js');
var Compile = require('./Compile.js');
var Generate = require('./Generate.js');
var processTitle = 'elm-test';
var which = require('which');

process.title = processTitle;

process.on('uncaughtException', function(error) {
  if (/ an argument in Javascript/.test(error)) {
    // Handle arg mismatch between js and elm code. Expected message from Elm:
    // "You are giving module `Main` an argument in JavaScript.
    // This module does not take arguments though! You probably need to change the
    // initialization code to something like `Elm.Test.Generated.Main.fullscreen()`]"
    console.error('Error starting the node-test-runner.');
    console.error(
      "Please check your Javascript 'elm-test' and Elm 'node-test-runner' package versions are compatible"
    );
    process.exit(1);
  } else {
    console.error('Unhandled exception while running the tests:', error);
    process.exit(1);
  }
});

var compile = require('node-elm-compiler').compile,
  fs = require('fs-extra'),
  os = require('os'),
  glob = require('glob'),
  path = require('path'),
  _ = require('lodash'),
  minimist = require('minimist'),
  chokidar = require('chokidar'),
  Runner = require('./runner.js'),
  Supervisor = require('./supervisor.js');

// Check Node version
const nodeVersionString = process.versions.node;
const nodeVersion = _.map(_.split(nodeVersionString, '.'), _.parseInt);

if (
  (nodeVersion[0] === 0 && nodeVersion[1] < 11) ||
  (nodeVersion[0] === 0 && nodeVersion[1] === 11 && nodeVersion[2] < 13)
) {
  console.log('using node v' + nodeVersionString);
  console.error(
    'elm-test requires node v4.7.0 or greater - upgrade the installed version of node and try again'
  );
  process.exit(1);
}

var args = minimist(process.argv.slice(2), {
  boolean: ['warn', 'version', 'help', 'watch'],
  string: ['compiler', 'seed', 'report', 'fuzz'],
});
var processes = Math.max(1, os.cpus().length);

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(filename) {
  var candidates;

  if (!fs.existsSync(filename)) {
    candidates = [];
  } else if (fs.lstatSync(filename).isDirectory()) {
    candidates = _.flatMap(
      glob.sync('/**/*.elm', {
        root: filename,
        nocase: true,
        ignore: '/**/elm-stuff/**',
        nodir: true,
      }),
      resolveFilePath
    );
  } else {
    candidates = [path.resolve(filename)];
  }

  // Exclude everything having anything to do with elm-stuff
  return candidates.filter(function(candidate) {
    return candidate.split(path.sep).indexOf('elm-stuff') === -1;
  });
}

let pathToElmBinary;

if (args.compiler === undefined) {
  try {
    pathToElmBinary = which.sync('elm');
  } catch (error) {
    throw new Error(
      `Cannot find elm executable, make sure it is installed.
(If elm is not on your path or is called something different the --compiler flag might help.)`
    );
  }
} else {
  try {
    pathToElmBinary = which.sync(path.resolve(args.compiler));
  } catch (error) {
    throw new Error(
      'The --compiler option must be given a path to an elm executable.'
    );
  }
}

function printUsage(str) {
  console.log('Usage: elm-test ' + str + '\n');
}

if (args.help) {
  var exampleGlob = path.join('tests', '**', '*.elm');

  [
    'init # Create example tests',
    'install PACKAGE # Like `elm install PACKAGE`, except it installs to "test-dependencies" in your elm.json',
    'TESTFILES # Run TESTFILES, for example ' + exampleGlob,
    '[--compiler /path/to/compiler] # Run tests',
    '[--seed integer] # Run with initial fuzzer seed',
    '[--fuzz integer] # Run with each fuzz test performing this many iterations',
    '[--report json, junit, or console (default)] # Print results to stdout in given format',
    '[--version] # Print version string and exit',
    '[--watch] # Run tests on file changes',
  ].forEach(printUsage);

  process.exit(1);
}

if (args.version) {
  console.log(require(path.join(__dirname, '..', 'package.json')).version);
  process.exit(0);
}

if (args._[0] === 'install') {
  var packageName = args._[1];

  if (typeof packageName === 'string') {
    if (!fs.existsSync('elm.json')) {
      console.error(
        '`elm-test install` must be run in the same directory as an existing elm.json file!'
      );
      process.exit(1);
    }

    Install.install(pathToElmBinary, packageName);

    process.exit(0);
  } else {
    console.error(
      'What package should I install? I was expecting something like this:\n\n    elm-test install elm/regex\n'
    );
    process.exit(1);
  }
} else if (args._[0] == 'init') {
  if (!fs.existsSync('elm.json')) {
    console.error(
      '`elm-test init` must be run in the same directory as an existing elm.json file! You can run `elm init` to initialize one.'
    );
    process.exit(1);
  }

  Install.install(pathToElmBinary, 'elm-explorations/test');
  fs.mkdirpSync('tests');
  fs.copySync(
    path.join(__dirname, '..', 'templates', 'tests', 'Example.elm'),
    'tests/Example.elm'
  );

  console.log(
    '\nCheck out the documentation for getting started at https://package.elm-lang.org/packages/elm-explorations/test/latest'
  );

  process.exit(0);
}

let runsExecuted = 0;

function runTests(generatedCodeDir /*:string*/, testFile /*:string*/) {
  const dest = path.resolve(path.join(generatedCodeDir, 'elmTestOutput.js'));

  // Incorporate the process PID into the socket name, so elm-test processes can
  // be run parallel without accidentally sharing each others' sockets.
  //
  // See https://github.com/rtfeldman/node-test-runner/pull/231
  // Also incorporate a salt number into it on Windows, to avoid EADDRINUSE -
  // see https://github.com/rtfeldman/node-test-runner/issues/275 - because the
  // alternative approach of deleting the file before creating a new one doesn't
  // work on Windows. We have to let Windows clean up the named pipe. This is
  // essentially a band-aid fix. The alternative is to rewrite a ton of stuff.
  runsExecuted++;
  const pipeFilename =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\elm_test-' + process.pid + '-' + runsExecuted
      : '/tmp/elm_test-' + process.pid + '.sock';

  return Compile.compile(
    testFile,
    dest,
    args.verbose,
    pathToElmBinary,
    args.report
  )
    .then(function() {
      return Generate.prepareCompiledJsFile(pipeFilename, dest).then(
        function() {
          return Supervisor.run(
            packageInfo.version,
            pipeFilename,
            report,
            processes,
            dest,
            args.watch,
            Compile.isMachineReadableReporter(report)
          );
        }
      );
    })
    .catch(function(exitCode) {
      console.error('Compilation failed for', testFile);
      return Promise.reject(exitCode);
    });
}

function globify(filename) {
  return glob.sync(filename, {
    nocase: true,
    ignore: '**/elm-stuff/**',
    nodir: false,
    absolute: true,
  });
}

function globifyWithRoot(root, filename) {
  return glob.sync(filename, {
    root: root,
    nocase: true,
    ignore: '**/elm-stuff/**',
    nodir: false,
    absolute: true,
  });
}

function resolveGlobs(fileGlobs) {
  let globs;

  if (fileGlobs.length > 0) {
    globs = _.flatMap(fileGlobs, globify);
  } else {
    var root = path.join(
      path.resolve(Runner.findNearestElmPackageDir([process.cwd()]))
    );

    globs = globifyWithRoot(root, 'test?(s)/**/*.elm');
  }

  return _.flatMap(globs, resolveFilePath);
}

function getWatchPaths(projectRootDir /*:string*/) {
  var watchedSourcePaths;
  var elmJson = fs.readJsonSync(path.join(projectRootDir, 'elm.json'), 'utf8');
  if (elmJson['type'] === 'package') {
    watchedSourcePaths = ['./src'];
  } else {
    watchedSourcePaths = elmJson['source-directories'];
  }
  var watchedTestPaths = path.join(projectRootDir, 'tests');
  var watchedPaths = watchedSourcePaths
    .concat(watchedTestPaths)
    .map(function(sourcePath) {
      return path.resolve(projectRootDir, sourcePath) + '/**/*.elm';
    });
  return watchedPaths;
}

var report;

if (
  args.report === 'console' ||
  args.report === 'json' ||
  args.report === 'junit'
) {
  report = args.report;
} else if (args.report !== undefined) {
  console.error(
    "The --report option must be given either 'console', 'junit', or 'json'"
  );
  process.exit(1);
} else {
  report = 'console';
}

function infoLog(msg) {
  if (report === 'console') {
    console.log(msg);
  }
}

function getProjectRootDir(filePaths) {
  return path.resolve(Runner.findNearestElmPackageDir(filePaths));
}

function getTestRootDir(projectRootDir /*:string*/) {
  return path.resolve(path.join(projectRootDir, 'tests'));
}

if (args._[0] === 'make') {
  const files = args._.slice(1);

  // It's important to globify all the arguments.
  // On Bash 4.x (or zsh), if you give it a glob as its last argument, Bash
  // translates that into a list of file paths. On bash 3.x it's just a string.
  // Ergo, globify all the arguments we receive.
  const fileGlobs = files.length > 0 ? files : [];
  const testFilePaths = resolveGlobs(files);
  const projectRootDir = getProjectRootDir(testFilePaths);
  const testRootDir = getTestRootDir(projectRootDir);
  const generatedCodeDir = Generate.generateElmJson(
    projectRootDir,
    testRootDir,
    pathToElmBinary,
    testFilePaths,
    fileGlobs.length > 0
  )[0];

  Compile.compileAll(
    testFilePaths,
    generatedCodeDir,
    args.verbose,
    pathToElmBinary,
    args.report
  )
    .then(function() {
      process.exit(0);
    })
    .catch(function(err) {
      process.exit(1);
    });
} else {
  // It's important to globify all the arguments.
  // On Bash 4.x (or zsh), if you give it a glob as its last argument, Bash
  // translates that into a list of file paths. On bash 3.x it's just a string.
  // Ergo, globify all the arguments we receive.
  const fileGlobs = args._.length > 0 ? args._ : [];
  const testFilePaths = resolveGlobs(fileGlobs);
  const projectRootDir = getProjectRootDir(testFilePaths);

  const elmJsonPath = path.resolve(path.join(projectRootDir, 'elm.json'));
  var projectElmJson = {};

  try {
    projectElmJson = fs.readJsonSync(elmJsonPath);
  } catch (err) {
    console.error('Error reading elm.json: ' + err);
    process.exit(1);
  }

  var isPackageProject = projectElmJson.type === 'package';

  if (testFilePaths.length === 0) {
    var extraAppError =
      "\n\nAlternatively, if your application has tests in a different directory, try calling elm-test with a glob: elm-test 'frontend-app/**/*Tests.elm'.";

    var errorMessage =
      fileGlobs.length > 0
        ? 'No tests found for the file pattern "' +
          fileGlobs.toString() +
          '"\n\nMaybe try running elm-test with no arguments?'
        : "No tests found in the tests/ directory.\n\nNOTE: Make sure you're running elm-test from your project's root directory, where its elm.json lives.\n\nTo generate some initial tests to get things going, run elm-test init." +
          (isPackageProject ? '' : extraAppError);

    console.error(errorMessage);
    process.exit(1);
  }

  const testRootDir = getTestRootDir(projectRootDir);
  const returnValues = Generate.generateElmJson(
    projectRootDir,
    testRootDir,
    pathToElmBinary,
    testFilePaths,
    fileGlobs.length > 0
  );
  const generatedCodeDir = returnValues[0];
  const generatedSrc = returnValues[1];
  const sourceDirs = returnValues[2];

  function clearConsole() {
    process.stdout.write(
      process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H'
    );
  }

  function run() {
    // This compiles all the tests so that we generate *.elmi files for them,
    // which we can then read to determine which tests need to be run.
    return Compile.compileAll(
      testFilePaths,
      generatedCodeDir,
      args.verbose,
      pathToElmBinary,
      args.report
    )
      .then(function() {
        return Runner.findTests(
          generatedCodeDir,
          testFilePaths,
          sourceDirs,
          !Compile.isMachineReadableReporter(report)
        )
          .then(function(runnableTests) {
            process.chdir(generatedCodeDir);

            const mainFile = Generate.generateMainModule(
              parseInt(args.fuzz),
              parseInt(args.seed),
              args.report,
              testFilePaths,
              runnableTests,
              generatedSrc,
              processes
            );

            return runTests(generatedCodeDir, mainFile);
          })
          .catch(function(err) {
            console.error(err);
            process.exit(1);
          });
      })
      .catch(function(err) {
        console.error(err);
        if (!args.watch) {
          process.exit(1);
        }
      })
      .then(function() {
        console.log(chalk.blue('Watching for changes...'));
      });
  }

  var currentRun = run();

  if (args.watch) {
    clearConsole();
    infoLog('Running in watch mode');

    var watchedPaths = getWatchPaths(projectRootDir);
    var watcher = chokidar.watch(watchedPaths, {
      awaitWriteFinish: {
        stabilityThreshold: 500,
      },
      ignoreInitial: true,
      ignored: /(\/|^)elm-stuff(\/|$)/,
    });

    var eventNameMap = {
      add: 'added',
      addDir: 'added',
      change: 'changed',
      unlink: 'removed',
      unlinkDir: 'removed',
    };

    watcher.on('all', function(event, filePath) {
      var relativePath = path.relative(testRootDir, filePath);
      var eventName = eventNameMap[event] || event;
      clearConsole();
      infoLog('\n' + relativePath + ' ' + eventName + '. Rebuilding!');

      // TODO if a previous run is in progress, wait until it's done.
      currentRun = currentRun.then(run);
    });
  }
}
