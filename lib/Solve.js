// @flow

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Project = require('./Project');

let depsProvider = require('./dependency-provider-offline.js');
let wasm = require('elm-solve-deps-wasm');
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

  const dependencies = await getDependencies(ElmJson.getPath(project.rootDir));

  fs.writeFileSync(cacheFile, dependencies);

  return ElmJson.parseDirectAndIndirectDependencies(
    JSON.parse(dependencies),
    'elm-json solve output'
  );
}

async function getDependencies(
  elmJsonPath /*: string */
) /*: Promise<string> */ {
  const elmJsonConfig = fs.readFileSync(elmJsonPath, 'utf8');
  const useTest = true;
  const extra = {
    'elm/core': '1.0.0 <= v < 2.0.0',
    'elm/json': '1.0.0 <= v < 2.0.0',
    'elm/time': '1.0.0 <= v < 2.0.0',
    'elm/random': '1.0.0 <= v < 2.0.0',
  };
  const result = wasm.solve_deps(
    elmJsonConfig,
    useTest,
    extra,
    depsProvider.fetchElmJson,
    depsProvider.listAvailableVersions
  );
  return result;
}

module.exports = {
  getDependenciesCached,
};
