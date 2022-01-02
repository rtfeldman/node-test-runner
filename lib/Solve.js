// @flow

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

const DependencyProvider = require('./DependencyProvider.js');
const wasm = require('elm-solve-deps-wasm');
wasm.init();

void Project;

function sha256(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

async function getDependenciesCached(
  project /*: typeof Project.Project */
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

  const dependencies = await getDependencies(project.elmJson);

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'elm-json solve output'
  );
}

async function getDependencies(
  elmJson /*: typeof ElmJson.ElmJson */
) /*: Promise<string> */ {
  const useTest = true;
  const extra = {
    'elm/core': '1.0.0 <= v < 2.0.0',
    'elm/json': '1.0.0 <= v < 2.0.0',
    'elm/time': '1.0.0 <= v < 2.0.0',
    'elm/random': '1.0.0 <= v < 2.0.0',
  };
  let solution;
  try {
    DependencyProvider.clearListVersionsMemoCacheBeforeSolve();
    solution = wasm.solve_deps(
      JSON.stringify(elmJson),
      useTest,
      extra,
      DependencyProvider.fetchElmJsonOffline,
      DependencyProvider.listAvailableVersionsOffline
    );
  } catch (_) {
    console.log('Offline solver failed, switching to online');
    // Update the online cache of existing versions.
    DependencyProvider.updateOnlineVersionsCache();
    console.log('updateOnlineVersionsCache ok');
    DependencyProvider.clearListVersionsMemoCacheBeforeSolve();
    // Solve again, in online mode.
    solution = wasm.solve_deps(
      JSON.stringify(elmJson),
      useTest,
      extra,
      DependencyProvider.fetchElmJsonOnline,
      DependencyProvider.listAvailableVersionsOnline
    );
  }
  return solution;
}

module.exports = {
  getDependenciesCached,
};
