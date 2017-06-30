// @flow

var fs = require("fs-extra"),
  path = require("path");

var elmPackageDir = "tests";

function init() {
  var packagesToInstall = [];

  if (fs.existsSync("elm-package.json")) {
    var dest = path.resolve(path.join(elmPackageDir, "elm-package.json"));
    ensureDirectory("tests");

    try {
      var elmPackageContents = fs.readJsonSync("elm-package.json");
      var newElmPackageContents = JSON.stringify(
        modifyElmPackage(elmPackageContents),
        null,
        4
      );

      fs.writeFileSync(dest, newElmPackageContents);

      logCreated(dest);

      if (
        typeof elmPackageContents.dependencies["elm-lang/html"] === "string"
      ) {
        // If we have elm-lang/html installed, install eeue56/elm-html-test
        packagesToInstall = ["eeue56/elm-html-test"];
      }
    } catch (err) {
      console.error("Error reading elm-package.json: " + err);
      process.exit(1);
    }
  } else {
    // User had no elm-package.json, so set up a basic project.
    ensureDirectory("src");

    copyTemplate("elm-package.json");
    copyTemplate(path.join("tests", "elm-package.json"));
  }

  copyTemplate(path.join("tests", "Example.elm"));
  copyTemplate("gitignore", ".gitignore");

  return packagesToInstall;
}

function modifyElmPackage(elmPackageJson) {
  var templateElmPackage = fs.readJsonSync(
    path.resolve(
      path.join(__dirname, "..", "templates", "tests", "elm-package.json")
    )
  );

  // Move all the relative source dirs up 1 level, and add "."
  var sourceDirs = elmPackageJson["source-directories"]
    .map(function(srcDir) {
      if (path.isAbsolute(srcDir)) {
        return srcDir;
      } else {
        return path.join("..", srcDir);
      }
    })
    .concat(["."]);

  var deps = Object.assign(
    {},
    templateElmPackage.dependencies,
    elmPackageJson.dependencies
  );

  return Object.assign({}, elmPackageJson, {
    version: "1.0.0",
    summary: "Test Suites",
    "source-directories": sourceDirs,
    dependencies: deps,
    "exposed-modules": [],
    "elm-version": "0.18.0 <= v < 0.19.0"
  });
}

function copyTemplate(templateName, destName) {
  if (destName === undefined) {
    destName = templateName;
  }

  var source = path.resolve(
    __dirname,
    path.join("..", "templates", templateName)
  );
  var destination = path.resolve(destName);

  if (fs.existsSync(destination)) {
    console.log(destination + " already exists");
  } else {
    fs.copySync(source, destination);
    logCreated(destination);
  }
}

function logCreated(destination) {
  console.log("Created " + destination);
}

function ensureDirectory(dirName) {
  var destination = path.resolve(".", dirName);
  if (fs.existsSync(destination)) {
    console.log(destination + " already exists");
  } else {
    fs.mkdirSync(destination);
    logCreated(destination);
  }
}

module.exports = {
  elmPackageDir: elmPackageDir,
  init: init
};
