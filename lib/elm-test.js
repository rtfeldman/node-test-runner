// @flow

const chalk = require('chalk');
const chokidar = require('chokidar');
const fs = require('fs-extra');
const glob = require('glob');
const os = require('os');
const path = require('path');
const which = require('which');
const packageInfo = require('../package.json');
const Compile = require('./Compile.js');
const Generate = require('./Generate.js');
const Install = require('./Install.js');
const Runner = require('./Runner.js');
const Supervisor = require('./Supervisor.js');

function clearConsole() {
  process.stdout.write(
    process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H'
  );
}

function checkNodeJsVersion() {
  const nodeVersionMin = '10.13.0';
  const nodeVersionString = process.versions.node;

  if (
    nodeVersionString.localeCompare(nodeVersionMin, 'en', { numeric: true }) < 0
  ) {
    console.error(`You are using Node.js v${nodeVersionString}.`);
    console.error(
      `elm-test requires Node.js v${nodeVersionMin} or greater - upgrade the installed version of Node.js and try again!`
    );
    process.exit(1);
  }
}

const longOptionWithValue = /^(--[^-=][^=]*)=([^]*)$/;
const looksLikeOption = /^--?[^-]/;

const Command /*:
  | { tag: 'help' }
  | { tag: 'version' }
  | { tag: 'init' }
  | { tag: 'install', packageName: string }
  | { tag: 'make', testFileGlobs: Array<string> }
  | { tag: 'test', testFileGlobs: Array<string> } */ = { tag: 'help' };
void Command;

function parseArgv(
  argv,
  resolveCompiler
) /*: Result<
  string,
  {
    command: typeof Command,
    options: {
      fuzz: number,
      pathToElmBinary: string,
      report: string,
      seed: number,
      watch: boolean,
    },
  }
> */ {
  const options = {
    help: false,
    version: false,
    watch: false,
    compiler: undefined,
    seed: Math.floor(Math.random() * 407199254740991) + 1000,
    fuzz: 100,
    report: 'console',
  };

  const rest = [];
  let raw = [];

  for (let index = 0; index < argv.length; index++) {
    const fullArg = argv[index];
    const match = longOptionWithValue.exec(fullArg);
    const arg = match === null ? fullArg : match[1];

    // Get the value passed to a long flag, or `fallback` if there is none.
    // This is either the part after the equal sign: `--flag=value`.
    // Or the next argument: `--flag value`.
    const getValue = (fallback /*: string */) /*: string */ => {
      if (match === null) {
        index++;
        return index >= argv.length ? fallback : argv[index];
      } else {
        return match[2];
      }
    };

    switch (arg) {
      case '-h':
      case '-help':
      case '--help':
        options.help = true;
        break;

      case '--version':
        options.version = true;
        break;

      case '--watch':
        options.watch = true;
        break;

      case '--compiler': {
        const value = getValue('');
        if (value === '') {
          return {
            tag: 'Error',
            message: `You must pass a path after ${arg}`,
          };
        }
        options.compiler = value;
        break;
      }

      case '--seed': {
        const result = parsePositiveInteger(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.seed = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              message: `You must pass a number after ${arg}: ${result.message}`,
            };
        }
        break;
      }

      case '--fuzz': {
        const result = parsePositiveInteger(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.fuzz = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              message: `You must pass a number after ${arg}: ${result.message}`,
            };
        }
        break;
      }

      case '--report': {
        const result = parseReport(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.report = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              message: `You must pass a reporter after ${arg}: ${result.message}`,
            };
        }
        break;
      }

      case '--':
        raw = argv.slice(index + 1);
        index = argv.length;
        break;

      default:
        if (looksLikeOption.test(arg)) {
          return { tag: 'Error', message: `Unknown option: ${arg}` };
        }
        rest.push(arg);
    }
  }

  const command =
    options.help || rest[0] === 'help'
      ? { tag: 'Ok', value: { tag: 'help' } }
      : options.version
      ? { tag: 'Ok', value: { tag: 'version' } }
      : parseCommand(rest, raw);

  if (command.tag === 'Error') {
    return command;
  }

  const pathToElmBinary = resolveCompiler(options.compiler);
  if (pathToElmBinary.tag === 'Error') {
    return pathToElmBinary;
  }

  return {
    tag: 'Ok',
    value: {
      command: command.value,
      options: {
        // fuzz, seed and report don’t make sense for _all_ commands, but I’m
        // not sure we gain anything by disallowing them rather than ignoring
        // them.
        fuzz: options.fuzz,
        pathToElmBinary: pathToElmBinary.value,
        report: options.report,
        seed: options.seed,
        watch: options.watch,
      },
    },
  };
}

function parsePositiveInteger(
  string /*: string */
) /*: Result<string, number> */ {
  const number = Number(string);
  return !/^\d+$/.test(string)
    ? {
        tag: 'Error',
        message: `Expected one or more digits, but got: ${string}`,
      }
    : !Number.isFinite(number)
    ? {
        tag: 'Error',
        message: `Expected a finite number, but got: ${number}`,
      }
    : { tag: 'Ok', value: number };
}

const validReports = ['console', 'json', 'junit'];

function parseReport(string /*: string */) /*: Result<string, string> */ {
  return validReports.includes(string)
    ? { tag: 'Ok', value: string }
    : {
        tag: 'Error',
        message: `Expected one of ${validReports
          .map((report) => `'${report}'`)
          .join(', ')}, but got: ${string}`,
      };
}

function parseCommand(
  args /*: Array<string> */,
  raw /*: Array<string> */
) /*: Result<string, typeof Command> */ {
  const first = args[0];
  const rest = args.slice(1).concat(raw);
  const got = `${rest.length}: ${rest.join(' ')}`;

  switch (first) {
    case 'init':
      return rest.length > 0
        ? {
            tag: 'Error',
            message: `init takes no arguments, but got ${got}`,
          }
        : { tag: 'Ok', value: { tag: 'init' } };

    case 'install':
      return rest.length === 0
        ? {
            tag: 'Error',
            message:
              // TODO: I think no other error messages uses `I`.
              'What package should I install? I was expecting something like this:\n\n    elm-test install elm/regex',
          }
        : rest.length === 1
        ? { tag: 'Ok', value: { tag: 'install', packageName: rest[0] } }
        : {
            tag: 'Error',
            message: `install takes one single argument, but got ${got}`,
          };

    case 'make':
      return { tag: 'Ok', value: { tag: 'make', testFileGlobs: rest } };

    default:
      return {
        tag: 'Ok',
        value: { tag: 'test', testFileGlobs: args.concat(raw) },
      };
  }
}

function flatMap(array, f) {
  return array.reduce((result, item) => result.concat(f(item)), []);
}

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(filename) {
  let candidates;

  if (!fs.existsSync(filename)) {
    candidates = [];
  } else if (fs.lstatSync(filename).isDirectory()) {
    candidates = flatMap(
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
  return candidates.filter(
    (candidate) => candidate.split(path.sep).indexOf('elm-stuff') === -1
  );
}

function getPathToElmBinary(compiler) {
  const name = compiler === undefined ? 'elm' : compiler;
  try {
    return { tag: 'Ok', value: path.resolve(which.sync(name)) };
  } catch (_error) {
    return compiler === undefined
      ? {
          tag: 'Error',
          message: `Cannot find elm executable, make sure it is installed.
(If elm is not on your path or is called something different the --compiler flag might help.)`,
        }
      : {
          tag: 'Error',
          message: `The elm executable passed to --compiler must exist and be exectuble. Got: ${compiler}`,
        };
  }
}

function printUsage(str) {
  console.log('Usage: elm-test ' + str + '\n');
}

let runsExecuted = 0;

function runTests(
  generatedCodeDir /*: string */,
  testFile /*: string */,
  pathToElmBinary /*: string */,
  report /*: string */,
  watch /*: boolean */,
  processes /*: number */
) {
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

  return Compile.compile(testFile, dest, pathToElmBinary, report)
    .then(() =>
      Generate.prepareCompiledJsFile(pipeFilename, dest).then(() =>
        Supervisor.run(
          packageInfo.version,
          pipeFilename,
          report,
          processes,
          dest,
          watch,
          Compile.isMachineReadableReporter(report)
        )
      )
    )
    .catch((error) => {
      console.error('Compilation failed for', testFile);
      return Promise.reject(error);
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

function resolveGlobs(fileGlobs) {
  const results =
    fileGlobs.length > 0
      ? flatMap(fileGlobs, globify)
      : globify('test?(s)/**/*.elm');
  return flatMap(results, resolveFilePath);
}

function getGlobsToWatch(elmJson) {
  let sourceDirectories;
  if (elmJson['type'] === 'package') {
    sourceDirectories = ['src'];
  } else {
    sourceDirectories = elmJson['source-directories'];
  }
  return [...sourceDirectories, 'tests'].map((sourceDirectory) =>
    path.posix.join(sourceDirectory, '**', '*.elm')
  );
}

function infoLog(report, msg) {
  if (report === 'console') {
    console.log(msg);
  }
}

function makeAndTestHelper(testFileGlobs) {
  // Resolve arguments that look like globs for shells that don’t support globs.
  const testFilePaths = resolveGlobs(testFileGlobs);
  const projectRootDir = process.cwd();
  const generatedCodeDir = Compile.getGeneratedCodeDir(projectRootDir);
  const hasBeenGivenCustomGlobs = testFileGlobs.length > 0;
  const elmJsonPath = path.resolve(path.join(projectRootDir, 'elm.json'));

  try {
    const projectElmJson = fs.readJsonSync(elmJsonPath);
    return {
      tag: 'Ok',
      value: {
        testFilePaths,
        projectRootDir,
        generatedCodeDir,
        hasBeenGivenCustomGlobs,
        elmJsonPath,
        projectElmJson,
        isPackageProject: projectElmJson.type === 'package',
      },
    };
  } catch (error) {
    return {
      tag: 'Error',
      message: `Error reading elm.json: ${error.message}`,
    };
  }
}

function make(
  {
    testFilePaths,
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson,
  },
  { pathToElmBinary, report }
) {
  Generate.generateElmJson(
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson
  );

  return Compile.compileSources(
    testFilePaths,
    generatedCodeDir,
    pathToElmBinary,
    report
  );
}

function test(
  testFileGlobs,
  processes,
  {
    testFilePaths,
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson,
    isPackageProject,
  },
  { pathToElmBinary, watch, report, seed, fuzz }
) {
  if (testFilePaths.length === 0) {
    console.error(noFilesFoundError(testFileGlobs));
    process.exit(1);
  }

  const [generatedSrc, sourceDirs] = Generate.generateElmJson(
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson
  );

  function run() {
    // This compiles all the tests so that we generate *.elmi files for them,
    // which we can then read to determine which tests need to be run.
    return Runner.findTests(testFilePaths, sourceDirs, isPackageProject)
      .then((testModules) => {
        process.chdir(generatedCodeDir);

        const mainFile = Generate.generateMainModule(
          parseInt(fuzz),
          parseInt(seed),
          report,
          testFileGlobs,
          testFilePaths,
          testModules,
          generatedSrc,
          processes
        );

        return runTests(
          generatedCodeDir,
          mainFile,
          pathToElmBinary,
          report,
          watch,
          processes
        );
      })
      .catch((err) => {
        console.error(err.message);
        if (!watch) {
          process.exit(1);
        }
      })
      .then(() => {
        console.log(chalk.blue('Watching for changes...'));
      });
  }

  let currentRun = run();

  if (watch) {
    clearConsole();
    infoLog(report, 'Running in watch mode');

    const globsToWatch = getGlobsToWatch(projectElmJson);
    const watcher = chokidar.watch(globsToWatch, {
      awaitWriteFinish: {
        stabilityThreshold: 500,
      },
      ignoreInitial: true,
      ignored: /(\/|^)elm-stuff(\/|$)/,
      cwd: projectRootDir,
    });

    const eventNameMap = {
      add: 'added',
      addDir: 'added',
      change: 'changed',
      unlink: 'removed',
      unlinkDir: 'removed',
    };

    watcher.on('all', (event, filePath) => {
      const eventName = eventNameMap[event] || event;
      clearConsole();
      infoLog(report, '\n' + filePath + ' ' + eventName + '. Rebuilding!');

      // TODO if a previous run is in progress, wait until it's done.
      currentRun = currentRun.then(run);
    });
  }
}

function noFilesFoundError(testFileGlobs) {
  return testFileGlobs.length === 0
    ? `
No .elm files found in the tests/ directory.

To generate some initial tests to get things going: elm-test init

Alternatively, if your project has tests in a different directory,
try calling elm-test with a glob such as: elm-test "src/**/*Tests.elm"
      `.trim()
    : `
No files found matching:

${testFileGlobs.join('\n')}

Are the above patterns correct? Maybe try running elm-test with no arguments?
      `.trim();
}

function main() {
  process.title = 'elm-test';

  checkNodeJsVersion();

  const parseResult = parseArgv(process.argv.slice(2), getPathToElmBinary);
  if (parseResult.tag === 'Error') {
    console.error(parseResult.message);
    throw process.exit(1);
  }
  const parsed = parseResult.value;

  const processes = Math.max(1, os.cpus().length);

  switch (parsed.command.tag) {
    case 'help':
      [
        'init # Create example tests',
        'install PACKAGE # Like `elm install PACKAGE`, except it installs to "test-dependencies" in your elm.json',
        'TESTFILES # Run TESTFILES, for example "src/**/*Tests.elm"',
        '[--compiler /path/to/compiler] # Run tests',
        '[--seed integer] # Run with initial fuzzer seed',
        '[--fuzz integer] # Run with each fuzz test performing this many iterations',
        '[--report json, junit, or console (default)] # Print results to stdout in given format',
        '[--version] # Print version string and exit',
        '[--watch] # Run tests on file changes',
      ].forEach(printUsage);
      throw process.exit(0);

    case 'version':
      console.log(packageInfo.version);
      throw process.exit(0);

    case 'init': {
      if (!fs.existsSync('elm.json')) {
        console.error(
          '`elm-test init` must be run in the same directory as an existing elm.json file! You can run `elm init` to initialize one.'
        );
        throw process.exit(1);
      }

      Install.install(parsed.options.pathToElmBinary, 'elm-explorations/test');
      fs.mkdirpSync('tests');
      fs.copySync(
        path.join(__dirname, '..', 'templates', 'tests', 'Example.elm'),
        'tests/Example.elm'
      );

      console.log(
        '\nCheck out the documentation for getting started at https://package.elm-lang.org/packages/elm-explorations/test/latest'
      );

      throw process.exit(0);
    }

    case 'install': {
      const { packageName } = parsed.command;

      if (!fs.existsSync('elm.json')) {
        console.error(
          '`elm-test install` must be run in the same directory as an existing elm.json file!'
        );
        throw process.exit(1);
      }

      Install.install(parsed.options.pathToElmBinary, packageName);

      throw process.exit(0);
    }

    case 'make': {
      const result = makeAndTestHelper(parsed.command.testFileGlobs);
      switch (result.tag) {
        case 'Ok':
          make(result.value, parsed.options).then(
            () => {
              process.exit(0);
            },
            () => {
              process.exit(1);
            }
          );
          break;

        case 'Error':
          console.error(result.message);
          throw process.exit(1);
      }
      break;
    }

    case 'test': {
      const { testFileGlobs } = parsed.command;
      const result = makeAndTestHelper(testFileGlobs);
      switch (result.tag) {
        case 'Ok':
          test(testFileGlobs, processes, result.value, parsed.options);
          break;

        case 'Error':
          console.error(result.message);
          throw process.exit(1);
      }
    }
  }
}

main();
