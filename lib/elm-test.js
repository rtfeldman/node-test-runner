// @flow

const { InvalidOptionArgumentError, Option, program } = require('commander');
const fs = require('fs');
const os = require('os');
const path = require('path');
const which = require('which');
const packageInfo = require('../package.json');
const Compile = require('./Compile');
const DependencyProvider = require('./DependencyProvider.js');
const ElmJson = require('./ElmJson');
const FindTests = require('./FindTests');
const Generate = require('./Generate');
const Install = require('./Install');
const Project = require('./Project');
const Report = require('./Report');
const RunTests = require('./RunTests');

void Report;

const parsePositiveInteger =
  (minimum /*: number */) =>
  (string /*: string */) /*: number */ => {
    const number = Number(string);
    if (!/^\d+$/.test(string)) {
      throw new InvalidOptionArgumentError('Expected one or more digits.');
    } else if (!Number.isFinite(number)) {
      throw new InvalidOptionArgumentError('Expected a finite number.');
    } else if (number < minimum) {
      throw new InvalidOptionArgumentError(`Expected at least ${minimum}.`);
    } else {
      return number;
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

function getProjectRootDir(subcommand /*: string */) /*: string */ {
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

function getProject(subcommand /*: string */) /*: typeof Project.Project */ {
  try {
    return Project.init(getProjectRootDir(subcommand), packageInfo.version);
  } catch (error) {
    console.error(error.message);
    throw process.exit(1);
  }
}

function getPathToElmBinary(compiler /*: string | void */) /*: string */ {
  const name = compiler === undefined ? 'elm' : compiler;
  try {
    return path.resolve(which.sync(name));
  } catch (_error) {
    console.error(
      compiler === undefined
        ? `Cannot find elm executable, make sure it is installed.
(If elm is not on your path or is called something different the --compiler flag might help.)`
        : `The elm executable passed to --compiler must exist and be exectuble. Got: ${compiler}`
    );
    throw process.exit(1);
  }
}

function outputOptionError() {
  return `
Only /dev/null is allowed.

NOTE: Including this option will not have any effect, as \`elm-test\` does not
produce any output files. It is meant to improve compatibility with editor
plugins explicitly setting the --output flag to /dev/null when using
\`elm-test make\` as a drop-in replacement for \`elm make\`.'
  `.trim();
}

const examples = `
elm-test
  Run tests in the tests/ folder

elm-test "src/**/*Tests.elm"
  Run tests in files matching the glob
`.trim();

function main() {
  const dependencyProvider = new DependencyProvider();

  process.title = 'elm-test';

  program
    .allowExcessArguments(false)
    .name('elm-test')
    .usage('[options] [globs...]')
    .description(examples)
    .option('--watch', 'Run tests on file changes', false)
    // For example `--seed` and `--fuzz` only make sense for the “tests” command
    // and could be specified for that command only, but then they won’t show up
    // in `--help`.
    .addOption(
      new Option('--seed <int>', 'Run with a specific fuzzer seed')
        .default(Math.floor(Math.random() * 407199254740991) + 1000, 'random')
        .argParser(parsePositiveInteger(0))
    )
    .option(
      '--fuzz <int>',
      'Define how many times each fuzz-test should run',
      parsePositiveInteger(1),
      100
    )
    .addOption(
      new Option(
        '--report <format>',
        'Specify which format to use for reporting test results'
      )
        .default('console')
        .choices(Report.all)
    )
    // `chalk.supportsColor` looks at `process.argv` for these flags.
    // We still need to define them so they appear in `--help` and aren’t
    // treated as unknown flags.
    .option(
      '--no-color',
      'Disable colored console output (setting FORCE_COLOR=0 also works)'
    )
    .option(
      '--color',
      'Force colored console output (setting FORCE_COLOR to anything but 0 also works)'
    )
    .option(
      '--compiler <path>',
      'Use a custom path to an Elm executable (default: elm)',
      undefined
    )
    // Ensure compatibility with editor plugins setting --output=/dev/null when
    // running `make`. This has caused issues with Emacs' flycheck-elm package.
    .addOption(
      new Option('--output <output>')
        .argParser((value) => {
          if (value !== '/dev/null') {
            throw new InvalidOptionArgumentError(outputOptionError());
          }
        })
        .hideHelp()
    )
    .version(packageInfo.version, '--version', 'Print version and exit')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand('help [command]', 'Show help');

  program
    .command('init')
    .description('Install elm-explorations/test and create tests/Example.elm')
    .action(() => {
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
    });

  program
    .command('install <package>')
    .description(
      'Like `elm install package`, except it installs to "test-dependencies" in your elm.json'
    )
    .action((packageName) => {
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
    });

  program
    .command('make [globs...]')
    .description('Check files matching the globs for compilation errors')
    .action((testFileGlobs) => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const project = getProject('make');
      const make = async () => {
        Generate.generateElmJson(dependencyProvider, project);
        await Compile.compileSources(
          FindTests.resolveGlobs(
            testFileGlobs.length === 0 ? [project.testsDir] : testFileGlobs,
            project.rootDir
          ),
          project.generatedCodeDir,
          pathToElmBinary,
          options.report
        );
      };
      make().then(
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
        dependencyProvider,
        projectRootDir,
        pathToElmBinary,
        testFileGlobs,
        processes,
        options
      ).then(
        (code) => process.exit(code),
        (error) => {
          console.error(error.message);
          process.exit(1);
        }
      );
    });

  program
    .command('install-unstable-test-master')
    .description(
      'Use the `master` version of the elm-explorations/test library'
    )
    .action(() => {
      const project = getProject('install-unstable-test-master');
      Install.installUnstableTestMaster(project).then(
        () => process.exit(0),
        (error) => {
          console.error(error.message);
          process.exit(1);
        }
      );
    });

  program
    .command('uninstall-unstable-test-master')
    .description(
      'Stop using the `master` version of the elm-explorations/test library'
    )
    .action(() => {
      const options = program.opts();
      const pathToElmBinary = getPathToElmBinary(options.compiler);
      const project = getProject('uninstall-unstable-test-master');
      const run = async () => {
        Install.uninstallUnstableTestMaster(project);
        // Install project elm-explorations/test again. This is based on the `make` command.
        Generate.generateElmJson(dependencyProvider, project);
        const dummyFile = path.join(project.generatedCodeDir, 'Dummy.elm');
        fs.writeFileSync(
          dummyFile,
          `module Dummy exposing (dummy)\ndummy = ()`
        );
        await Compile.compileSources(
          [dummyFile],
          project.generatedCodeDir,
          pathToElmBinary,
          options.report
        );
      };
      run().then(
        () => process.exit(0),
        (error) => {
          console.error(error.message);
          process.exit(1);
        }
      );
    });

  program.parse(process.argv);
}

main();
