// @flow

const spawn = require('cross-spawn');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(
        `Ignoring bad dependencies cache file:\n\n${error.message}\n\nPlease report this issue: https://github.com/rtfeldman/node-test-runner/issues/new`
      );
    }
  }

  const dependencies = getDependencies(elmJsonPath);

  fs.writeFileSync(cacheFile, dependencies);

  return JSON.parse(dependencies);
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
      encoding: 'utf8',
    }
  );

  if (result.status != 0) {
    throw new Error(`Failed to run \`elm-json solve\`:\n${result.stderr}`);
  }

  return result.stdout;
}

module.exports = { getDependenciesCached };
