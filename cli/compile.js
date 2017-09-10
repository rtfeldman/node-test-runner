//@flow
const compile = require("node-elm-compiler").compile,
  _ = require("lodash"),
  path = require("path"),
  fs = require("fs-extra"),
  Reporter = require("./reporter.js"),
  spawn = require("cross-spawn"),
  generatedCodeDir = path.resolve(
    path.join("elm-stuff", "generated-code", "elm-community", "elm-test")
  ),
  dest = path.resolve(path.join(generatedCodeDir, "elmTestOutput.js"));

// This compiles all the tests so that we generate *.elmi files for them,
// which we can then read to determine which tests need to be run.
function compileAllTests(
  pathToMake /*: ?string */,
  testRootDir /*: string */,
  verbose /*: boolean */,
  warn /*: boolean */,
  report /*: string */,
  testFilePaths /*: Array<string> */
) {
  return new Promise(function(resolve, reject) {
    var compileProcess = compile(testFilePaths, {
      output: "/dev/null",
      verbose: verbose,
      cwd: testRootDir,
      yes: true,
      spawn: spawnCompiler(report),
      pathToMake: pathToMake,
      warn: warn,
      processOpts: processOptsForReporter(report)
    });

    compileProcess.on("close", function(exitCode) {
      if (exitCode !== 0)
        return reject(
          "Compilation failed while attempting to build " +
            testFilePaths.join(" ")
        );

      resolve();
    });
  });
}

function spawnCompiler(report) {
  return function(cmd, args, opts) {
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
  };
}

function processOptsForReporter(reporter /*: string */) {
  if (Reporter.isMachineReadable(reporter)) {
    return { stdio: ["ignore", "ignore", "pipe"] };
  } else {
    return {};
  }
}

function compileTest(
  testFile /*: string */,
  newElmPackageDir /*: string */,
  pathToMake /*: ?string */,
  verbose /*: boolean */,
  warn /*: boolean */,
  report /*: string */,
  seed /*: ?number */
) {
  return Promise.all([
    fs.readFile(path.join(__dirname, "..", "templates", "before.js"), "utf8"),
    new Promise(function(resolve, reject) {
      const compileProcess = compile([testFile], {
        output: dest,
        verbose: verbose,
        yes: true,
        spawn: spawnCompiler,
        pathToMake: pathToMake,

        cwd: newElmPackageDir,

        warn: warn,
        processOpts: processOptsForReporter(report)
      });

      compileProcess.on("close", function(exitCode) {
        if (exitCode !== 0) return reject("Compilation failed for " + testFile);

        resolve(seed);
      });
    })
  ]).then(function(results) {
    const before = results[0];
    const initialSeed = results[2];

    return new Promise(function(resolve, reject) {
      fs.readFile(dest, "utf8", function(readError, content) {
        if (readError) return reject(readError);

        return fs.writeFile(dest, [before, content].join("\n"), function(
          writeError
        ) {
          if (writeError) return reject(writeError);

          resolve();
        });
      });
    });
  });
}

module.exports = {
  compileAllTests: compileAllTests,
  compileTest: compileTest,
  processOptsForReporter: processOptsForReporter,
  generatedCodeDir: generatedCodeDir,
  dest: dest
};
