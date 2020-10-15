// @flow

const spawn = require('cross-spawn');

const extraPackages = ['elm/core', 'elm/json', 'elm/time', 'elm/random'];

function getDependencies(
  pathToElmJson /*: string */,
  projectElmJson /*: any */
) /*: { direct: { [string]: string }, indirect: { [string]: string } } */ {
  // If possible, use a simple and fast merge of all dependencies in elm.json,
  // otherwise use elm-json. At the time of writing, this could save 1 second in
  // an application project.
  const simpleMerge = trySimpleMerge(projectElmJson);
  if (simpleMerge !== undefined) {
    return simpleMerge;
  }

  var result = spawn.sync(
    'elm-json',
    ['solve', '--test', '--extra', ...extraPackages, '--', pathToElmJson],
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

function trySimpleMerge(projectElmJson) {
  if (projectElmJson.type !== 'application') {
    return undefined;
  }

  const direct = mergeIfUnique([
    projectElmJson.dependencies.direct,
    projectElmJson['test-dependencies'].direct,
  ]);

  const indirect = mergeIfUnique([
    projectElmJson.dependencies.indirect,
    projectElmJson['test-dependencies'].indirect,
  ]);

  return direct === undefined || indirect === undefined
    ? undefined
    : extraPackages.every((name) => direct.hasOwnProperty(name))
    ? { direct, indirect }
    : undefined;
}

function mergeIfUnique/*:: <T> */(
  objects /*: Array<{ [string]: T }> */
) /*: { [string]: T } | void */ {
  const result = {};

  for (const object of objects) {
    for (const [key, value] of Object.entries(object)) {
      if (result.hasOwnProperty(key)) {
        return undefined;
      }
      result[key] = value;
    }
  }

  return result;
}

module.exports = { getDependencies };
