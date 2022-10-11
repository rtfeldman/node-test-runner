// @flow

const spawn = require('cross-spawn');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

void Project;

function rmDirSync(dir /*: string */) /*: void */ {
  // We can replace this with just `fs.rmSync(dir, { recursive: true, force: true })`
  // when Node.js 12 is EOL 2022-04-30 and support for Node.js 12 is dropped.
  // `fs.rmSync` was added in Node.js 14.14.0, which is also when the
  // `recursive` option of `fs.rmdirSync` was deprecated. The `if` avoids
  // printing a deprecation message.
  if (fs.rmSync !== undefined) {
    fs.rmSync(dir, { recursive: true, force: true });
  } else if (fs.existsSync(dir)) {
    fs.rmdirSync(dir, { recursive: true });
  }
}

function install(
  project /*: typeof Project.Project */,
  pathToElmBinary /*: string */,
  packageName /*: string */
) /*: 'SuccessfullyInstalled' | 'AlreadyInstalled' */ {
  const installationScratchDir = path.join(project.generatedCodeDir, 'install');

  try {
    // Recreate the directory to remove any artifacts from the last time
    // someone ran `elm-test install`. We do not delete this directory after
    // the installation finishes in case the user needs to debug the test run.
    rmDirSync(installationScratchDir);
    fs.mkdirSync(installationScratchDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Unable to create temporary directory for elm-test install: ${error.message}`
    );
  }

  const { elmJson } = project;

  if (
    elmJson.type === 'package'
      ? elmJson['test-dependencies'].hasOwnProperty(packageName)
      : elmJson['test-dependencies'].direct.hasOwnProperty(packageName)
  ) {
    return 'AlreadyInstalled';
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

  ElmJson.write(installationScratchDir, tmpElmJson);

  const result = spawn.sync(pathToElmBinary, ['install', packageName], {
    stdio: 'inherit',
    cwd: installationScratchDir,
  });

  if (result.status !== 0) {
    process.exit(result.status);
  }

  const newElmJson = ElmJson.read(installationScratchDir);

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

  ElmJson.write(project.rootDir, newElmJson);

  return 'SuccessfullyInstalled';
}

module.exports = {
  install,
};
