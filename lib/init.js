var fs = require("fs-extra"),
  path = require("path");

function init(args) {
  var elmOptions = "";
  if (args.yes) {
    elmOptions += " --yes";
  }

  ensureDirectory("src");
  ensureDirectory("tests");
  copyTemplate("elm-package.json");
  copyTemplate("Tests.elm");
  copyTemplate("gitignore", ".gitignore");
}

function copyTemplate(templateName, destName) {
  if (arguments.length == 1) {
    destName = templateName;
  }
  var source = path.resolve(__dirname, "../templates/" + templateName);
  var destination = path.resolve("tests", destName);
  if (fs.existsSync(destination)) {
    console.log(destination + " already exists");
  } else {
    fs.copySync(source, destination);
    console.log("Created " + destination);
  }
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
