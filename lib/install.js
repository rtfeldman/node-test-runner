// @flow

var temp = require('temp'),
  fs = require('fs-extra'),
  path = require('path'),
  child_process = require('child_process');

function install(pathToElmBinary /*:string*/, packageName /*:string*/) {
  var oldSourceDirectories;

  // Automatically track and cleanup files at exit
  temp.track();

  try {
    var dirPath = temp.mkdirSync('elm-test-install-');

    var elmJson = JSON.parse(fs.readFileSync('elm.json'));
    var tmpElmJsonPath = path.join(dirPath, 'elm.json');
    var isPackage;

    switch (elmJson['type']) {
      case 'package':
        isPackage = true;
        break;

      case 'application':
        isPackage = false;
        break;

      default:
        console.error('Unrecognized elm.json type:', elmJson['type']);
        process.exit(1);
    }

    // This mirrors the behavior of `elm install` passing a package that is
    // already installed. Say it's already installed, then exit 0.
    if (
      (isPackage && elmJson['test-dependencies'].hasOwnProperty(packageName)) ||
      (!isPackage &&
        elmJson['test-dependencies']['direct'].hasOwnProperty(packageName))
    ) {
      console.log('It is already installed!');
      return;
    }

    oldSourceDirectories = elmJson['source-directories'];

    // Without this, `elm install` will complain about missing source dirs
    // in the temp dir. This way we don't have to create them!
    elmJson['source-directories'] = ['.'];

    fs.writeFileSync(tmpElmJsonPath, JSON.stringify(elmJson), 'utf8');

    child_process.execFileSync(pathToElmBinary, ['install', packageName], {
      stdio: 'inherit',
      cwd: dirPath,
    });

    var newElmJson = JSON.parse(fs.readFileSync(tmpElmJsonPath, 'utf8'));

    if (isPackage) {
      Object.keys(newElmJson['dependencies']).forEach(function(key) {
        if (!elmJson['dependencies'].hasOwnProperty(key)) {
          // If we didn't have this dep before, move it to test-dependencies.
          newElmJson['test-dependencies'][key] =
            newElmJson['dependencies'][key];

          delete newElmJson['dependencies'][key];
        }
      });
    } else {
      function moveToTestDeps(directness) {
        Object.keys(newElmJson['dependencies'][directness]).forEach(function(
          key
        ) {
          // If we didn't have this dep before, move it to test-dependencies.
          if (!elmJson['dependencies'][directness].hasOwnProperty(key)) {
            // Don't put things in indirect test-dependencies if they
            // are already present in direct test-dependencies! See this issue:
            // https://github.com/rtfeldman/node-test-runner/issues/282
            if (
              directness === 'direct' ||
              !newElmJson['test-dependencies']['direct'].hasOwnProperty(key)
            ) {
              newElmJson['test-dependencies'][directness][key] =
                newElmJson['dependencies'][directness][key];
            }

            delete newElmJson['dependencies'][directness][key];
          }
        });
      }

      moveToTestDeps('direct');
      moveToTestDeps('indirect');
    }

    // Restore the old source-directories value.
    newElmJson['source-directories'] = oldSourceDirectories;

    fs.writeFileSync(
      'elm.json',
      JSON.stringify(newElmJson, null, 4) + '\n',
      'utf8'
    );
  } catch (err) {
    console.error(
      'Unable to create temporary directory for elm-test install.',
      err
    );
    process.exit(1);
  }
}

module.exports = {
  install: install,
};
