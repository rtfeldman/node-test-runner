// @flow

const spawn = require('cross-spawn');
const fs = require('fs');
const https = require('https');
const path = require('path');
const chalk = require('chalk');
const ElmHome = require('./ElmHome');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

void Project;

function rmDirSync(dir /*: string */) /*: void */ {
  // We can replace this with just `fs.rmSync(dir, { recursive: true, force: true })`
  // when Node.js 12 is EOL 2022-04-30 and support for Node.js 12 is dropped.
  // `fs.rmSync` was added in Node.js 14.14.0, which is also when the
  // `recursive` option of `fs.rmdirSync` was deprecated. The `if` avoids
  // printing a deprecation message.
  // $FlowFixMe[prop-missing]: Flow does not know of `fs.rmSync` yet.
  if (fs.rmSync !== undefined) {
    fs.rmSync(dir, { recursive: true, force: true });
  } else if (fs.existsSync(dir)) {
    // $FlowFixMe[extra-arg]: Flow does not know of the options argument yet.
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

async function downloadFileNative(
  url /*: string */,
  filePath /*: string */
) /*: Promise<void> */ {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        fs.unlink(filePath, () => {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        });
      } else {
        response.pipe(file);
      }
    });

    // The destination stream is ended by the time it's called
    file.on('finish', () => resolve());

    request.on('error', (err) => {
      fs.unlink(filePath, () => reject(err));
    });

    file.on('error', (err) => {
      fs.unlink(filePath, () => reject(err));
    });

    request.end();
  });
}

function getDirectTestDependencies(
  project /*: typeof Project.Project */
) /*: typeof ElmJson.Dependencies */ {
  switch (project.elmJson.type) {
    case 'application':
      return project.elmJson['test-dependencies'].direct;
    case 'package':
      return project.elmJson['test-dependencies'];
  }
}

const PKG = 'elm-explorations/test';
const VERSION = '1.2.2';
const VERSION_RANGE = '1.2.2 <= v < 2.0.0';

function getExpectedVersion(
  project /*: typeof Project.Project */
) /*: string */ {
  switch (project.elmJson.type) {
    case 'application':
      return VERSION;
    case 'package':
      return VERSION_RANGE;
  }
}

async function installUnstableTestMaster(
  project /*: typeof Project.Project */
) /*: Promise<void> */ {
  const directTestDependencies = getDirectTestDependencies(project);
  const actualVersion = directTestDependencies[PKG];
  const expectedVersion = getExpectedVersion(project);
  if (actualVersion.replace(/\s/g, '') !== expectedVersion.replace(/\s/g, '')) {
    throw new Error(
      `
Could not find ${JSON.stringify(PKG)}: ${JSON.stringify(
        expectedVersion
      )} in your elm.json file here:

${ElmJson.getPath(project.rootDir)}

This command only works if you have ${PKG} as a (direct) test-dependency,
and only if you use ${JSON.stringify(expectedVersion)}.

${
  actualVersion === undefined
    ? 'I could not find it at all.'
    : `You seem to be using ${JSON.stringify(actualVersion)}.`
}
    `.trim()
    );
  }

  console.log(
    chalk.yellow(`Using the master version of ${PKG} in place of ${VERSION}.`)
  );
  console.log(
    chalk.yellow(
      `Note: You will need to use the \`elm-test uninstall-unstable-test-master\` command afterwards to get back to the ${VERSION} version.`
    )
  );

  const pkgWithDash = PKG.replace('/', '-');

  const tempPath = project.generatedCodeDir;
  const zipballUrl = `https://codeload.github.com/${PKG}/zip/refs/heads/master`;
  const zipballPath = path.join(tempPath, `${pkgWithDash}.zip`);

  const packagePath = path.join(ElmHome.packagePath(PKG), VERSION);

  console.log(chalk.dim.yellow(`Removing ${tempPath}`));
  rmDirSync(tempPath);

  console.log(chalk.dim.yellow(`Removing ${packagePath}`));
  rmDirSync(packagePath);

  fs.mkdirSync(tempPath, { recursive: true });
  fs.mkdirSync(packagePath, { recursive: true });

  console.log(chalk.dim.yellow(`Downloading ${zipballUrl}`));
  await downloadFileNative(zipballUrl, zipballPath);

  console.log(chalk.dim.yellow(`Unzipping ${zipballPath}`));
  const unzipResult = spawn.sync('unzip', [
    '-o', // overwrite
    zipballPath, // file to unzip
    '-d',
    tempPath, // directory where to extract files
  ]);

  if (unzipResult.status === 0) {
    console.log(chalk.dim.yellow(`Moving to ELM_HOME: ${packagePath}`));
    fs.renameSync(path.join(tempPath, 'test-master'), packagePath);
  } else {
    // Windows does not have `unzip`, but BSD `tar`. On Windows, we have to extract
    // straight into `packagePath` (instead of `tempPath`), because `fs.renameSync`
    // gives an EPERM error otherwise, which seems to be due to how antivirus works
    // on Windows.
    const tarResult = spawn.sync('tar', [
      'zxf', // eXtract Zipped File
      zipballPath, // file to unzip
      '-C',
      packagePath, // directory where to extract files
      '--strip-components=1', // strip the inner 'test-master' folder
    ]);
    if (tarResult.status !== 0) {
      throw new Error('Failed to unzip the elm-explorations/test repo zipfile');
    }
  }

  console.log(chalk.dim.yellow(`Removing ${zipballPath}`));
  fs.unlinkSync(zipballPath);
}

function uninstallUnstableTestMaster(
  project /*: typeof Project.Project */
) /*: void */ {
  const { generatedCodeDir } = project;
  const packagePath = path.join(ElmHome.packagePath(PKG), VERSION);

  console.log(chalk.dim.yellow(`Removing ${generatedCodeDir}`));
  rmDirSync(generatedCodeDir);

  console.log(chalk.dim.yellow(`Removing ${packagePath}`));
  rmDirSync(packagePath);
}

module.exports = {
  install,
  installUnstableTestMaster,
  uninstallUnstableTestMaster,
};
