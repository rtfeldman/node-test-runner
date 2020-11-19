// @flow

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const Compile = require('./Compile');
const ElmJson = require('./ElmJson');

function install(
  projectRootDir /*: string */,
  pathToElmBinary /*: string */,
  packageName /*: string */
) {
  const generatedCodeDir = path.join(
    Compile.getGeneratedCodeDir(projectRootDir),
    'install'
  );

  try {
    // Recreate the directory to remove any artifacts from the last time
    // someone ran `elm-test install`. We do not delete this directory after
    // the installation finishes in case the user needs to debug the test run.
    if (fs.existsSync(generatedCodeDir)) {
      // We can replace this with `fs.rmdirSync(dir, { recursive: true })`
      // once Node.js 10 is EOL 2021-04-30 and support for Node.js 10 is dropped.
      rimraf.sync(generatedCodeDir);
    }
    fs.mkdirSync(generatedCodeDir, { recursive: true });
  } catch (err) {
    console.error(
      'Unable to create temporary directory for elm-test install.',
      err
    );
    process.exit(1);
  }

  const elmJson = ElmJson.read(projectRootDir);

  // This mirrors the behavior of `elm install` passing a package that is
  // already installed. Say it's already installed, then exit 0.
  if (
    elmJson.type === 'package'
      ? elmJson['test-dependencies'].hasOwnProperty(packageName)
      : elmJson['test-dependencies'].direct.hasOwnProperty(packageName)
  ) {
    console.log('It is already installed!');
    return;
  }

  const tmpElmJson =
    elmJson.type === 'package'
      ? elmJson
      : {
          ...elmJson,
          // Without this, `elm install` will complain about missing source dirs
          // in the temp dir. This way we don't have to create them!
          'source-directories': ['.'],
        };

  ElmJson.write(generatedCodeDir, tmpElmJson);

  try {
    child_process.execFileSync(pathToElmBinary, ['install', packageName], {
      stdio: 'inherit',
      cwd: generatedCodeDir,
    });
  } catch (error) {
    process.exit(error.status || 1);
  }

  const newElmJson = ElmJson.read(generatedCodeDir);

  if (newElmJson.type === 'package') {
    Object.keys(newElmJson['dependencies']).forEach(function (key) {
      if (!elmJson['dependencies'].hasOwnProperty(key)) {
        // If we didn't have this dep before, move it to test-dependencies.
        newElmJson['test-dependencies'][key] = newElmJson['dependencies'][key];

        delete newElmJson['dependencies'][key];
      }
    });
  } else {
    function moveToTestDeps(directness) {
      Object.keys(newElmJson['dependencies'][directness]).forEach(function (
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

    if (elmJson.type === 'application') {
      // Restore the old source-directories value.
      newElmJson['source-directories'] = elmJson['source-directories'];
    }
  }

  ElmJson.write(projectRootDir, newElmJson);
}

module.exports = {
  install: install,
};
