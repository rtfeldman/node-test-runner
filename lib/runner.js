var fs = require("fs-extra"),
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

function isElmFile(filename) {
  return /\.elm$/.test(filename);
}


module.exports = {
  toModuleName: toModuleName,
  isElmFile: isElmFile,
  addSrcFilesTo: addSrcFilesTo
};
