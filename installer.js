module.exports = function(verbose) {
  var binstall = require("binstall");
  var path = require("path");

  // 'arm', 'ia32', or 'x64'.
  var arch = process.arch;

  // 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
  var operatingSystem = process.platform;

  var filename = "elm-interface-to-json-" + operatingSystem + "-" + arch + ".tar.gz";
  var url = "https://github.com/rtfeldman/node-test-runner/releases/download/0.18.13/" + filename;

  var binariesDir = path.join(__dirname, "bin");
  var binaryExtension = process.platform === "win32" ? ".exe" : "";
  var executablePaths = [
    path.join(binariesDir, "elm-interface-to-json" + binaryExtension)
  ];
  var errorMessage = "Unfortunately, there are no elm-test binaries available on your operating system and architecture.\n\nIf you would like to build Elm from source, there are instructions at https://github.com/elm-lang/elm-platform#build-from-source\n";

  return binstall(
    url,
    { path: binariesDir },
    {
      verbose: verbose,
      verify: executablePaths,
      errorMessage: errorMessage
    }
  );
};
