//@flow

const _ = require("lodash"),
  fs = require("fs-extra"),
  Package = require("./package.js"),
  Compile = require("./compile.js"),
  Reporter = require("./reporter.js"),
  child_process = require("child_process"),
  murmur = require("murmur-hash-js"),
  path = require("path"),
  glob = require("glob");

function prepare(
  processes /*: number */,
  pathToMake /*: ?string */,
  fuzz /*: ?number */,
  seed /*: ?number */,
  verbose /*: boolean */,
  warn /*: boolean */,
  report /*: string */,
  filePathArgs /*: Array<string> */
) {
  // It's important to globify all the arguments.
  // On Bash 4.x (or zsh), if you give it a glob as its last argument, Bash
  // translates that into a list of file paths. On bash 3.x it's just a string.
  // Ergo, globify all the arguments we receive.
  let getGlobs;

  if (filePathArgs.length > 0) {
    getGlobs = function() {
      return _.flatMap(filePathArgs, globify);
    };
  } else {
    const root = path.join(
      path.resolve(Package.findNearestElmPackageDir([process.cwd()]))
    );

    getGlobs = function() {
      return globifyWithRoot(root, "test?(s)/**/*.elm");
    };
  }
  const globs = getGlobs(),
    pathToElmPackage = Package.pathToElmPackage(pathToMake),
    testFilePaths = _.flatMap(globs, resolveFilePath),
    testRootDir = path.resolve(Package.findNearestElmPackageDir(testFilePaths)),
    originalDir = path.resolve(
      Package.findNearestElmPackageDir([path.resolve(testRootDir, "..")])
    );

  if (testFilePaths.length === 0) {
    const errorMessage =
      testFilePaths.length > 0
        ? 'No tests found for the file pattern "' +
          testFilePaths.toString() +
          '"\n\nMaybe try running elm-test with no arguments?'
        : "No tests found in the test/ (or tests/) directory.\n\nNOTE: Make sure you're running elm-test from your project's root directory, where its elm-package.json lives.\n\nTo generate some initial tests to get things going, run elm-test init";

    console.error(errorMessage);
    process.exit(1);
  }

  if (testRootDir === originalDir) {
    console.error(
      "It looks like you're running elm-test from within your tests directory.\n\nPlease run elm-test from your project's root directory, where its elm-package.json lives!"
    );
    process.exit(1);
  }

  const returnValues = Package.generatePackageJson(
      testRootDir,
      pathToMake,
      testFilePaths
    ),
    generatedSrc = returnValues[1],
    testSourceDirs = returnValues[2];

  ensurePackagesInstalled(pathToElmPackage, report, testRootDir);

  // Hard link our existing elm-stuff into the generated code,
  // to avoid re-downloading and recompiling things we already
  // just downloaded and compiled.
  const newElmPackageDir = path.resolve(testRootDir, Compile.generatedCodeDir),
    newElmStuffPath = path.join(newElmPackageDir, "elm-stuff");

  if (!fs.existsSync(newElmStuffPath)) {
    fs.symlinkSync(
      path.join(testRootDir, "elm-stuff"),
      newElmStuffPath,
      "junction" // Only affects Windows, but necessary for this to work there. See https://github.com/gulpjs/vinyl-fs/issues/210
    );
  }

  ensurePackagesInstalled(pathToElmPackage, report, newElmPackageDir);

  return Compile.compileAllTests(
    pathToMake,
    testRootDir,
    verbose,
    warn,
    report,
    testFilePaths
  ).then(function() {
    return Package.findTests(
      testRootDir,
      testFilePaths,
      testSourceDirs,
      !Reporter.isMachineReadable(report)
    ).then(function(runnableTests) {
      if (runnableTests.length === 0) {
        const errorMessage =
          filePathArgs.length > 0
            ? "I couldn't find any exposed values of type Test in files matching \"" +
              filePathArgs.toString() +
              '"\n\nMaybe try running elm-test with no arguments?'
            : "I couldn't find any exposed values of type Test in any *.elm files in the test/ (or tests/) directory of your project's root directory.\n\nTo generate some initial tests to get things going, run elm-test init";

        return Promise.reject(errorMessage);
      }

      return generateTests(
        testRootDir,
        originalDir,
        processes,
        fuzz,
        seed,
        report,
        runnableTests,
        filePathArgs,
        generatedSrc,
        getGlobs
      );
    });
  });
}

function ensurePackagesInstalled(pathToElmPackage, report, dir) {
  // We need to install missing packages here.
  const cmd = [pathToElmPackage, "install", "--yes"].join(" ");
  const processOpts = Compile.processOptsForReporter(report);

  try {
    child_process.execSync(cmd, Object.assign({}, processOpts, { cwd: dir }));
  } catch (e) {
    infoLog(report, "Warning: Unable to complete missing packages check.");
  }
}
function globify(filename) {
  return glob.sync(filename, {
    nocase: true,
    ignore: "**/elm-stuff/**",
    nodir: false
  });
}

function globifyWithRoot(root, filename) {
  return glob.sync(filename, {
    root: root,
    nocase: true,
    ignore: "**/elm-stuff/**",
    nodir: false
  });
}

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(filename) {
  let candidates;

  if (!fs.existsSync(filename)) {
    candidates = [];
  } else if (fs.lstatSync(filename).isDirectory()) {
    candidates = _.flatMap(
      glob.sync("/**/*.elm", {
        root: filename,
        nocase: true,
        ignore: "/**/elm-stuff/**",
        nodir: true
      }),
      resolveFilePath
    );
  } else {
    candidates = [path.resolve(filename)];
  }

  // Exclude everything having anything to do with elm-stuff
  return candidates.filter(function(candidate) {
    return candidate.split(path.sep).indexOf("elm-stuff") === -1;
  });
}

function generateTests(
  testRootDir /*: string */,
  originalDir /*: string */,
  processes /*: number */,
  fuzz /*: ?number */,
  seed /*: ?number */,
  report /*: string */,
  tests,
  filePathArgs,
  generatedSrc,
  getGlobs
) {
  // Building things like:
  //
  // import MyTests
  //
  // MyTests.suite
  const imports = _.map(tests, function(test) {
    return "import " + test.name;
  });
  const testList = _.map(tests, function(mod) {
    return (
      '    Test.describe "' +
      mod.name +
      '" [' +
      _.map(mod.tests, function(test) {
        return mod.name + "." + test;
      }).join(",\n    ") +
      "]"
    );
  });

  const testFileBody = [
    imports.join("\n"),
    "",
    "import Test.Reporter.Reporter exposing (Report(..))",
    "import Console.Text exposing (UseColor(..))",
    "import Test.Runner.Node",
    "import Test",
    "import Json.Encode",
    "",
    "main : Test.Runner.Node.TestProgram",
    "main =",
    "    [ " + testList.join(", ") + " ]",
    "        |> Test.concat",
    "        |> Test.Runner.Node.run"
  ].join("\n");

  // Generate a filename that incorporates the hash of file contents.
  // This way, if you run e.g. `elm-test Foo.elm` and then `elm-test Bar.elm`
  // and then re-run `elm-test Foo.elm` we still have a cached `Main` for
  // `Foo.elm` (assuming none of its necessary imports have changed - and
  // why would they?) so we don't have to recompile it.
  const salt = murmur.murmur3(testFileBody);
  const moduleName = "Main" + salt;
  const mainPath = path.join(generatedSrc, "Test", "Generated");
  const mainFile = path.join(mainPath, moduleName + ".elm");
  // We'll be putting the generated Main in something like this:
  //
  // my-project-name/elm-stuff/generated-code/elm-community/elm-test/src/Test/Generated/Main123456.elm
  const testFileContents = [
    "module Test.Generated." + moduleName + " exposing (main)",
    testFileBody
  ].join("\n\n");

  // Make sure src/Test/Generated/ exists so we can write the file there.
  return new Promise(function(resolve, reject) {
    fs.mkdirp(mainPath, function(dirError) {
      if (dirError) return reject(dirError);

      // Always write the file, in order to update its timestamp. This is important,
      // because if we run `elm-make Main123456.elm` and that file's timestamp did
      // not change, elm-make will short-circuit and not recompile *anything* - even
      // if some of Main's dependencies (such as an individual test file) changed.
      fs.writeFile(mainFile, testFileContents, function(fileError) {
        if (fileError) return reject(fileError);

        resolve({
          mainFile: mainFile,
          testRootDir: testRootDir,
          originalDir: originalDir
        });
      });
    });
  });
}

function infoLog(report, msg) {
  if (!Reporter.isMachineReadable(report)) {
    process.stdout.write(msg + "\n");
  }
}

module.exports = { prepare: prepare };
