const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');

/**
 * @param { string } string
 * @returns { string }
 */
function sha256(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

/**
 * @param { import('./DependencyProvider').DependencyProviderType } dependencyProvider
 * @param { import('./DependencyProvider').PackageStrategy } packageStrategy
 * @param { import('./Project').Project } project
 * @param { boolean } offline
 * @param { () => void } onBeforeSolve
 * @returns { import('./ElmJson').DirectAndIndirectDependencies }
 */
function getDependenciesCached(
  dependencyProvider,
  packageStrategy,
  project,
  offline,
  onBeforeSolve
) {
  const hash = sha256(
    JSON.stringify({
      packageStrategy:
        project.elmJson.type === 'package' ? packageStrategy : undefined,
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

  onBeforeSolve();

  const dependencies = getDependencies(
    dependencyProvider,
    packageStrategy,
    project.elmJson,
    offline
  );

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'cached solved dependencies'
  );
}

/**
 * @param { import('./DependencyProvider').DependencyProviderType } dependencyProvider
 * @param { import('./DependencyProvider').PackageStrategy } packageStrategy
 * @param { import('./ElmJson').ElmJson } elmJson
 * @param { boolean } offline
 * @returns { string }
 */
function getDependencies(
  dependencyProvider,
  packageStrategy,
  elmJson,
  offline
) {
  const useTest = true;
  // Note: These are the dependencies listed in `elm/elm.json`, except
  // `elm-explorations/test`. `elm/elm.json` is only used during development of
  // this CLI (for editor integrations and unit tests). When running `elm-test`
  // we add the `elm/` folder in the npm package as a source directory. The
  // dependencies listed here and the ones in `elm/elm.json` need to be in sync.
  const extra = {
    'elm/core': '1.0.0 <= v < 2.0.0',
    'elm/json': '1.0.0 <= v < 2.0.0',
    'elm/time': '1.0.0 <= v < 2.0.0',
    'elm/random': '1.0.0 <= v < 2.0.0',
  };
  try {
    return dependencyProvider.solveOffline(
      elmJson,
      useTest,
      extra,
      packageStrategy
    );
  } catch (error) {
    if (offline) {
      throw error;
    }
    return dependencyProvider.solveOnline(
      elmJson,
      useTest,
      extra,
      packageStrategy
    );
  }
}

module.exports = {
  getDependenciesCached: getDependenciesCached,
};
