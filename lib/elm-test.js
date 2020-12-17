// @flow

const { program } = require('commander');
const fs = require('fs');
const os = require('os');
const path = require('path');
const which = require('which');
const packageInfo = require('../package.json');
const Compile = require('./Compile');
const ElmJson = require('./ElmJson');
const FindTests = require('./FindTests');
const Generate = require('./Generate');
const Install = require('./Install');
const Project = require('./Project');
const Report = require('./Report');
const RunTests = require('./RunTests');

void Report;

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

function findClosestElmJson(dir /*: string */) /*: string | void */ {
  const entry = ElmJson.getPath(dir);
  return fs.existsSync(entry)
    ? entry
    : dir === path.parse(dir).root
    ? undefined
    : findClosestElmJson(path.dirname(dir));
}

function getProjectRootDir(subcommand /*: string */) {
  const elmJsonPath = findClosestElmJson(process.cwd());
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
    .option('--watch', 'Run tests on file changes', false)
    // For example `--seed` and `--fuzz` only make sense for the “tests” command
    // and could be specified for that command only, but then they won’t show up
    // in `--help`.
    .option(
      '--seed <int>',
      'Run with a previous fuzzer seed',
      parsePositiveInteger('--seed <int>'),
      Math.floor(Math.random() * 407199254740991) + 1000
    )
    .option(
      '--fuzz <int>',
      'Define how many times each fuzz-test should run',
      parsePositiveInteger('--fuzz <int>'),
      100
    )
    .option(
      '--report <json|junit|console>',
      'Print results to stdout in the given format',
      parseReport('--report <json|junit|console>'),
      'console'
    )
    .option(
      '--compiler <path>',
      'Use a custom path to an Elm executable (default: elm)',
      undefined
    )
    .version(packageInfo.version, '--version', 'Print version and exit')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand('help [command]', 'Show help');

  program
    .command('init')
    .description('Install elm-explorations/test and create tests/Example.elm')
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
        FindTests.resolveGlobs(testFileGlobs, project.rootDir),
        project.generatedCodeDir,
        pathToElmBinary,
        options.report
      ).then(
        () => process.exit(0),
        // `elm-test make` has never logged errors it seems.
        () => process.exit(1)
      );
    });

  program
    // Hack: This command has a name that isn’t likely to exist as a directory
    // containing tests. If the command were instead called "tests" then
    // commander would interpret the `tests` in `elm-test tests src` as a
    // command and only run tests in `src/`, ignoring all files in `tests/`.
    .command('__elmTestCommand__ [globs...]', { hidden: true, isDefault: true })
    .action((testFileGlobs) => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const projectRootDir = getProjectRootDir('tests');
      const processes = Math.max(1, os.cpus().length);
      RunTests.runTests(
        projectRootDir,
        pathToElmBinary,
        testFileGlobs,
        processes,
        options
      ).then(process.exit, (error) => {
        console.error(error.message);
        process.exit(1);
      });
    });

  program.parse(process.argv);
}

main();
