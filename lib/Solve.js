// @flow

const spawn = require('cross-spawn');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

void Project;

function sha1(string) {
  return crypto.createHash('sha1').update(string).digest('hex');
}

function getDependenciesCached(
  project /*: typeof Project.Project */
) /*: typeof ElmJson.DirectAndIndirectDependencies */ {
  const hash = sha1(
    JSON.stringify({
      dependencies: project.elmJson.dependencies,
      'test-dependencies': project.elmJson['test-dependencies'],
    })
  );

  const cacheFile = path.join(
    project.generatedCodeDir,
    `dependencies.${hash}.json`
  );

  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(
        `Ignoring bad dependencies cache file:\n\n${error.message}\n\nPlease report this issue: https://github.com/rtfeldman/node-test-runner/issues/new`
      );
    }
  }

  const dependencies = getDependencies(ElmJson.getPath(project.rootDir));

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'elm-json solve output'
  );
}

function getDependencies(elmJsonPath /*: string */) /*: string */ {
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
