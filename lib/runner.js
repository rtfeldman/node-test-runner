var fs = require("fs-extra"),
  findParentDir = require('find-parent-dir'),
  path = require("path");

function toModuleName(filePath, rootDir) {
 return filePath.substr(
    rootDir.length + 1, // start just after the trailing /
    (filePath.length - rootDir.length - 5) // -5 to strip off .elm at the end
  ).replace(/[\/\\]/g, "."); // replace \ and / with .
}

function addSrcFilesTo(srcModules, visitedDirectories, srcPath, rootDir) {
  if (!visitedDirectories.has(srcPath) &&
    // Ignore elm-stuff/ and files that start with .
    !/(^\.|\/elm-stuff\/)/.test(srcPath)
  ) {
    visitedDirectories.add(srcPath);

    fs.readdirSync(srcPath).forEach(function(filename) {
      // Ignore the Native directory - it can't have tests in it.
      var isNativeDir = filename === path.join(rootDir, "Native");

      if (!isNativeDir) {
        var filePath = path.join(srcPath, filename);
        var stats = fs.lstatSync(filePath);

        if (stats.isDirectory()) {
          addSrcFilesTo(srcModules, visitedDirectories, filePath, rootDir);
        } else if ((stats.isFile() || stats.isSymbolicLink()) && isElmFile(filename)) {
          srcModules.set(filePath, toModuleName(filePath, rootDir));
        }
      }
    });
  }
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

module.exports = {
  toModuleName: toModuleName,
  isElmFile: isElmFile,
  copyNativeSrcFiles: copyNativeSrcFiles,
  repositoryToNativePackageName: repositoryToNativePackageName,
  findNearestElmPackageDir: findNearestElmPackageDir,
  addSrcFilesTo: addSrcFilesTo
};
