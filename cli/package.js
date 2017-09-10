//@flow

const _ = require("lodash"),
  fs = require("fs-extra"),
  finder = require("./finder.js"),
  Compile = require("./Compile.js"),
  installReadElmi = require("../installer"),
  spawn = require("cross-spawn"),
  firstline = require("firstline"),
  findParentDir = require("find-parent-dir"),
  path = require("path"),
  binaryExtension = process.platform === "win32" ? ".exe" : "",
  readElmiPath =
    path.join(__dirname, "..", "bin", "elm-interface-to-json") +
    binaryExtension;

function generatePackageJson(
  testRootDir /*: string */,
  pathToMake /*: ?string */,
  filePathArgs /*: Array<string> */
) {
  // TODO we don't want to do this every single time. Instead,
  // verify that the generated elm-package.json is there, with the
  // expected version number. Iff the version number is wrong, regenerate.
  const newElmPackageDir = path.resolve(testRootDir, Compile.generatedCodeDir),
    elmPackageJsonPath = path.resolve(
      path.join(testRootDir, "elm-package.json")
    ),
    generatedSrc = path.join(newElmPackageDir, "src");

  let elmPackageContents = {};

  try {
    elmPackageContents = fs.readJsonSync(elmPackageJsonPath);
  } catch (err) {
    console.error("Error reading elm-package.json: " + err);
    process.exit(1);
  }

  // Enable Native modules in the new elm-package.json, so we can import
  // the function that translates runtime exceptions into test failures.
  elmPackageContents["native-modules"] = true;

  // TODO remove the next two conditionals once random-pcg has become core's new Random!
  if (!elmPackageContents.dependencies) {
    elmPackageContents.dependencies = {};
  }

  if (!elmPackageContents.dependencies.hasOwnProperty("mgold/elm-random-pcg")) {
    // Test.Runner.Node.App needs this to create a Seed from the current timestamp
    Object.assign(elmPackageContents.dependencies, {
      "mgold/elm-random-pcg": "4.0.2 <= v < 6.0.0"
    });
  }

  // Make all the source-directories absolute, and introduce a new one.
  const testSourceDirs = (elmPackageContents["source-directories"] || [])
    .map(function(src) {
      return path.resolve(testRootDir, src);
    });

  elmPackageContents["source-directories"] = [
    // Include elm-stuff/generated-sources - since we'll be generating sources in there.
    generatedSrc,

    // Include node-test-runner's src directory, to allow access to the Runner code.
    path.resolve(path.join(__dirname, "..", "src"))
  ].concat(testSourceDirs);

  fs.mkdirpSync(newElmPackageDir);

  // Generate the new elm-package.json
  fs.writeFileSync(
    path.join(newElmPackageDir, "elm-package.json"),
    JSON.stringify(elmPackageContents, null, 4)
  );

  // Copy all the native-src files over. These need to be "localized" - that is,
  // in js they cannot define things using rtfeldman$node_test_runner - but rather
  // must use the appropriate package name from the elm-package.json we're copying.
  copyNativeSrcFiles(
    repositoryToNativePackageName(elmPackageContents.repository),
    path.join(__dirname, "..", "native-src"),
    generatedSrc
  );

  return [newElmPackageDir, generatedSrc, testSourceDirs];
}

function copyNativeSrcFiles(
  newPackageName /*:string*/,
  srcPath /*:string*/,
  dest /*:string*/
) {
  fs.readdirSync(srcPath).forEach(function(filename) {
    var filePath = path.join(srcPath, filename);
    var newDest = path.join(dest, filename);
    var stats = fs.lstatSync(filePath);

    if (stats.isDirectory()) {
      fs.mkdirpSync(newDest);

      copyNativeSrcFiles(newPackageName, filePath, newDest);
    } else if (
      (stats.isFile() || stats.isSymbolicLink()) &&
      isJsFile(filename)
    ) {
      var contents = fs.readFileSync(filePath, "utf8");

      // These Native files need to use the local package name,
      // because of how we're hacking them in.
      var newContents = contents.replace(
        /rtfeldman\$node_test_runner([\.=\s]*)/gm,
        newPackageName + "$1"
      );

      fs.writeFileSync(newDest, newContents);
    }
  });
}

function repositoryToNativePackageName(repository /*:string*/) {
  // https://github.com/rtfeldman/node-test-runner.git
  //
  // matches[1] = "rtfeldman"
  // matches[2] = "node-test-runner"
  var matches = repository.match(/\/([^\/]+)\/([^\/]+)\.git/);

  if (matches instanceof Array) {
    var userName = matches[1];
    var repoName = matches[2];

    //"A dot in repository name breaks `elm-make`" https://github.com/elm-lang/elm-make/issues/106
    if (userName.indexOf(".") >= 0 || repoName.indexOf(".") >= 0) {
      throw "Elm currently doesn't support having periods in the user/project part of the repository field of elm-package.json. Aborting test run.";
    }
    // From the above example, return "rtfeldman$node_test_runner"
    return [userName, repoName].map(name => name.replace(/-/g, "_")).join("$");
  } else {
    throw "Unable to convert repository " + repository + " to package name.";
  }
}

function isJsFile(filename) {
  return /\.js$/.test(filename);
}

function isElmFile(filename /*: string*/) {
  return /\.elm$/.test(filename);
}

function findTests(
  elmPackageJsonPath /*: string*/,
  testFilePaths /*: Array<string>*/,
  testSourceDirs /*: Array<string>*/,
  verbose /*: boolean*/
) {
  return new Promise(function(resolve, reject) {
    function finish() {
      var process = spawn(readElmiPath, ["--path", elmPackageJsonPath]);
      var jsonStr = "";
      var stderrStr = "";

      process.stdout.on("data", function(data) {
        jsonStr += data;
      });

      process.stderr.on("data", function(data) {
        stderrStr += data;
      });

      process.on("close", function(code) {
        if (stderrStr !== "") {
          return reject(stderrStr);
        } else if (code !== 0) {
          return reject(
            "Finding test interfaces failed, exiting with code " + code
          );
        }

        var modules;

        try {
          modules = JSON.parse(jsonStr);
        } catch (err) {
          return reject(
            "Received invalid JSON from test interface search: " + err
          );
        }

        var filteredModules = _.flatMap(modules, function(mod) {
          var eligible = _.flatMap(mod.types, function(typ) {
            if (typ.signature === "Test.Test") {
              return typ.name;
            } else {
              return [];
            }
          });

          // Must have at least 1 value of type Test. Otherwise ignore this module.
          if (eligible.length > 0) {
            return [{ name: mod.moduleName, tests: eligible }];
          } else {
            return [];
          }
        });

        return verifyModules(testFilePaths)
          .then(function() {
            return Promise.all(
              _.map(
                _.flatMap(
                  filteredModules,
                  toPathsAndModules(testFilePaths, testSourceDirs)
                ),
                filterExposing
              )
            )
              .then(resolve)
              .catch(reject);
          })
          .catch(reject);
      });
    }

    if (fs.existsSync(readElmiPath)) {
      // elm-interface-to-json was already downloaded successfully. We're good!
      return finish();
    } else {
      // it wasn't downloaded, possibly because we were installed with
      // --ignore-scripts - so download it!
      return installReadElmi(verbose).then(finish).catch(reject);
    }
  });
}

function pathToElmPackage(pathToMake /*: ?string */) {
  return pathToMake == null
    ? "elm-package"
    : path.join(path.dirname(pathToMake), "elm-package");
}

// Check for modules where the name doesn't match the filename.
// elm-make won't get a chance to detect this; they'll be filtered out first.
function verifyModules(filePaths) {
  return Promise.all(
    _.map(filePaths, function(filePath) {
      return firstline(filePath).then(function(line) {
        var matches = line.match(/^(?:(?:port|effect)\s+)?module\s+(\S+)\s*/);

        if (matches) {
          var moduleName = matches[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // A module path matches if it lines up completely with a known one.
          if (
            !testModulePaths.every(function(testModulePath, index) {
              return testModulePath === modulePath[index];
            })
          ) {
            return Promise.reject(
              filePath +
                ' has a module declaration of "' +
                moduleName +
                '" - which does not match its filename!'
            );
          }
        } else {
          return Promise.reject(
            filePath +
              " has an invalid module declaration. Check the first line of the file and make sure it has a valid module declaration there!"
          );
        }
      });
    })
  );
}

function toPathsAndModules(
  testFilePaths /*:Array<string>*/,
  testSourceDirs /*:Array<string>*/
) {
  var paths = testFilePaths.map(function(filePath) {
    return { filePath: filePath, module: moduleFromFilePath(filePath) };
  });

  // Each module must correspond to a file path, by way of a source directory.
  // This filters out stale modules left over from previous builds, for example
  // what happened in https://github.com/rtfeldman/node-test-runner/issues/122
  return function(testModule) {
    var moduleAsFilename = testModule.name.replace(/[\.]/g, path.sep) + ".elm";

    // for early return purposes, use old-school `for` loops
    for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      var currentPath = paths[pathIndex];

      for (
        var testSourceDirIndex = 0;
        testSourceDirIndex < testSourceDirs.length;
        testSourceDirIndex++
      ) {
        var testSourceDir = testSourceDirs[testSourceDirIndex];

        if (
          currentPath.filePath === path.join(testSourceDir, moduleAsFilename)
        ) {
          return [
            {
              name: testModule.name,
              tests: testModule.tests,
              path: currentPath.filePath
            }
          ];
        }
      }
    }

    return [];
  };
}

function moduleFromFilePath(filePathArg) {
  var parsed = path.parse(path.normalize(filePathArg));
  var basename = path.basename(parsed.base, ".elm");

  // Turn these into module name checks to be performed, in order.
  // e.g. 'tests/All/Passing.elm' ===> ['Passing', 'All', 'tests']
  // This way, if we're given 'All.Passing' as a module name, we can also
  // flip it into ['Passing', 'All'], and see if the first N elements line up.
  return _.compact(parsed.dir.split(path.sep).concat([basename])).reverse();
}

function moduleFromTestName(testName) {
  return testName.split(".").reverse();
}

function toPathsAndModules(
  testFilePaths /*:Array<string>*/,
  testSourceDirs /*:Array<string>*/
) {
  var paths = testFilePaths.map(function(filePath) {
    return { filePath: filePath, module: moduleFromFilePath(filePath) };
  });

  // Each module must correspond to a file path, by way of a source directory.
  // This filters out stale modules left over from previous builds, for example
  // what happened in https://github.com/rtfeldman/node-test-runner/issues/122
  return function(testModule) {
    var moduleAsFilename = testModule.name.replace(/[\.]/g, path.sep) + ".elm";

    // for early return purposes, use old-school `for` loops
    for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      var currentPath = paths[pathIndex];

      for (
        var testSourceDirIndex = 0;
        testSourceDirIndex < testSourceDirs.length;
        testSourceDirIndex++
      ) {
        var testSourceDir = testSourceDirs[testSourceDirIndex];

        if (
          currentPath.filePath === path.join(testSourceDir, moduleAsFilename)
        ) {
          return [
            {
              name: testModule.name,
              tests: testModule.tests,
              path: currentPath.filePath
            }
          ];
        }
      }
    }

    return [];
  };
}

function filterExposing(pathAndModule) {
  return new Promise(function(resolve, reject) {
    return finder
      .readExposing(pathAndModule.path)
      .then(function(exposedValues) {
        var newTests =
          exposedValues.length === 1 && exposedValues[0] === ".."
            ? // null exposedValues means "the module was exposing (..), so keep everything"
              pathAndModule.tests
            : // Only keep the tests that were exposed.
              _.intersection(exposedValues, pathAndModule.tests);

        if (newTests.length < pathAndModule.tests.length) {
          return reject(
            "\n`" +
              pathAndModule.name +
              "` is a module with top-level Test values which it does not expose:\n\n" +
              _.difference(pathAndModule.tests, newTests)
                .map(function(test) {
                  return test + " : Test";
                })
                .join("\n") +
              "\n\nThese tests will not get run. Please either expose them or move them out of the top level."
          );
        } else {
          return resolve({ name: pathAndModule.name, tests: newTests });
        }
      })
      .catch(reject);
  });
}

function findNearestElmPackageDir(filePaths /*:Array<string>*/) {
  // For each of the given files, try to find an ancestor elm-package.json
  // As soon as we find one, return it.
  for (let index = 0; index < filePaths.length; index++) {
    const currentDir = path.dirname(filePaths[index]);
    const result = findParentDir.sync(currentDir, "elm-package.json");

    if (result !== null) {
      return result;
    }
  }

  // If we didn't find any, fall back on the current working directory.
  return process.cwd();
}

module.exports = {
  findTests: findTests,
  isElmFile: isElmFile,
  copyNativeSrcFiles: copyNativeSrcFiles,
  repositoryToNativePackageName: repositoryToNativePackageName,
  findNearestElmPackageDir: findNearestElmPackageDir,
  generatePackageJson: generatePackageJson,
  pathToElmPackage: pathToElmPackage
};
