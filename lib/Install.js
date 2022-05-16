// @flow

const {exec} = require('child_process');
const spawn = require('cross-spawn');
const {unzip} = require('zlib');
const fs = require('fs');
const os = require('os');
const https = require('https');
const path = require('path');
const chalk = require('chalk');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

void Project;

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
    // We can replace this with just `fs.rmSync(installationScratchDir, { recursive: true, force: true })`
    // when Node.js 12 is EOL 2022-04-30 and support for Node.js 12 is dropped.
    // `fs.rmSync` was added in Node.js 14.14.0, which is also when the
    // `recursive` option of `fs.rmdirSync` was deprecated. The `if` avoids
    // printing a deprecation message.
    // $FlowFixMe[prop-missing]: Flow does not know of `fs.rmSync` yet.
    if (fs.rmSync !== undefined) {
      fs.rmSync(installationScratchDir, { recursive: true, force: true });
    } else if (fs.existsSync(installationScratchDir)) {
      // $FlowFixMe[extra-arg]: Flow does not know of the options argument yet.
      fs.rmdirSync(installationScratchDir, { recursive: true });
    }
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

async function downloadFileNative(url, filePath) {
  const usedCommand = `require("https").get(${JSON.stringify(url)})`;
  const errorPrefix = `${usedCommand}\nThe above call errored: `;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    let fileInfo = null;

    const request = https.get(url, response => {
      if (response.statusCode !== 200) {
        fs.unlink(filePath, () => {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        });
        return;
      }

      fileInfo = {
        mime: response.headers['content-type'],
        size: parseInt(response.headers['content-length'], 10),
      };

      response.pipe(file);
    });

    // The destination stream is ended by the time it's called
    file.on('finish', () => resolve(fileInfo));

    request.on('error', err => {
      fs.unlink(filePath, () => reject(err));
    });

    file.on('error', err => {
      fs.unlink(filePath, () => reject(err));
    });

    request.end();
  });
}

async function installUnstableTestMaster(projectRootDir) {
  console.log(chalk.yellow('Using the master version of elm-explorations/test'));
  console.log(chalk.yellow('Note you might need to rm -rf ~/.elm and/or ./elm-stuff afterwards.'));

  const pkg = 'elm-explorations/test';
  const version = '1.2.2';
  const pkgWithDash = pkg.replace('/','-');

  const tempPath = path.join(
    projectRootDir,
    'elm-stuff',
    'generated-code',
    'elm-community',
    'elm-test'
  );
  const zipballUrl = `https://codeload.github.com/${pkg}/zip/refs/heads/master`;
  const zipballFilename = `${pkgWithDash}.zip`;
  const zipballPath = path.join(tempPath, zipballFilename);
  const homeDir = os.homedir();

  // based on info in https://package.elm-lang.org/packages/elm/project-metadata-utils/latest/
  const elmHome = process.env.ELM_HOME ?? (
    process.platform === 'win32'
      ? path.join(process.env.APPDATA, 'elm')
      : path.join(homeDir, '.elm')
  );
  const packagePath = path.join(
    elmHome,
    '0.19.1',
    'packages',
    pkg,
    version
  );

  fs.rmSync(tempPath,    { recursive: true, force: true });
  fs.rmSync(packagePath, { recursive: true, force: true });
  fs.mkdirSync(tempPath,    { recursive: true });
  fs.mkdirSync(packagePath, { recursive: true });
  await downloadFileNative(zipballUrl, zipballPath);
  const unzipResult = spawn.sync(
    'unzip',
    [
      '-o', // overwrite
      zipballFilename, // file to unzip
      '-d', tempPath // directory where to extract files
    ],
    {
      cwd: tempPath,
    }
  );
  if (unzipResult.status !== 0) {
    const tarResult = spawn.sync(
      'tar',
      [
        'zxf', // eXtract Zipped File
        zipballFilename, // file to unzip
        '-C', tempPath // directory where to extract files
      ],
      {
        cwd: tempPath,
      }
    );
    if (tarResult.status !== 0) {
      throw new Error("Failed to unzip the elm-explorations/test repo zipfile");
    }
  }
  fs.renameSync(
    path.join(
      tempPath,
      'test-master'
    ),
    packagePath
  );
  fs.rmSync(zipballPath, { recursive: true, force: true });
}

module.exports = {
  install,
  installUnstableTestMaster,
};
