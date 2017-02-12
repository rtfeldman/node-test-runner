var fs = require("fs-extra"),
  path = require("path");

function init(args) {
  if (fs.existsSync("elm-package.json")) {
    try {
      var elmPackageContents = fs.readJsonSync(path.resolve(__dirname, "..", "templates", "elm-package.json"));

      var newElmPackageContents = JSON.stringify(modifyElmPackage(elmPackageContents), null, 4);
      var dest = path.resolve(path.join("tests", "elm-package.json"));

      ensureDirectory("tests");

      fs.writeFileSync(dest, newElmPackageContents);

      logCreated(dest);
    } catch (err) {
      console.error("Error reading elm-package.json: " + err);
      process.exit(1);
    }
  } else {
    // User had no elm-package.json, so set up a basic project.
    ensureDirectory("src");
    ensureDirectory("tests");

    copyTemplate("elm-package.json");
  }

  var elmOptions = "";
  if (args.yes) {
    elmOptions += " --yes";
  }

  copyTemplate(path.join("tests", "Example.elm"));
  copyTemplate("gitignore", ".gitignore");
}

function modifyElmPackage(elmPackageJson) {
  // Move all the source dirs up 1 level, and add suites/ and shared/
  var sourceDirs = elmPackageJson["source-directories"].map(
    function(srcDir) { return path.join("..", srcDir); }
  ).concat(["tests"]);

  var deps = Object.assign({
    "elm-lang/core": "5.0.0 <= v < 6.0.0",
    "mgold/elm-random-pcg": "4.0.2 <= v < 5.0.0",
    "elm-community/elm-test": "3.0.0 <= v < 4.0.0"
  }, elmPackageJson["dependencies"]);

  return Object.assign({}, elmPackageJson,
    {
      "version": "1.0.0",
      "summary": "Test Suites",
      "source-directories": sourceDirs,
      "dependencies": deps,
      "exposed-modules": [],
      "elm-version": "0.18.0 <= v < 0.19.0"
    }
  );
}

function copyTemplate(templateName, destName) {
  if (arguments.length == 1) {
    destName = templateName;
  }

  var source = path.resolve(__dirname, path.join("..", "templates", templateName));
  var destination = path.resolve(destName);

  if (fs.existsSync(destination)) {
    console.log(destination + " already exists");
  } else {
    fs.copySync(source, destination);
    logCreated(destination);
  }
}

function logCreated(destination) {
  console.log("Created " + destination)
}

function ensureDirectory(dirName) {
  var destination = path.resolve(".", dirName);
  if (fs.existsSync(destination)) {
    console.log(destination + " already exists");
  } else {
    fs.mkdirSync(destination);
    console.log("Created " + destination);
  }
}

module.exports = {
  init: init
}
