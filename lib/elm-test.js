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
const Flags = require('./Flags.js');
const Generate = require('./Generate.js');
const Install = require('./Install.js');
const Report = require('./Report.js');
const Runner = require('./Runner.js');
const Supervisor = require('./Supervisor.js');

void Report;

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

function resolveGlobs(fileGlobs) {
  const results =
    fileGlobs.length > 0
      ? flatMap(fileGlobs, globify)
      : globify('test?(s)/**/*.elm');
  return flatMap(results, resolveFilePath);
}

function flatMap(array, f) {
  return array.reduce((result, item) => result.concat(f(item)), []);
}

function globify(globString) {
  return glob.sync(globString, {
    nocase: true,
    ignore: '**/elm-stuff/**',
    nodir: false,
    absolute: true,
  });
}

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(elmFilePathOrDir) {
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

function getGlobsToWatch(elmJson) {
  const sourceDirectories =
    elmJson.type === 'package' ? ['src'] : elmJson['source-directories'];
  return [...sourceDirectories, 'tests'].map((sourceDirectory) =>
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

function makeAndTestHelper(testFileGlobs, compiler) {
  // Resolve arguments that look like globs for shells that don’t support globs.
  const testFilePaths = resolveGlobs(testFileGlobs);
  const projectRootDir = process.cwd();
  const generatedCodeDir = Compile.getGeneratedCodeDir(projectRootDir);
  const hasBeenGivenCustomGlobs = testFileGlobs.length > 0;
  const elmJsonPath = path.resolve(path.join(projectRootDir, 'elm.json'));

  const pathToElmBinary = getPathToElmBinary(compiler);
  if (pathToElmBinary.tag === 'Error') {
    return pathToElmBinary;
  }

  try {
    const projectElmJson = fs.readJsonSync(elmJsonPath);
    return {
      tag: 'Ok',
      value: {
        pathToElmBinary: pathToElmBinary.value,
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
  report,
  {
    pathToElmBinary,
    testFilePaths,
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson,
  }
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
    pathToElmBinary,
    testFilePaths,
    projectRootDir,
    generatedCodeDir,
    hasBeenGivenCustomGlobs,
    elmJsonPath,
    projectElmJson,
    isPackageProject,
  },
  { watch, report, seed, fuzz }
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

  async function run() {
    // This compiles all the tests so that we generate *.elmi files for them,
    // which we can then read to determine which tests need to be run.
    try {
      const testModules = await Runner.findTests(
        testFilePaths,
        sourceDirs,
        isPackageProject
      );
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
      await runTests(
        generatedCodeDir,
        mainFile,
        pathToElmBinary,
        report,
        watch,
        processes
      );
    } catch (err) {
      console.error(err.message);
      if (!watch) {
        process.exit(1);
      }
    }
    console.log(chalk.blue('Watching for changes...'));
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

let runsExecuted = 0;

async function runTests(
  generatedCodeDir /*: string */,
  testFile /*: string */,
  pathToElmBinary /*: string */,
  report /*: typeof Report.Report */,
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
      ? `\\\\.\\pipe\\elm_test-${process.pid}-${runsExecuted}`
      : `/tmp/elm_test-${process.pid}.sock`;

  await Compile.compile(testFile, dest, pathToElmBinary, report);
  await Generate.prepareCompiledJsFile(pipeFilename, dest);
  await Supervisor.run(
    packageInfo.version,
    pipeFilename,
    report,
    processes,
    dest,
    watch
  );
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

function main() {
  process.title = 'elm-test';

  checkNodeJsVersion();

  const parseResult = Flags.parseArgv(process.argv.slice(2));
  if (parseResult.tag === 'Error') {
    console.error(parseResult.error);
    throw process.exit(1);
  }
  const parsed = parseResult.value;

  const processes = Math.max(1, os.cpus().length);

  const requireElmJsonFile = () => {
    if (!fs.existsSync('elm.json')) {
      console.error(
        `\`elm-test ${parsed.command.tag}\` must be run in the same directory as an existing elm.json file! To make one: elm init`
      );
      throw process.exit(1);
    }
  };

  switch (parsed.command.tag) {
    case 'help':
      console.log(Flags.help());
      throw process.exit(0);

    case 'version':
      console.log(packageInfo.version);
      throw process.exit(0);

    case 'init': {
      requireElmJsonFile();
      const pathToElmBinary = getPathToElmBinary(parsed.options.compiler);
      switch (pathToElmBinary.tag) {
        case 'Ok':
          Install.install(pathToElmBinary.value, 'elm-explorations/test');
          fs.mkdirpSync('tests');
          fs.copySync(
            path.join(__dirname, '..', 'templates', 'tests', 'Example.elm'),
            'tests/Example.elm'
          );
          console.log(
            '\nCheck out the documentation for getting started at https://package.elm-lang.org/packages/elm-explorations/test/latest'
          );
          throw process.exit(0);
        case 'Error':
          console.error(pathToElmBinary.message);
          throw process.exit(1);
      }
      break;
    }

    case 'install': {
      const { packageName } = parsed.command;
      requireElmJsonFile();
      const pathToElmBinary = getPathToElmBinary(parsed.options.compiler);
      switch (pathToElmBinary.tag) {
        case 'Ok':
          Install.install(pathToElmBinary.value, packageName);
          throw process.exit(0);
        case 'Error':
          console.error(pathToElmBinary.message);
          throw process.exit(1);
      }
      break;
    }

    case 'make': {
      const { testFileGlobs } = parsed.command;
      requireElmJsonFile();
      const result = makeAndTestHelper(testFileGlobs, parsed.options.compiler);
      switch (result.tag) {
        case 'Ok':
          make(parsed.options.report, result.value).then(
            () => process.exit(0),
            () => process.exit(1)
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
      requireElmJsonFile();
      const result = makeAndTestHelper(testFileGlobs, parsed.options.compiler);
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
