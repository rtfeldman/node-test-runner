// @flow

const chalk = require('chalk');
const chokidar = require('chokidar');
const { program } = require('commander');
const fs = require('fs');
const glob = require('glob');
const os = require('os');
const path = require('path');
const which = require('which');
const packageInfo = require('../package.json');
const Compile = require('./Compile.js');
const ElmJson = require('./ElmJson.js');
const Generate = require('./Generate.js');
const Install = require('./Install.js');
const Project = require('./Project.js');
const Report = require('./Report.js');
const Runner = require('./Runner.js');
const Supervisor = require('./Supervisor.js');

void Report;

// Resolve arguments that look like globs for shells that don’t support globs.
function resolveGlobs(fileGlobs /*: Array<string> */) /*: Array<string> */ {
  const results =
    fileGlobs.length > 0
      ? flatMap(fileGlobs, globify)
      : globify('test?(s)/**/*.elm');
  return flatMap(results, resolveFilePath);
}

function flatMap/*:: <T, U> */(
  array /*: Array<T> */,
  f /*: (T) => Array<U> */
) /*: Array<U> */ {
  return array.reduce((result, item) => result.concat(f(item)), []);
}

function globify(globString /*: string */) /*: Array<string> */ {
  return glob.sync(globString, {
    nocase: true,
    ignore: '**/elm-stuff/**',
    nodir: false,
    absolute: true,
  });
}

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(elmFilePathOrDir /*: string */) /*: Array<string> */ {
  const candidates = !fs.existsSync(elmFilePathOrDir)
    ? []
    : fs.lstatSync(elmFilePathOrDir).isDirectory()
    ? flatMap(
        glob.sync('/**/*.elm', {
          root: elmFilePathOrDir,
          nocase: true,
          ignore: '/**/elm-stuff/**',
          nodir: true,
        }),
        resolveFilePath
      )
    : [path.resolve(elmFilePathOrDir)];

  // Exclude everything having anything to do with elm-stuff
  return candidates.filter(
    (candidate) => !candidate.split(path.sep).includes('elm-stuff')
  );
}

function getGlobsToWatch(
  project /*: typeof Project.Project */
) /*: Array<string> */ {
  return project.testsSourceDirs.map((sourceDirectory) =>
    // TODO: Test this on Windows.
    path.posix.join(sourceDirectory, '**', '*.elm')
  );
}

function infoLog(
  report /*: typeof Report.Report */,
  msg /*: string */
) /*: void */ {
  if (report === 'console') {
    console.log(msg);
  }
}

function clearConsole() {
  process.stdout.write(
    process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H'
  );
}

function diffArrays/*:: <T> */(
  from /*: Array<T> */,
  to /*: Array<T> */
) /*: { added: Array<T>, removed: Array<T> } */ {
  return {
    added: to.filter((item) => !from.includes(item)),
    removed: from.filter((item) => !to.includes(item)),
  };
}

function test(
  projectRootDir /*: string */,
  pathToElmBinary /*: string */,
  testFileGlobs /*: Array<string> */,
  processes /*: number */,
  {
    watch,
    report,
    seed,
    fuzz,
  } /*: {
    watch: boolean,
    report: typeof Report.Report,
    seed: number,
    fuzz: number,
  } */
) {
  let watcher;
  let watchedGlobs /*: Array<string> */ = [];
  let currentRun;
  let runsExecuted = 0;

  async function run() {
    try {
      // Files maybe be changed, added or removed so always read from disk to
      // stay fresh.
      const project = Project.init(projectRootDir, packageInfo.version);
      const testFilePaths = resolveGlobs(testFileGlobs);

      if (testFilePaths.length === 0) {
        throw new Error(noFilesFoundError(project.rootDir, testFileGlobs));
      }

      if (watcher !== undefined) {
        const nextGlobsToWatch = getGlobsToWatch(project);
        const diff = diffArrays(watchedGlobs, nextGlobsToWatch);
        watchedGlobs = nextGlobsToWatch;
        watcher.add(diff.added);
        watcher.unwatch(diff.removed);
      }

      Generate.generateElmJson(project);

      const testModules = await Runner.findTests(
        testFilePaths,
        project.testsSourceDirs,
        project.elmJson.type === 'package'
      );

      const mainFile = Generate.generateMainModule(
        fuzz,
        seed,
        report,
        testFileGlobs,
        testFilePaths,
        testModules,
        project.generatedCodeDir,
        processes
      );

      const dest = path.join(project.generatedCodeDir, 'elmTestOutput.js');

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
          ? `\\\\.\\pipe\\elm_test-${process.pid}-${runsExecuted}`
          : `/tmp/elm_test-${process.pid}.sock`;

      await Compile.compile(
        project.generatedCodeDir,
        mainFile,
        dest,
        pathToElmBinary,
        report
      );

      Generate.prepareCompiledJsFile(pipeFilename, dest);

      await Supervisor.run(
        packageInfo.version,
        pipeFilename,
        report,
        processes,
        dest,
        watch
      );
    } catch (err) {
      console.error(err.message);
      if (!watch) {
        process.exit(1);
      }
    }
    console.log(chalk.blue('Watching for changes...'));
  }

  if (watch) {
    clearConsole();
    infoLog(report, 'Running in watch mode');

    // More globs to watch are added later.
    const initialGlobsToWatch = [ElmJson.getPath(projectRootDir)];
    watcher = chokidar.watch(initialGlobsToWatch, {
      awaitWriteFinish: {
        stabilityThreshold: 500,
      },
      ignoreInitial: true,
      ignored: /(\/|^)elm-stuff(\/|$)/,
      cwd: projectRootDir,
    });

    currentRun = run();

    const eventNameMap = {
      add: 'added',
      addDir: 'added',
      change: 'changed',
      unlink: 'removed',
      unlinkDir: 'removed',
    };

    watcher.on('all', (event, filePath) => {
      // TODO: Handle different events slightly differently.
      const eventName = eventNameMap[event] || event;
      clearConsole();
      infoLog(report, '\n' + filePath + ' ' + eventName + '. Rebuilding!');

      // TODO if a previous run is in progress, wait until it's done.
      currentRun = currentRun.then(run);
    });
  } else {
    run();
  }
}

function noFilesFoundError(projectRootDir, testFileGlobs) {
  return testFileGlobs.length === 0
    ? `
${noFilesFoundInTestsDir(projectRootDir)}

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

function noFilesFoundInTestsDir(projectRootDir) {
  const testsDir = path.join(projectRootDir, 'tests');
  try {
    const stats = fs.statSync(testsDir);
    return stats.isDirectory()
      ? 'No .elm files found in the tests/ directory.'
      : `Expected a directory but found something else at: ${testsDir}\nCheck it out! Could you remove it?`;
  } catch (error) {
    return error.code === 'ENOENT'
      ? 'The tests/ directory does not exist.'
      : `Failed to read the tests/ directory: ${error.message}`;
  }
}

// TODO(https://github.com/rtfeldman/node-test-runner/pull/465): replace this
// function with commander's custom error messages once
// https://github.com/tj/commander.js/pull/1392 lands and is released.
const parsePositiveInteger = (flag /*: string */) => (
  string /*: string */
) /*: number */ => {
  const number = Number(string);
  if (!/^\d+$/.test(string)) {
    console.error(
      `error: option '${flag}' expected one or more digits, but got: ${string}`
    );
    throw process.exit(1);
  } else if (!Number.isFinite(number)) {
    console.error(
      `error: option '${flag}' expected a finite number, but got: ${number}`
    );
    throw process.exit(1);
  } else {
    return number;
  }
};

// TODO(https://github.com/rtfeldman/node-test-runner/pull/465): replace this
// function with commander's validating sets of strings once
// https://github.com/tj/commander.js/issues/518 is released (probably v7).
const parseReport = (flag /*: string */) => (
  string /*: string */
) /*: typeof Report.Report */ => {
  try {
    return Report.parse(string);
  } catch (error) {
    console.error(`error: option '${flag}' ${error.message}`);
    throw process.exit(1);
  }
};

function findClosest(
  dir /*: string */,
  dirToPath /*: (dir: string) => string */
) /*: string | void */ {
  const entry = dirToPath(dir);
  return fs.existsSync(entry)
    ? entry
    : dir === path.parse(dir).root
    ? undefined
    : findClosest(path.dirname(dir), dirToPath);
}

const examples = `
elm-test
  Run tests in the tests/ folder

elm-test "src/**/*Tests.elm"
  Run tests in files matching the glob
`.trim();

function main() {
  process.title = 'elm-test';

  const getProjectRootDir = (subcommand /*: string */) /*: string */ => {
    const elmJsonPath = findClosest(process.cwd(), ElmJson.getPath);
    if (elmJsonPath === undefined) {
      const command =
        subcommand === 'tests' ? 'elm-test' : `elm-test ${subcommand}`;
      console.error(
        `\`${command}\` requires an elm.json up the directory tree, but none could be found! To make one: elm init`
      );
      throw process.exit(1);
    }
    return path.dirname(elmJsonPath);
  };

  const getProject = (
    subcommand /*: string */
  ) /*: typeof Project.Project */ => {
    try {
      return Project.init(getProjectRootDir(subcommand), packageInfo.version);
    } catch (error) {
      console.error(error.message);
      throw process.exit(1);
    }
  };

  const getPathToElmBinary = (compiler /*: string | void */) /*: string */ => {
    const name = compiler === undefined ? 'elm' : compiler;
    try {
      return path.resolve(which.sync(name));
    } catch (_error) {
      throw new Error(
        compiler === undefined
          ? `Cannot find elm executable, make sure it is installed.
(If elm is not on your path or is called something different the --compiler flag might help.)`
          : `The elm executable passed to --compiler must exist and be exectuble. Got: ${compiler}`
      );
    }
  };

  program
    .storeOptionsAsProperties(false)
    .name('elm-test')
    .usage('[options] [globs...]')
    .description(examples)
    // For example `--seed` and `--fuzz` only make sense for the “tests” command
    // and could be specified for that command only, but then they won’t show up
    // in `--help`.
    .option(
      '--compiler <path>',
      'Use a custom path to an Elm executable (default: elm)',
      undefined
    )
    .option(
      '--seed <int>',
      'Run with a previous fuzzer seed',
      parsePositiveInteger('--seed <int>'),
      Math.floor(Math.random() * 407199254740991) + 1000
    )
    .option(
      '--fuzz <int>',
      'Run with each fuzz test performing this many iterations',
      parsePositiveInteger('--fuzz <int>'),
      100
    )
    .option(
      '--report <json|junit|console>',
      'Print results to stdout in the given format',
      parseReport('--report <json|junit|console>'),
      'console'
    )
    .option('--watch', 'Run tests on file changes', false)
    .version(packageInfo.version, '--version', 'Print version and exit')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand('help [command]', 'Show help');

  program
    .command('init')
    .description('Create example tests')
    .action((cmd) => {
      if (cmd.args.length > 0) {
        console.error(
          `error: init takes no arguments, but got ${
            cmd.args.length
          }: ${cmd.args.join(' ')}`
        );
        throw process.exit(1);
      }
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const project = getProject('init');
      Install.install(project, pathToElmBinary, 'elm-explorations/test');
      fs.mkdirSync(project.testsDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, '..', 'templates', 'tests', 'Example.elm'),
        path.join(project.testsDir, 'Example.elm')
      );
      console.log(
        '\nCheck out the documentation for getting started at https://package.elm-lang.org/packages/elm-explorations/test/latest'
      );
      process.exit(0);
    });

  program
    .command('install <package>')
    .description(
      'Like `elm install package`, except it installs to "test-dependencies" in your elm.json'
    )
    .action((packageName, cmd) => {
      if (cmd.args.length > 1) {
        // Unfortunately commander is very permissive about extra arguments. Therefore,
        // we manually check for excessive arguments.
        // See: https://github.com/tj/commander.js/issues/1268
        console.error(
          `error: install takes one single argument, but got ${
            cmd.args.length
          }: ${cmd.args.join(' ')}`
        );
        throw process.exit(1);
      }
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const project = getProject('install');
      Install.install(project, pathToElmBinary, packageName);
      process.exit(0);
    });

  program
    .command('make [globs...]')
    .description('Check files matching the globs for compilation errors')
    .action((testFileGlobs) => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const project = getProject('make');
      Generate.generateElmJson(project);
      Compile.compileSources(
        resolveGlobs(testFileGlobs),
        project.generatedCodeDir,
        pathToElmBinary,
        options.report
      ).then(
        () => process.exit(0),
        () => process.exit(1)
      );
    });

  program
    // Hack: This command is named `tests` so that `elm-test tests` means the same
    // as `elm-test tests/` (due defaulting to `tests/` if no arguments given).
    .command('tests [globs...]', { hidden: true, isDefault: true })
    .action((testFileGlobs) => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const projectRootDir = getProjectRootDir('install');
      const processes = Math.max(1, os.cpus().length);
      test(projectRootDir, pathToElmBinary, testFileGlobs, processes, options);
    });

  program.parse(process.argv);
}

main();
