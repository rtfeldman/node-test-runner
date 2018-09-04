// @flow

var temp = require("temp"),
  fs = require("fs-extra"),
  path = require("path"),
  child_process = require("child_process");

function install(pathToElmBinary/*:string*/, packageName/*:string*/) {
  // Automatically track and cleanup files at exit
  temp.track();

  try {
    var dirPath = temp.mkdirSync("elm-test-install-");

    var elmJson = JSON.parse(fs.readFileSync("elm.json"));
    var tmpElmJsonPath = path.join(dirPath, "elm.json");

    // Without this, `elm install` will complain about missing source dirs
    // in the temp dir. This way we don't have to create them!
    elmJson["source-directories"] = ["."];

    fs.writeFileSync(tmpElmJsonPath, JSON.stringify(elmJson), "utf8");

    var cmd = [pathToElmBinary, "install"].concat([packageName]).join(" ");

    child_process.execSync(cmd, { stdio: "inherit", cwd: dirPath });

    var newElmJson = JSON.parse(fs.readFileSync(tmpElmJsonPath, "utf8"));

    switch (newElmJson["type"]) {
      case "application":
        function moveToTestDeps(directness) {
          Object.keys(newElmJson["dependencies"][directness]).forEach(function(key) {
            if (!elmJson["dependencies"][directness].hasOwnProperty(key)) {
              // If we didn't have this dep before, move it to test-dependencies.
              newElmJson["test-dependencies"][directness][key] =
                newElmJson["dependencies"][directness][key];

              delete newElmJson["dependencies"][directness][key];
            }
          });
        }

        moveToTestDeps("direct");
        moveToTestDeps("indirect");

        break;

      case "package":
        Object.keys(newElmJson["dependencies"]).forEach(function(key) {
          if (!elmJson["dependencies"].hasOwnProperty(key)) {
            // If we didn't have this dep before, move it to test-dependencies.
            newElmJson["test-dependencies"][key] =
              newElmJson["dependencies"][key];

            delete newElmJson["dependencies"][key];
          }
        });

        break;

      default:
        console.error("Unrecognized elm.json type:", newElmJson["type"]);
        process.exit(1);
    }

    fs.writeFileSync("elm.json", JSON.stringify(newElmJson, null, 4) + "\n", "utf8");
  } catch (err) {
    console.error("Unable to create temporary directory for elm-test install.", err);
    process.exit(1);
  }
}

module.exports = {
  install: install
};
