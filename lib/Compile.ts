//@flow

const path = require("path"),
  elmCompiler = require("node-elm-compiler"),
  spawn = require("cross-spawn");

function compile(
  testFile/*:string*/,
  projectRootDir/*:string*/,
  verbose/*:boolean*/,
  pathToElmBinary/*:string*/,
  report/*:string*/
) {
  return new Promise((resolve, reject) => {
    const generatedCodeDir = path.resolve(
      path.join(projectRootDir, "elm-stuff", "generated-code", "elm-explorations", "test")
    );
    const dest = path.resolve(path.join(generatedCodeDir, "elmTestOutput.js"));

    const compileProcess = elmCompiler.compile([testFile], {
      output: dest,
      verbose: verbose,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      processOpts: processOptsForReporter(report)
    });

    compileProcess.on("close", function(exitCode) {
      if (exitCode !== 0) {
        reject("Compilation failed");
      } else {
        resolve(dest);
      }
    });
  });
}

function compileAll(
    testFilePaths/*:Array<string>*/,
    generatedCodeDir/*:string*/,
    verbose/*:boolean*/,
    pathToElmBinary/*:string*/,
    report/*:string*/
  ) {
  return new Promise((resolve, reject) => {
    const compileProcess = elmCompiler.compile(testFilePaths, {
      output: "/dev/null",
      cwd: generatedCodeDir,
      verbose: verbose,
      spawn: spawnCompiler(report),
      pathToElm: pathToElmBinary,
      processOpts: processOptsForReporter(report)
    });

    compileProcess.on("close", function(exitCode) {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(
          "Compilation failed while attempting to build "
            + testFilePaths.join(" ")
        );
      }
    });
  });
}

function spawnCompiler(report /*:string*/) {
  return (pathToElm /*:string*/, processArgs/*:Array<string>*/, processOpts) => {
    const finalOpts = Object.assign({},
      processOpts,
      {
        stdio: [
          process.stdin,
          report === "console" ? process.stdout : "ignore",
          process.stderr
        ]
      }
    );

    return spawn(pathToElm, processArgs, finalOpts);
  }
}

function processOptsForReporter(reporter) {
  if (isMachineReadableReporter(reporter)) {
    return { stdio: ["ignore", "ignore", process.stderr] };
  } else {
    return {};
  }
}

function isMachineReadableReporter(reporter/*:string*/) {
  return reporter === "json" || reporter === "junit";
}


module.exports = {compile, compileAll, isMachineReadableReporter};

