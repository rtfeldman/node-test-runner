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
  return flatMap(flatMap(fileGlobs, globify), resolveFilePath);
}

function flatMap/*:: <T, U> */(
  array /*: Array<T> */,
  f /*: (T) => Array<U> */
) /*: Array<U> */ {
  return array.reduce((result, item) => result.concat(f(item)), []);
}

function globify(globString /*: string */) /*: Array<string> */ {
  // Without `path.resolve`, `../tests` gives 0 results even if `../tests`
  // exists (at least on MacOS).
  return glob.sync(path.resolve(globString), {
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

// Incorporate the process PID into the socket name, so elm-test processes can
// be run parallel without accidentally sharing each others' sockets.
//
// See https://github.com/rtfeldman/node-test-runner/pull/231
// Also incorporate a salt number into it on Windows, to avoid EADDRINUSE -
// see https://github.com/rtfeldman/node-test-runner/issues/275 - because the
// alternative approach of deleting the file before creating a new one doesn't
// work on Windows. We have to let Windows clean up the named pipe. This is
// essentially a band-aid fix. The alternative is to rewrite a ton of stuff.
function getPipeFilename(runsExecuted /*: number */) /*: string */ {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\elm_test-${process.pid}-${runsExecuted}`
    : `/tmp/elm_test-${process.pid}.sock`;
}

function infoLog(
  report /*: typeof Report.Report */,
  msg /*: string */
) /*: void */ {
  if (report === 'console') {
    console.log(msg);
  }
}

function clearConsole(report /*: typeof Report.Report */) {
  if (report === 'console') {
    process.stdout.write(
      process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H'
    );
  }
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

function delay(ms /*: number */) /*: Promise<void> */ {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const Queue /*: Array<{
  event: 'added' | 'changed' | 'removed',
  filePath: string,
}> */ = [];
void Queue;

function watcherEventMessage(queue /*: typeof Queue */) /*: string */ {
  const suffix = '. Rebuilding!';

  const filePaths = Array.from(new Set(queue.map(({ filePath }) => filePath)));
  if (filePaths.length === 1) {
    const { event, filePath } = queue[0];
    return `${filePath} ${event}${suffix}`;
  }

  const events = Array.from(new Set(queue.map(({ event }) => event))).sort();
  return `${filePaths.length} files ${events.join('/')}${suffix}`;
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
  let watcher = undefined;
  let watchedGlobs /*: Array<string> */ = [];
  let testFilePaths /*: Array<string> */ = [];
  let runsExecuted /*: number */ = 0;
  let currentRun /*: Promise<void> | void */ = undefined;
  let queue /*: typeof Queue */ = [];

  async function run() {
    try {
      // Don’t delay the first run (that’s the only time the queue is empty).
      // Otherwise, wait for a little bit to batch events that happened roughly
      // at the same time. The chokidar docs also mention that by default, the
      // add event will fire when a file first appears on disk, before the
      // entire file has been written. They have a `awaitWriteFinish` option for
      // that, with a `stabilityThreshold` that is an amount of time in
      // milliseconds for a file size to remain constant before emitting its
      // event. Elm files aren’t that huge so it should be fine to just wait a
      // fixed amount of time here instead.
      if (queue.length > 0) {
        await delay(200);
      }

      // Re-print the message in case the queue has become longer while waiting.
      if (queue.length > 0) {
        clearConsole(report);
        infoLog(report, watcherEventMessage(queue));
      }

      // Files may be changed, added or removed so always re-create project info
      // from disk to stay fresh.
      const project = Project.init(projectRootDir, packageInfo.version);

      // Resolving globs is usually pretty fast. When running `elm-test` without
      // arguments it takes around 20-40 ms. Running `elm-test` with 100 files
      // as arguments it takes more than 100 ms (we still need to look for globs
      // in all arguments). Still pretty fast, but it’s super easy to avoid
      // recalculating them: Only when files are added or removed we need to
      // re-calculate what files match the globs. In other words, if only files
      // have changed there’s nothing to do.
      // Actually, all operations down to `Generate.generateElmJson(project)`
      // could potentially be avoided depending on what changed. But all of them
      // are super fast (often less than 1 ms) so it’s not worth bothering.
      const onlyChanged =
        queue.length > 0 && queue.every(({ event }) => event === 'changed');
      queue = [];
      if (!onlyChanged) {
        testFilePaths = resolveGlobs(
          testFileGlobs.length === 0 ? [project.testsDir] : testFileGlobs
        );
      }

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

      runsExecuted++;
      const pipeFilename = getPipeFilename(runsExecuted);

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
    infoLog(report, chalk.blue('Watching for changes...'));
  }

  if (watch) {
    clearConsole(report);
    infoLog(report, 'Running in watch mode');

    const onRunFinish = () => {
      if (queue.length > 0) {
        clearConsole(report);
        infoLog(report, watcherEventMessage(queue));
        currentRun = run().then(onRunFinish);
      } else {
        currentRun = undefined;
      }
    };

    const rerun = (event) => (filePath) => {
      queue.push({ event, filePath });
      if (currentRun === undefined) {
        clearConsole(report);
        infoLog(report, watcherEventMessage(queue));
        currentRun = run().then(onRunFinish);
      }
    };

    // The globs to watch change over time and are added and removed as needed
    // in `run`. We should always watch `elm.json` and `tests/`, though (see the
    // 'addDir' event below).
    const initialGlobsToWatch = [
      ElmJson.getPath(projectRootDir),
      Project.getTestsDir(projectRootDir),
    ];
    watcher = chokidar.watch(initialGlobsToWatch, {
      ignoreInitial: true,
      ignored: /(\/|^)elm-stuff(\/|$)/,
      cwd: projectRootDir,
    });

    watcher.on('add', rerun('added'));
    watcher.on('change', rerun('changed'));
    watcher.on('unlink', rerun('removed'));

    // The only time this event fires is when the `tests/` directory is added
    // (all other glob patterns only match files, not directories).
    // That’s useful if starting the watcher before `tests/` exists.
    // There’s no need to listen for 'unlinkDir' – that makes no difference.
    watcher.on('addDir', rerun('added'));

    // It’s unclear when this event occurrs.
    watcher.on('error', (error) => console.error('Watcher error:', error));

    currentRun = run().then(onRunFinish);
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

function getProjectRootDir(subcommand /*: string */) {
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
}

function getProject(subcommand /*: string */) {
  try {
    return Project.init(getProjectRootDir(subcommand), packageInfo.version);
  } catch (error) {
    console.error(error.message);
    throw process.exit(1);
  }
}

function getPathToElmBinary(compiler /*: string | void */) {
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
}

// Unfortunately commander is very permissive about extra arguments. Therefore,
// we manually check for excessive arguments.
// See: https://github.com/tj/commander.js/issues/1268
function handleTooManyArgs(action) {
  return (...args) => {
    if (args.length < 2) {
      action(...args);
    } else {
      // The arguments to Commander actions are:
      // expectedCliArg1, expectedCliArg2, expectedCliArgN, Cmd, restCliArgs
      const rest = args[args.length - 1];
      if (rest.length > 0) {
        const expected = args.length - 2;
        const s = expected === 1 ? '' : 's';
        console.error(
          `Expected ${expected} argument${s}, but got ${
            expected + rest.length
          }.`
        );
        process.exit(1);
      } else {
        action(...args);
      }
    }
  };
}

const examples = `
elm-test
  Run tests in the tests/ folder

elm-test "src/**/*Tests.elm"
  Run tests in files matching the glob
`.trim();

function main() {
  process.title = 'elm-test';

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
    .action(
      handleTooManyArgs(() => {
        const options = program.opts();
        const pathToElmBinary = getPathToElmBinary(options.compiler);
        const project = getProject('init');
        try {
          Install.install(project, pathToElmBinary, 'elm-explorations/test');
          fs.mkdirSync(project.testsDir, { recursive: true });
          fs.copyFileSync(
            path.join(__dirname, '..', 'templates', 'tests', 'Example.elm'),
            path.join(project.testsDir, 'Example.elm')
          );
        } catch (error) {
          console.error(error.message);
          throw process.exit(1);
        }
        console.log(
          '\nCheck out the documentation for getting started at https://package.elm-lang.org/packages/elm-explorations/test/latest'
        );
        process.exit(0);
      })
    );

  program
    .command('install <package>')
    .description(
      'Like `elm install package`, except it installs to "test-dependencies" in your elm.json'
    )
    .action(
      handleTooManyArgs((packageName) => {
        const options = program.opts();
        const pathToElmBinary = getPathToElmBinary(options.compiler);
        const project = getProject('install');
        try {
          const result = Install.install(project, pathToElmBinary, packageName);
          // This mirrors the behavior of `elm install` passing a package that is
          // already installed. Say it's already installed, then exit 0.
          if (result === 'AlreadyInstalled') {
            console.log('It is already installed!');
          }
          process.exit(0);
        } catch (error) {
          console.error(error.message);
          process.exit(1);
        }
      })
    );

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
    // Hack: This command has a name that isn’t likely to exist as a directory.
    // If the command where called for example “tests” then `elm-test tests src`
    // would only run tests in `src/`, not `tests/`.
    .command('__elmTestCommand__ [globs...]', { hidden: true, isDefault: true })
    .action((testFileGlobs) => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const projectRootDir = getProjectRootDir('tests');
      const processes = Math.max(1, os.cpus().length);
      test(projectRootDir, pathToElmBinary, testFileGlobs, processes, options);
    });

  program.parse(process.argv);
}

main();
