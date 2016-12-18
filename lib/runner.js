var fs = require("fs-extra"),
  findParentDir = require('find-parent-dir'),
  chalk = require("chalk"),
  path = require("path");

function toModuleName(filePath) {
  return new Promise(function(resolve, reject) {
    var readStream = fs.createReadStream(filePath, {encoding: 'utf8'});
    var data = "";
    var matches = null;

    readStream.on('data', function (chunk) {
      data += chunk;
      matches = data.match(/^module\s+(\w+)\s/);

      if (matches !== null) {
        readStream.close();
      }
    }).on('close', function () {
      if (matches === null) {
        reject("This file is missing a module declaration.");
      } else {
        resolve(matches[1]);
      }
    }).on('error', function (err) {
      reject(err);
    });
  });
}

function addSrcFilesTo(srcModules, visitedDirectories, srcPath, rootDir) {
  return new Promise(function(resolve, reject) {
    if (!visitedDirectories.has(srcPath) &&
      // Ignore elm-stuff/ and files that start with .
      !/(^\.|\/elm-stuff\/)/.test(srcPath)
    ) {
      visitedDirectories.add(srcPath);

      if (fs.existsSync(srcPath)) {
        fs.readdir(srcPath, function(err, filenames) {
          if (err) {
            reject(err);
          } else {
            filenames.forEach(function(filename) {
              // Ignore the Native directory - it can't have tests in it.
              var isNativeDir = filename === path.join(rootDir, "Native");

              if (!isNativeDir) {
                var filePath = path.join(srcPath, filename);

                fs.lstat(filePath, function(err, stats) {
                  if (err) {
                    reject(err)
                  } else if (stats.isDirectory()) {
                    addSrcFilesTo(srcModules, visitedDirectories, filePath, rootDir).then(resolve);
                  } else if ((stats.isFile() || stats.isSymbolicLink()) && isElmFile(filename)) {
                    toModuleName(filePath, rootDir).then(function(moduleName) {
                      srcModules.set(filePath, moduleName);

                      resolve(srcModules);
                    })
                  }
                });
              }
            });
          }
        });
      } else {
        resolve(null);
      }
    }
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
  if (typeof Elm === 'undefined') { throw 'elm-io config error: Elm is not defined. Make sure you provide a file compiled by Elm!'; }

  var testModule = Elm.Test.Generated.Main;
  var initialSeed = null;

  if (args.seed !== undefined) {
    initialSeed = args.seed;
  }

  pathToMake = args.compiler;

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


module.exports = {
  toModuleName: toModuleName,
  evalElmCode: evalElmCode,
  isElmFile: isElmFile,
  copyNativeSrcFiles: copyNativeSrcFiles,
  repositoryToNativePackageName: repositoryToNativePackageName,
  findNearestElmPackageDir: findNearestElmPackageDir,
  addSrcFilesTo: addSrcFilesTo
};
