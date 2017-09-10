#!/usr/bin/env node
// @flow

process.title = "elm-test";

const _ = require("lodash"),
  os = require("os"),
  chokidar = require("chokidar"),
  Compile = require("./compile.js"),
  Init = require("./init.js"),
  Supervisor = require("./supervisor.js"),
  Package = require("./package.js"),
  Reporter = require("./reporter.js"),
  Prepare = require("./prepare.js"),
  fs = require("fs-extra"),
  minimist = require("minimist"),
  supportsColor = require("supports-color"),
  chalk = require("chalk"),
  path = require("path"),
  child_process = require("child_process"),
  packageInfo = require("../package.json");

process.on("uncaughtException", function(error) {
  if (/ an argument in JavaScript/.test(error)) {
    // Handle arg mismatch between js and elm code. Expected message from Elm:
    // "You are giving module `Main` an argument in JavaScript.
    // This module does not take arguments though! You probably need to change the
    // initialization code to something like `Elm.Test.Generated.Main.fullscreen()`]"
    console.error("Error starting the elm-test CLI.");
    console.error(
      "Please check that your Javascript 'elm-test' and Elm 'node-test-runner' package versions are compatible"
    );
    process.exit(1);
  } else {
    console.error("Unhandled exception while running the tests:", error);
    process.exit(1);
  }
});

// Check node version
const nodeVersionString = process.versions.node,
  nodeVersion = _.map(_.split(nodeVersionString, "."), _.parseInt);

if (
  (nodeVersion[0] === 0 && nodeVersion[1] < 11) ||
  (nodeVersion[0] === 0 && nodeVersion[1] === 11 && nodeVersion[2] < 13)
) {
  console.error("using node v" + nodeVersionString);
  console.error(
    "elm-test requires node v4.7.0 or greater - upgrade the installed version of node and try again"
  );
  process.exit(1);
}

const args = minimist(process.argv.slice(2), {
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
  }),
  watch = args.watch;

let pathToMake = null;

if (args.compiler !== undefined) {
  pathToMake = args.compiler;

  if (!pathToMake) {
    console.error(
      "The --compiler option must be given a path to an elm-make executable."
    );
    process.exit(1);
  }
}

if (args._[0] == "init") {
  const cmdArgs = Init.init();
  const cmd = [Package.pathToElmPackage(pathToMake), "install", "--yes"]
    .concat(cmdArgs)
    .join(" ");

  child_process.execSync(cmd, { stdio: "inherit", cwd: Init.elmPackageDir });

  process.exit(0);
}

let report = "console";

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
}

if (!Reporter.isMachineReadable(report)) {
  var headline = "elm-test " + packageInfo.version;
  var bar = _.repeat("-", headline.length);

  process.stdout.write("\n" + headline + "\n" + bar + "\n\n");
}

const processes = Math.max(1, os.cpus().length),
  verbose = false,
  warn = args.warn || false,
  fuzz = typeof args.fuzz === "undefined" ? null : args.fuzz,
  seed = typeof args.seed === "undefined" ? null : args.seed,
  runs = typeof args.runs === "undefined" ? null : args.runs,
  filePathArgs = args._.length > 0 ? args._ : [];

Promise.all([
  Prepare.prepare(
    processes,
    pathToMake,
    fuzz,
    seed,
    verbose,
    warn,
    report,
    filePathArgs
  ),
  Supervisor.start(
    filePathArgs,
    fuzz,
    runs,
    supportsColor,
    seed,
    report,
    processes,
    args.watch,
    Reporter.isMachineReadable(report)
  )
])
  .then(function(results) {
    const mainFile = results[0].mainFile,
      testRootDir = results[0].testRootDir,
      originalDir = results[0].originalDir,
      runTests = results[1],
      elmPackagePath = path.resolve(path.join(testRootDir, "elm-package.json")),
      newElmPackageDir = path.resolve(testRootDir, Compile.generatedCodeDir);

    if (watch) {
      infoLog(report, "Running in watch mode");

      function resolveWatchPath(basedir) {
        return function(filepath) {
          var basepath = path.isAbsolute(filepath)
            ? filepath
            : path.resolve(basedir, filepath);

          return basepath + "/**/*.elm";
        };
      }

      var watchedSourcePaths = fs
        .readJsonSync(path.join(originalDir, "elm-package.json"), "utf8")[
          "source-directories"
        ]
        .map(resolveWatchPath(originalDir));
      var watchedTestPaths = fs
        .readJsonSync(elmPackagePath, "utf8")["source-directories"]
        .map(resolveWatchPath(path.dirname(elmPackagePath)));
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

        infoLog(
          report,
          "\n" + relativePath + " " + eventName + ". Rebuilding!"
        );

        // TODO if a previous run is in progress, wait until it's done.
        runTests();
      });
    }

    Compile.compileTest(
      mainFile,
      newElmPackageDir,
      pathToMake,
      verbose,
      warn,
      report,
      seed
    )
      .then(runTests)
      .catch(function(error) {
        console.error(error);
        process.exit(1);
      });
  })
  .catch(function(error) {
    console.error(error);
    process.exit(1);
  });

function infoLog(report, msg) {
  if (!Reporter.isMachineReadable(report)) {
    process.stdout.write(msg + "\n");
  }
}
