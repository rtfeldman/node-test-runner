var fs = require("fs-extra"),
  findParentDir = require('find-parent-dir'),
  _            = require("lodash"),
  spawn        = require("cross-spawn"),
  chalk = require("chalk"),
  firstline = require("firstline"),
  path = require("path");

function readExposing(filePath) {
  return new Promise(function(resolve, reject) {
    // Read ~60 characters at a time, since many module names + exposing (..) will fit in that chunk.
    var readStream = fs.createReadStream(filePath, {encoding: 'utf8', highWaterMark: 8 * 60});
    var data = "";
    var matches = null;
    var exposedValues = [];
    var state = "NO_MATCHES_YET"

    readStream.on('data', function (chunk) {
      data += chunk;

      switch (state) {
        case "NO_MATCHES_YET":
          // Search for "module Foo exposing ("
          matches = data.match(/^module\s+\S+\s+exposing\s+\((.*)/);

          if (matches) {
            // Discard everything up to and including the "(" in "exposing ("
            data = matches[1];
            state = "INSIDE_EXPOSES";
          } else {
            break;
          }

          // NOTE: break intentionally omitted here! We want to keep going if it matched.

        case "INSIDE_EXPOSES":
          // Search for exposed modules followed by )

          // Like so many regular expressions, this is "write once, read never"
          // Basically looking for one of these four:
          //
          // 1) ..
          // 2) foo
          // 3) Foo
          // 4) Foo(..)
          //
          // ...followed by a ")" indicating we've found the end of "exposes"
          while (matches = data.match(/^(\s*..\s*|(?:\s*(?:[a-z][^\),\s]*))|(?:\s*(?:[A-Z][^\_,\s]*[^\(]*(?:\(?:[^\)]+\))?)[,]?\s*))([,\)])(.*)/)) {
            var exposedValue = matches[1].trim();

            if (exposedValue === "..") {
              // An "exposedValues" of null means "everything was exposed"
              exposedValues = null;

              // exposing (..) means we're done! No more exposed values to consume.
              state = "FINISHED";
              break;
            }

            // We only care about lowercase values. Exposed types can't be tests.
            if (exposedValue[0].toLowerCase() === exposedValue[0]) {
              exposedValues.push(exposedValue);
            }

            // If we found the ")" ending the "exposes", we're done.
            // (This value might also be "," - indicating we have further to go.)
            if (matches[2] === ")") {
              state = "FINISHED";
              break;
            }

            // Detect an infinite loop and bail out.
            if (matches[3] === data) {
              reject("Unable to parse \"" + data + "\" - this should never happen. Please report this issue on https://github.com/rtfeldman/node-test-runner - and include the full `module` declaration (including the `exposing`) part of this file: " + filePath);
            }

            // Before the next iteration, set data to be the remainder of the string.
            data = matches[3];
          }

          break;

        case "FINISHED":
          readStream.close();
          break;

        default:
          reject("Invalid module parser state: " + state);
      }
    }).on('close', function () {
      if (matches === null) {
        reject(filePath + " is missing a module declaration.");
      } else {
        resolve(exposedValues);
      }
    }).on('error', function (err) {
      reject(err);
    });
  });
}

function copyNativeSrcFiles(newPackageName, srcPath, dest) {
  fs.readdirSync(srcPath).forEach(function(filename) {
    var filePath = path.join(srcPath, filename);
    var newDest = path.join(dest, filename);
    var stats = fs.lstatSync(filePath);

    if (stats.isDirectory()) {
      fs.mkdirpSync(newDest);

      copyNativeSrcFiles(newPackageName, filePath, newDest);
    } else if ((stats.isFile() || stats.isSymbolicLink()) && isJsFile(filename)) {
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

function isJsFile(filename) {
  return /\.js$/.test(filename);
}

function isElmFile(filename) {
  return /\.elm$/.test(filename);
}

function repositoryToNativePackageName(repository) {
  // https://github.com/rtfeldman/node-test-runner.git
  //
  // matches[1] = "rtfeldman"
  // matches[2] = "node-test-runner"
  var matches = repository.match(/\/([^\/]+)\/([^\/\.]+)\.git/);

  // From the above example, return "rtfeldman$node_test_runner"
  return [
    matches[1].replace(/-/g, "_"),
    matches[2].replace(/-/g, "_")
  ].join("$");
}

function findNearestElmPackageDir(filePaths) {
  // For each of the given files, try to find an ancestor elm-package.json
  // As soon as we find one, return it.
  for (var index=0; index < filePaths.length; index++) {
    var currentDir = path.dirname(filePaths[index]);
    var result = findParentDir.sync(currentDir, "elm-package.json");

    if (result !== null) {
      return result;
    }
  }

  // If we didn't find any, fall back on the current working directory.
  return process.cwd();
}


function evalElmCode (args, report, compiledCode) {
  // Apply Node polyfills as necessary.
  var window = {Date: Date, addEventListener: function() {}, removeEventListener: function() {}};
  var document = {body: {}, createTextNode: function() {}};
  if (typeof XMLHttpRequest === 'undefined') { XMLHttpRequest = function() { return { addEventListener: function() {}, open: function() {}, send: function() {} }; }; }
  if (typeof FormData === 'undefined') { FormData = function () { this._data = []; }; FormData.prototype.append = function () { this._data.push(Array.prototype.slice.call(arguments)); }; }

  var Elm = function(module) { eval(compiledCode); return module.exports; }({});

  // Make sure necessary things are defined.
  if (typeof Elm === 'undefined') { throw 'test runner config error: Elm is not defined. Make sure you provide a file compiled by Elm!'; }

  var potentialModuleNames = Object.keys(Elm.Test.Generated);

  if (potentialModuleNames.length !== 1) {
    console.error("Multiple potential generated modules to run in the Elm.Test.Generated namespace: ", potentialModuleNames, " - this should never happen!");
    process.exit(1);
  }

  var testModule = Elm.Test.Generated[potentialModuleNames[0]];
  var initialSeed = null;

  if (args.seed !== undefined) {
    initialSeed = args.seed;
  }

  // Fix Windows Unicode problems. Credit to https://github.com/sindresorhus/figures for the Windows compat idea!
  var windowsSubstitutions = [[/[↓✗►]/g, '>'], [/╵│╷╹┃╻/g, '|'], [/═/g, '='],, [/▔/g, '-'], [/✔/g, '√']];

  function windowsify(str) {
    return windowsSubstitutions.reduce(
      function(result, sub) { return result.replace(sub[0], sub[1]); }, str);
  }

  function chalkify(messages) {
    return messages.map(function(msg) {
      var path = msg.styles;
      var text = process.platform === 'win32' ? windowsify(msg.text) : msg.text;

      if (path.length === 0) {
        return text;
      } else {
        var fn = chalk;

        path.forEach(function(nextPath) { fn = fn[nextPath]; });

        return fn(text);
      }
    }).join('');
  }

  // Run the Elm app.
  var app = testModule.worker({seed: initialSeed, report: report});

  // Receive messages from ports and translate them into appropriate JS calls.
  app.ports.emit.subscribe(function(msg) {
    var msgType = msg[0];
    var data = msg[1];

    if (msgType === 'FINISHED') {
      if (data.format === "CHALK") {
        console.log(chalkify(data.message));
      } else if (data.format === "JUNIT") {
        console.log(builder.create(data.message).end());
      } else {
        console.log(JSON.stringify(data.message));
      }

      if (!args.watch) {
        process.exit(data.exitCode);
      }
    } else if (msgType === "STARTED" || msgType === "TEST_COMPLETED")  {
        if (data.format === "CHALK") {
          console.log(chalkify(data.message));
        } else if (data.format === "JSON") {
          console.log(JSON.stringify(data.message));
        }

    }
  });
}

var binaryExtension = process.platform === "win32" ? ".exe" : "";
var readElmiPath = path.join(__dirname, "..", "bin", "elm-interface-to-json") + binaryExtension;

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

function toPathsAndModules(testFilePaths, testSourceDirs) {
  var paths = testFilePaths.map(function(filePath) {
    return {filePath: filePath, module: moduleFromFilePath(filePath)};
  });

  // Each module must correspond to a file path, by way of a source directory.
  // This filters out stale modules left over from previous builds, for example
  // what happened in https://github.com/rtfeldman/node-test-runner/issues/122
  return function(testModule) {
    var moduleAsFilename = testModule.name.replace(/[\.]/g, path.sep) + ".elm";

    // for early return purposes, use old-school `for` loops
    for (var pathIndex in paths) {
      var currentPath = paths[pathIndex];

      for (var testSourceDirIndex in testSourceDirs) {
        var testSourceDir = testSourceDirs[testSourceDirIndex];

        if (currentPath.filePath === path.join(testSourceDir, moduleAsFilename)) {
          return [{
            name: testModule.name,
            tests: testModule.tests,
            path: currentPath.filePath
          }];
        }
      }
    }

    return [];
  };
}

function findTests(elmPackageJsonPath, testFilePaths, sourceDirs) {
  return new Promise(function(resolve, reject) {
    console.log(readElmiPath, "--path", elmPackageJsonPath)
    var process = spawn(readElmiPath, ["--path", elmPackageJsonPath]);
    var jsonStr = "";
    var stderrStr = "";

    process.stdout.on('data', function(data) {
      jsonStr += data;
    });

    process.stderr.on('data', function(data) {
      stderrStr += data;
    });

    process.on('close', function(code) {
      if (stderrStr !== "") {
        reject(stderrStr);
      } else if (code !== 0) {
        reject("Finding test interfaces failed, exiting with code " + code);
      }

      var modules;

      try {
        modules = JSON.parse(jsonStr);
      } catch(err) {
        reject("Received invalid JSON from test interface search: " + err);
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
          return [{name: mod.moduleName, tests: eligible}];
        } else {
          return [];
        }
      });

      return verifyModules(testFilePaths).then(function() {

        return Promise.all(
          _.map(_.flatMap(filteredModules, toPathsAndModules(testFilePaths, sourceDirs)), filterExposing)
        ).then(resolve).catch(reject);
      }).catch(reject);
    });
  });
}

// Check for modules where the name doesn't match the filename.
// elm-make won't get a chance to detect this; they'll be filtered out first.
function verifyModules(filePaths) {
  return Promise.all(
    _.map(filePaths, function(filePath) {
      return firstline(filePath).then(function(line) {
        matches = line.match(/^module\s+(\S+)\s*/);

        if (matches) {
          var moduleName = matches[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // A module path matches if it lines up completely with a known one.
          if (!testModulePaths.every(function(testModulePath, index) {
            return testModulePath === modulePath[index];
          })) {
            return Promise.reject(filePath + " has a module declaration of \"" + moduleName + "\" - which does not match its filename!");
          }
        } else {
          return Promise.reject(filePath + " has an invalid module declaration. Check the first line of the file and make sure it has a valid module declaration there!");
        }
      });
    })
  )
}

function filterExposing(pathAndModule) {
  return new Promise(function(resolve, reject) {
    return readExposing(pathAndModule.path).then(function(exposedValues) {
      var newTests =
        exposedValues === null
          // null exposedValues means "the module was exposing (..), so keep everything"
          ? pathAndModule.tests

          // Only keep the tests that were exposed.
          : _.intersection(exposedValues, pathAndModule.tests);

      if (newTests.length < pathAndModule.tests.length) {
        return reject(
          "\n`" + pathAndModule.name + "` is a module with top-level Test values which it does not expose:\n\n" +
          _.difference(pathAndModule.tests, newTests).map(function(test){ return test + " : Test"; }).join("\n") +
          "\n\nThese tests will not get run. Please either expose them or move them out of the top level.");
      } else {
        return resolve({name: pathAndModule.name, tests: newTests});
      }
    }).catch(reject);
  });
}

module.exports = {
  findTests: findTests,
  evalElmCode: evalElmCode,
  isElmFile: isElmFile,
  copyNativeSrcFiles: copyNativeSrcFiles,
  repositoryToNativePackageName: repositoryToNativePackageName,
  findNearestElmPackageDir: findNearestElmPackageDir
};
