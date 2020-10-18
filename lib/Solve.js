// @flow

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const spawn = require('cross-spawn');

function sha1(string) {
  return crypto.createHash('sha1').update(string).digest('hex');
}

function getDependenciesCached(
  generatedCodeDir /*: string */,
  elmJsonPath /*: string */,
  projectElmJson /*: any */
) /*: { direct: { [string]: string }, indirect: { [string]: string } } */ {
  const hash = sha1(
    JSON.stringify({
      dependencies: projectElmJson.dependencies,
      'test-dependencies': projectElmJson['test-dependencies'],
    })
  );

  const cacheFile = path.join(generatedCodeDir, `dependencies.${hash}.json`);

  try {
    return fs.readJsonSync(cacheFile);
  } catch (_error) {
    // Cache file does not exist or is malformed. Move on.
  }

  const dependencies = getDependencies(elmJsonPath);

  fs.writeFileSync(cacheFile, JSON.stringify(dependencies));

  return dependencies;
}

function getDependencies(elmJsonPath) {
  var result = spawn.sync(
    'elm-json',
    [
      'solve',
      '--test',
      '--extra',
      'elm/core',
      'elm/json',
      'elm/time',
      'elm/random',
      '--',
      elmJsonPath,
    ],
    {
      silent: true,
      env: process.env,
    }
  );

  if (result.status != 0) {
    console.error(result.stderr.toString());
    process.exit(1);
  }

  return JSON.parse(result.stdout.toString());
}

module.exports = { getDependenciesCached };
