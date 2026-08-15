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
  /** @type { string | undefined } */
  let cacheFile = undefined;

  // For packages, in offline mode we get _some_ version
  // that happened to be available offline and happened to
  // be newest or oldest at the time. So we can’t cache that
  // result. An online run between two offline runs can alter
  // what the second offline run results in.
  if (!(project.elmJson.type === 'package' && offline)) {
    const hash = sha256(
      JSON.stringify({
        // For packages, when we want the newest version available
        // for each dependency’s range, we in theory can’t cache
        // anything and must look for potential new versions on the
        // package site at every build. But when running the tests
        // a hundred times to fix a bug, that is a waste of time
        // and server resources. We therefore do the same thing as
        // the Elm compiler itself: We _do_ cache, and use the mtime
        // of elm.json in the cache key. That is not perfect, but it
        // is what the compiler does, so we following along.
        mtime:
          project.elmJson.type === 'package' && packageStrategy === 'newest'
            ? project.elmJsonMtime
            : undefined,
        dependencies: project.elmJson.dependencies,
        'test-dependencies': project.elmJson['test-dependencies'],
      })
    );

    cacheFile = path.join(
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
  }

  onBeforeSolve();

  const dependencies = getDependencies(
    dependencyProvider,
    packageStrategy,
    project.elmJson,
    offline
  );

  if (cacheFile !== undefined) {
    fs.writeFileSync(cacheFile, dependencies);
  }

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
  // Applications have exact versions for all dependencies. If we find a solution
  // using local information, that is THE solution and there is no need to ask the
  // package site for anything.
  // Packages, on the other hand, have _ranges_ for their dependencies. We can still
  // find a solution using only local information, but we can’t know that it is the
  // oldest or newest version out of all versions on the package site – only out of
  // the versions available offline. So for packages we need to ask the package server
  // about things _before_ trying to solve anything.
  if (elmJson.type === 'package' && !offline) {
    dependencyProvider.cache.update();
  }

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
    return dependencyProvider.solve(
      /* offline */ true,
      elmJson,
      useTest,
      extra,
      packageStrategy
    );
  } catch (error) {
    if (offline) {
      throw error;
    }

    // As mentioned above, for applications we only need to ask the package server
    // for information if the local information wasn’t enough.
    if (elmJson.type === 'application') {
      dependencyProvider.cache.update();
    }

    return dependencyProvider.solve(
      /* offline */ false,
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
