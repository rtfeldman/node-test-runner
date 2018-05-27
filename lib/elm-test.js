// @flow

var packageInfo = require("../package.json");
var pipeFilename = require("./pipe-filename.js");
var dns = require("dns");
var processTitle = "elm-test";

process.title = processTitle;

process.on("uncaughtException", function(error) {
  if (/ an argument in Javascript/.test(error)) {
    // Handle arg mismatch between js and elm code. Expected message from Elm:
    // "You are giving module `Main` an argument in JavaScript.
    // This module does not take arguments though! You probably need to change the
    // initialization code to something like `Elm.Test.Generated.Main.fullscreen()`]"
    console.error("Error starting the node-test-runner.");
    console.error(
      "Please check your Javascript 'elm-test' and Elm 'node-test-runner' package versions are compatible"
    );
    process.exit(1);
  } else {
    console.error("Unhandled exception while running the tests:", error);
    process.exit(1);
  }
});

var compile = require("node-elm-compiler").compile,
  fs = require("fs-extra"),
  os = require("os"),
  supportsColor = require("supports-color"),
  murmur = require("murmur-hash-js"),
  glob = require("glob"),
  path = require("path"),
  util = require("util"),
  _ = require("lodash"),
  spawn = require("cross-spawn"),
  minimist = require("minimist"),
  firstline = require("firstline"),
  chokidar = require("chokidar"),
  Runner = require("./runner.js"),
  Supervisor = require("./supervisor.js"),
  Init = require("./init.js"),
  child_process = require("child_process");

var generatedCodeDir = path.resolve(
  path.join("elm-stuff", "generated-code", "elm-community", "elm-test")
);
var args = minimist(process.argv.slice(2), {
  alias: {
    help: "h",
    fuzz: "f",
    seed: "s",
    compiler: "c",
    "add-dependencies": "a",
    report: "r",
    watch: "w"
  },
  boolean: ["warn", "version", "help", "watch"],
  string: ["add-dependencies", "compiler", "seed", "report", "fuzz"]
});
var processes = Math.max(1, os.cpus().length);

// Recursively search directories for *.elm files, excluding elm-stuff/
function resolveFilePath(filename) {
  var candidates;

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

var pathToElm = "elm";

if (args.compiler !== undefined) {
  pathToElm = path.resolve(args.compiler);

  if (!pathToElm) {
    console.error(
      "The --compiler option must be given a path to an elm-make executable."
    );
    process.exit(1);
  }
}

function printUsage(str) {
  console.log("Usage: elm-test " + str + "\n");
}

if (args.help) {
  var exampleGlob = path.join("tests", "**", "*.elm");

  [
    "init # Create example tests",
    "TESTFILES # Run TESTFILES, for example " + exampleGlob,
    "[--compiler /path/to/compiler] # Run tests",
    "[--seed integer] # Run with initial fuzzer seed",
    "[--fuzz integer] # Run with each fuzz test performing this many iterations",
    "[--add-dependencies path-to-destination-elm.json] # Add missing dependencies from current elm.json to destination",
    "[--report json, junit, or console (default)] # Print results to stdout in given format",
    "[--version] # Print version string and exit",
    "[--watch] # Run tests on file changes"
  ].forEach(printUsage);

  process.exit(1);
}

if (args.version) {
  console.log(require(path.join(__dirname, "..", "package.json")).version);
  process.exit(0);
}

if (args["add-dependencies"]) {
  var target = args["add-dependencies"];

  if (fs.existsSync("elm.json")) {
    if (fs.existsSync(target)) {
      var elmPackageContents = {};
      var targetElmPackageContents = {};

      try {
        elmPackageContents = fs.readJsonSync("elm.json");
      } catch (err) {
        console.error("Error reading elm.json: " + err);
        process.exit(1);
      }

      try {
        targetElmPackageContents = fs.readJsonSync(target);
      } catch (err) {
        console.error("Error reading " + target + ": " + err);
        process.exit(1);
      }

      var newDeps = Object.assign(
        targetElmPackageContents.dependencies,
        elmPackageContents.dependencies
      );

      fs.writeFileSync(
        target,
        JSON.stringify(targetElmPackageContents, null, 4) + "\n"
      );

      console.log("Successfully updated dependencies in " + target);
      process.exit(0);
    } else {
      console.error(
        target +
          " does not exist.\n\nPlease re-run elm-test --add-dependencies with a target elm.json file (usually your tests' elm.json) that exists!"
      );
      process.exit(1);
    }
  } else {
    console.error(
      "There is no elm.json in this directory.\n\nPlease re-run elm-test --add-dependencies from a directory that contains an elm.json file!"
    );
    process.exit(1);
  }
}

var originalDir;
var testRootDir;
var elmJsonPath;

function runTests(testFile) {
  var dest = path.resolve(path.join(generatedCodeDir, "elmTestOutput.js"));

  var compileProcess = compile([testFile], {
    output: dest,
    verbose: args.verbose,
    spawn: spawnCompiler,
    pathToElm: pathToElm,
    warn: args.warn,
    processOpts: processOptsForReporter(args.report)
  });

  compileProcess.on("close", function(exitCode) {
    if (exitCode !== 0) {
      console.error("Compilation failed for", testFile);
      if (!args.watch) {
        process.exit(exitCode);
      }
    } else {
      var initialSeed = null;

      if (args.seed !== undefined) {
        initialSeed = args.seed;
      }
      prepareCompiledJsFile(initialSeed, report, dest);

      Supervisor.run(
        packageInfo.version,
        report,
        processes,
        dest,
        args.watch,
        isMachineReadableReporter(report)
      );
    }
  });
}

function prepareCompiledJsFile(initialSeed, report, dest) {
  // TODO read files in parallel using Promise.all
  var before = fs.readFileSync(
    path.join(__dirname, "..", "templates", "before.js"),
    "utf8"
  );
  var after = fs.readFileSync(
    path.join(__dirname, "..", "templates", "after.js"),
    "utf8"
  );
  var content = fs.readFileSync(dest, "utf8");

  var finalContent = [
    before,
    "var Elm = (function(module) { ",
    content,
    "return this.Elm;",
    "})({});",
    "var initialSeed = " + String(initialSeed) + ";",
    'var report = "' + report + '";',
    "var pipeFilename = " + JSON.stringify(pipeFilename) + ";",
    after
  ].join("\n");

  fs.writeFileSync(dest, finalContent);
}

function checkNodeVersion() {
  var nodeVersionString = process.versions.node;
  var nodeVersion = _.map(_.split(nodeVersionString, "."), _.parseInt);

  if (
    (nodeVersion[0] === 0 && nodeVersion[1] < 11) ||
    (nodeVersion[0] === 0 && nodeVersion[1] === 11 && nodeVersion[2] < 13)
  ) {
    console.log("using node v" + nodeVersionString);
    console.error(
      "elm-test requires node v4.7.0 or greater - upgrade the installed version of node and try again"
    );
    process.exit(1);
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

function runElmTest() {
  checkNodeVersion();

  if (args._[0] == "init") {
    var packagesToInstall = Init.init();
    if (packagesToInstall.length > 0) {
      var cmd = [pathToElm, "install"].concat(cmdArgs).join(" ");
      child_process.execSync(cmd, { stdio: "inherit", cwd: Init.elmPackageDir });
    }

    process.exit(0);
  }

  // It's important to globify all the arguments.
  // On Bash 4.x (or zsh), if you give it a glob as its last argument, Bash
  // translates that into a list of file paths. On bash 3.x it's just a string.
  // Ergo, globify all the arguments we receive.
  var filePathArgs = args._.length > 0 ? args._ : [];
  var getGlobs;

  if (filePathArgs.length > 0) {
    getGlobs = function() {
      return _.flatMap(filePathArgs, globify);
    };
  } else {
    var root = path.join(
      path.resolve(Runner.findNearestElmPackageDir([process.cwd()]))
    );

    getGlobs = function() {
      return globifyWithRoot(root, "test?(s)/**/*.elm");
    };
  }
  var globs = getGlobs();
  var testFilePaths = _.flatMap(globs, resolveFilePath);

  if (testFilePaths.length === 0) {
    var errorMessage =
      filePathArgs.length > 0
        ? 'No tests found for the file pattern "' +
          filePathArgs.toString() +
          '"\n\nMaybe try running elm-test with no arguments?'
        : "No tests found in the test/ (or tests/) directory.\n\nNOTE: Make sure you're running elm-test from your project's root directory, where its elm.json lives.\n\nTo generate some initial tests to get things going, run elm-test init";

    console.error(errorMessage);
    process.exit(1);
  }

  testRootDir = path.resolve(Runner.findNearestElmPackageDir(testFilePaths));
  originalDir = path.resolve(
    Runner.findNearestElmPackageDir([path.resolve(testRootDir, "..")])
  );
  elmJsonPath = path.resolve(path.join(testRootDir, "elm.json"));

  if (testRootDir === originalDir) {
    console.error(
      "It looks like you're running elm-test from within your tests directory.\n\nPlease run elm-test from your project's root directory, where its elm.json lives!"
    );
    process.exit(1);
  }

  process.chdir(testRootDir);

  var returnValues = generatePackageJson(filePathArgs);
  var newElmPackageDir = returnValues[0];
  var generatedSrc = returnValues[1];
  var sourceDirs = returnValues[2];

  return new Promise(function (resolve) { resolve(); })
    .then(function() {
      // // Hard link our existing elm-stuff into the generated code,
      // // to avoid re-downloading and recompiling things we already
      // // just downloaded and compiled.
      // var newElmStuffPath = path.join(newElmPackageDir, "elm-stuff");

      // if (!fs.existsSync(newElmStuffPath)) {
      //   fs.symlinkSync(
      //     path.join(testRootDir, "elm-stuff"),
      //     newElmStuffPath,
      //     "junction" // Only affects Windows, but necessary for this to work there. See https://github.com/gulpjs/vinyl-fs/issues/210
      //   );
      // }
    })
    .then(function() {
      return compileAllTests(testFilePaths);
    })
    .then(function() {
      return Runner.findTests(
        testRootDir,
        testFilePaths,
        sourceDirs,
        !isMachineReadableReporter(report)
      )
        .then(function(runnableTests) {
          process.chdir(newElmPackageDir);

          generateAndRunTests(
            runnableTests,
            filePathArgs,
            generatedSrc,
            getGlobs
          );
        })
        .catch(function(err) {
          console.error(err);
          process.exit(1);
        });
    })
    .catch(function(err) {
      console.error(err);
      process.exit(1);
    });
}

function isMachineReadableReporter(reporter) {
  return reporter === "json" || reporter === "junit";
}

function processOptsForReporter(reporter) {
  if (isMachineReadableReporter(reporter)) {
    return { stdio: ["ignore", "ignore", "pipe"] };
  } else {
    return {};
  }
}

// This compiles all the tests so that we generate *.elmi files for them,
// which we can then read to determine which tests need to be run.
function compileAllTests(testFilePaths) {
  return new Promise(function(resolve, reject) {
    var compileProcess = compile(testFilePaths, {
      output: "/dev/null",
      verbose: args.verbose,
      spawn: spawnCompiler,
      pathToElm: pathToElm,
      warn: args.warn,
      processOpts: processOptsForReporter(args.report)
    });

    compileProcess.on("close", function(exitCode) {
      if (exitCode !== 0) {
        reject(
          "Compilation failed while attempting to build " +
            testFilePaths.join(" ")
        );
      } else {
        resolve();
      }
    });
  });
}

function generatePackageJson(filePathArgs) {
  // TODO we don't want to do this every single time. Instead,
  // verify that the generated elm.json is there, with the
  // expected version number. Iff the version number is wrong, regenerate.
  var newElmPackageDir = path.resolve(testRootDir, generatedCodeDir);
  var generatedSrc = path.join(newElmPackageDir, "src");

  var elmPackageContents = {};

  try {
    elmPackageContents = fs.readJsonSync(elmJsonPath);
  } catch (err) {
    console.error("Error reading elm.json: " + err);
    process.exit(1);
  }

  if (!elmPackageContents.dependencies) {
    elmPackageContents.dependencies = {};
  }

  // Ensure that we have packages that Test.Runner.Node needs
  function ensurePackage(name, version) {
    if (!elmPackageContents.dependencies.hasOwnProperty(name)) {
      elmPackageContents.dependencies[name] = version;
      delete elmPackageContents["do-not-edit-this-by-hand"]["transitive-dependencies"][name];
    }
  }

  ensurePackage("elm/random", "1.0.0");
  ensurePackage("elm/time", "1.0.0");
  ensurePackage("elm/json", "1.0.0");

  // Make all the source-directories absolute, and introduce a new one.
  var sourceDirs = (elmPackageContents["source-directories"] || []).map(
    function(src) {
      return path.resolve(src);
    }
  );

  elmPackageContents["source-directories"] = [
    // Include elm-stuff/generated-sources - since we'll be generating sources in there.
    generatedSrc,

    // TODO: now that node-test-runner doesn't include native code, shouldn't we just add it as a normal Elm dependency in elm.json, instead of adding it as a source-directory?
    // Include node-test-runner's src directory, to allow access to the Runner code.
    path.resolve(path.join(__dirname, "..", "src"))
  ].concat(sourceDirs);

  fs.mkdirpSync(newElmPackageDir);

  // Generate the new elm.json
  fs.writeFileSync(
    path.join(newElmPackageDir, "elm.json"),
    JSON.stringify(elmPackageContents, null, 4)
  );

  return [newElmPackageDir, generatedSrc, sourceDirs];
}

function generateAndRunTests(tests, filePathArgs, generatedSrc, getGlobs) {
  // Building things like:
  //
  // import MyTests
  //
  // MyTests.suite
  var imports = _.map(tests, function(test) {
    return "import " + test.name;
  });
  var testList = _.map(tests, function(mod) {
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

  if (testList.length === 0) {
    var errorMessage =
      filePathArgs.length > 0
        ? "I couldn't find any exposed values of type Test in files matching \"" +
          filePathArgs.toString() +
          '"\n\nMaybe try running elm-test with no arguments?'
        : "I couldn't find any exposed values of type Test in any *.elm files in the test/ (or tests/) directory of your project's root directory.\n\nTo generate some initial tests to get things going, run elm-test init";

    console.error(errorMessage);
    process.exit(1);
  }

  function sanitizedToString(str) {
    return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function getReportCode() {
    switch (args.report) {
      case "json":
        return "JsonReport";
      case "junit":
        return "JUnitReport";
      default:
        if (supportsColor) {
          return "(ConsoleReport UseColor)";
        } else {
          return "(ConsoleReport Monochrome)";
        }
    }
  }

  var fuzz = parseInt(args.fuzz);
  var seed = parseInt(args.seed);
  var opts = {
    fuzz: isNaN(fuzz) ? "Nothing" : "Just " + fuzz,
    seed: isNaN(seed) ? "Nothing" : "Just " + seed,
    report: getReportCode(),
    paths: filePathArgs.map(sanitizedToString).join(",")
  };

  var optsCode =
    "{ runs = " +
    opts.fuzz +
    ", report = " +
    opts.report +
    ", seed = " +
    opts.seed +
    ", processes = " +
    processes +
    ", paths = [" +
    opts.paths +
    "]}";

  var testFileBody = [
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
    "        |> Test.Runner.Node.runWithOptions " + optsCode
  ].join("\n");

  // Generate a filename that incorporates the hash of file contents.
  // This way, if you run e.g. `elm-test Foo.elm` and then `elm-test Bar.elm`
  // and then re-run `elm-test Foo.elm` we still have a cached `Main` for
  // `Foo.elm` (assuming none of its necessary imports have changed - and
  // why would they?) so we don't have to recompile it.
  var salt = murmur.murmur3(testFileBody);
  var moduleName = "Main" + salt;
  var mainPath = path.join(generatedSrc, "Test", "Generated");
  var mainFile = path.join(mainPath, moduleName + ".elm");
  // We'll be putting the generated Main in something like this:
  //
  // my-project-name/elm-stuff/generated-code/elm-community/elm-test/src/Test/Generated/Main123456.elm
  var testFileContents = [
    "module Test.Generated." + moduleName + " exposing (main)",
    testFileBody
  ].join("\n\n");

  // Make sure src/Test/Generated/ exists so we can write the file there.
  fs.mkdirpSync(mainPath);

  // Always write the file, in order to update its timestamp. This is important,
  // because if we run `elm-make Main123456.elm` and that file's timestamp did
  // not change, elm-make will short-circuit and not recompile *anything* - even
  // if some of Main's dependencies (such as an individual test file) changed.
  fs.writeFileSync(mainFile, testFileContents);

  if (args.watch) {
    infoLog("Running in watch mode");

    function resolveWatchPath(basedir) {
      return function(filepath) {
        var basepath = path.isAbsolute(filepath)
          ? filepath
          : path.resolve(basedir, filepath);

        return basepath + "/**/*.elm";
      };
    }

    var watchedSourcePaths;
    var elmJson = fs.readJsonSync(path.join(originalDir, "elm.json"), "utf8");
    if (elmJson["type"] === "package") {
      watchedSourcePaths = [ resolveWatchPath(originalDir)("./src") ];
    } else {
      watchedSourcePaths = elmJson["source-directories"].map(resolveWatchPath(originalDir));
    }
    var watchedTestPaths = fs
      .readJsonSync(elmJsonPath, "utf8")
      ["source-directories"].map(
        resolveWatchPath(path.dirname(elmJsonPath))
      );
    var watchedPaths = watchedSourcePaths.concat(watchedTestPaths);

    var watcher = chokidar.watch(watchedPaths, {
      awaitWriteFinish: {
        stabilityThreshold: 500
      },
      ignoreInitial: true,
      ignored: /(\/|^)elm-stuff(\/|$)/
    });

    var eventNameMap = {
      add: "added",
      addDir: "added",
      change: "changed",
      unlink: "removed",
      unlinkDir: "removed"
    };

    watcher.on("all", function(event, filePath) {
      var relativePath = path.relative(testRootDir, filePath);
      var eventName = eventNameMap[event] || event;

      infoLog("\n" + relativePath + " " + eventName + ". Rebuilding!");

      // TODO if a previous run is in progress, wait until it's done.
      runTests(mainFile);
    });
  }

  runTests(mainFile);
}

var report;

if (
  args.report === "console" ||
  args.report === "json" ||
  args.report === "junit"
) {
  report = args.report;
} else if (args.report !== undefined) {
  console.error(
    "The --report option must be given either 'console', 'junit', or 'json'"
  );
  process.exit(1);
} else {
  report = "console";
}

function infoLog(msg) {
  if (report === "console") {
    console.log(msg);
  }
}

function spawnCompiler(cmd, args, opts) {
  var compilerOpts = _.defaults(
    {
      stdio: [
        process.stdin,
        report === "console" ? process.stdout : "ignore",
        process.stderr
      ]
    },
    opts
  );

  return spawn(cmd, args, compilerOpts);
}

runElmTest();
