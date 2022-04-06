// @flow

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');
const DependencyProvider = require('./DependencyProvider.js');

// These value are used _only_ in flow types. 'use' them with the javascript
// void operator to keep eslint happy.
void Project;
void DependencyProvider;

function sha256(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

function getDependenciesCached(
  dependencyProvider /*: DependencyProvider */,
  project /*: typeof Project.Project */
) /*: typeof ElmJson.DirectAndIndirectDependencies */ {
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

  const dependencies = getDependencies(dependencyProvider, project.elmJson);

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'cached solved dependencies'
  );
}

function getDependencies(
  dependencyProvider /*: DependencyProvider */,
  elmJson /*: typeof ElmJson.ElmJson */
) /*: string */ {
  const useTest = true;
  const extra = {
    'elm/core': '1.0.0 <= v < 2.0.0',
    'elm/json': '1.0.0 <= v < 2.0.0',
    'elm/time': '1.0.0 <= v < 2.0.0',
    'elm/random': '1.0.0 <= v < 2.0.0',
  };
  const elmJsonStr = JSON.stringify(elmJson);
  try {
    return dependencyProvider.solveOffline(elmJsonStr, useTest, extra);
  } catch (_) {
    return dependencyProvider.solveOnline(elmJsonStr, useTest, extra);
  }
}

module.exports = {
  getDependenciesCached,
};
