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

  const direct = {};
  const indirect = {};

  const items = [
    [true, projectElmJson.dependencies.direct],
    [true, projectElmJson['test-dependencies'].direct],
    [false, projectElmJson.dependencies.indirect],
    [false, projectElmJson['test-dependencies'].indirect],
  ];

  for (const [isDirect, dependencies] of items) {
    for (const [key, value] of Object.entries(dependencies)) {
      if (direct.hasOwnProperty(key) || indirect.hasOwnProperty(key)) {
        // Let elm-json handle things if the same dependency appears more than
        // once in the 4 different dependencies objects.
        return undefined;
      } else {
        // elm-json is going to promote the packages that the runner depends on
        // from indirect to direct dependencies if needed, so we do it here too.
        // In both cases, if the user has a module named `Random` (for example)
        // the test application won’t compile.
        if (isDirect || extraPackages.includes(key)) {
          direct[key] = value;
        } else {
          indirect[key] = value;
        }
      }
    }
  }

  return { direct, indirect };
}

module.exports = { getDependencies };
