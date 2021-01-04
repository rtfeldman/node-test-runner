// @flow

const spawn = require('cross-spawn');
const crypto = require('crypto');
const getExecutable = require('elm-tooling/getExecutable');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

void Project;

function sha256(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

// Poor man’s type alias. We can’t use /*:: type OnProgress = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
// `null` is used instead of `void` to make Flow force implementations to
// exhaustively switch on all variants of the parameter.
const OnProgress /*: (
  { tag: 'Download elm-json', percentage: number } | { tag: 'Run elm-json' }
) => null */ = () => null;

async function getDependenciesCached(
  project /*: typeof Project.Project */,
  onProgress /*: typeof OnProgress */
) /*: Promise<typeof ElmJson.DirectAndIndirectDependencies> */ {
  const hash = sha256(
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

  const dependencies = await getDependencies(
    ElmJson.getPath(project.rootDir),
    onProgress
  );

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'elm-json solve output'
  );
}

async function getDependencies(
  elmJsonPath /*: string */,
  onProgress /*: typeof OnProgress */
) /*: Promise<string> */ {
  const toolAbsolutePath = await getExecutable({
    name: 'elm-json',
    version: '^0.2.8',
    onProgress: (percentage) =>
      onProgress({ tag: 'Download elm-json', percentage }),
  });
  onProgress({ tag: 'Run elm-json' });
  const result = spawn.sync(
    toolAbsolutePath,
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

module.exports = {
  OnProgress,
  getDependenciesCached,
};
