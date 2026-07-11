const fs = require('fs');
const path = require('path');

/**
 * @typedef { Record<string, string> } Dependencies
 *
 * @typedef { {
    direct: Dependencies,
    indirect: Dependencies,
  } } DirectAndIndirectDependencies
 *
 * @typedef {
  | {
      type: 'application',
      'source-directories': Array<string>,
      dependencies: DirectAndIndirectDependencies,
      'test-dependencies': DirectAndIndirectDependencies,
      [key: string]: unknown,
    }
  | {
      type: 'package',
      dependencies: Dependencies,
      'test-dependencies': Dependencies,
      [key: string]: unknown,
    }
  } ElmJson
 */

/**
 * @param { string } dir
 * @returns { string }
 */
function getPath(dir) {
  return path.join(dir, 'elm.json');
}

/**
 * @param { string } dir
 * @param { ElmJson } elmJson
 * @returns { void }
 */
function write(dir, elmJson) {
  const elmJsonPath = getPath(dir);

  try {
    fs.writeFileSync(elmJsonPath, JSON.stringify(elmJson, null, 4) + '\n');
  } catch (error) {
    throw new Error(
      `${elmJsonPath}\nFailed to write elm.json:\n${error.message}`
    );
  }
}

/**
 * @param { string } dir
 * @returns { ElmJson }
 */
function read(dir) {
  const elmJsonPath = getPath(dir);

  try {
    return readHelper(elmJsonPath);
  } catch (error) {
    throw new Error(
      `${elmJsonPath}\nFailed to read elm.json:\n${error.message}`
    );
  }
}

/**
 * @param { string } elmJsonPath
 * @returns { ElmJson }
 */
function readHelper(elmJsonPath) {
  const json = parseObject(
    JSON.parse(fs.readFileSync(elmJsonPath, 'utf8')),
    'the file'
  );

  switch (json['type']) {
    case 'application':
      return {
        ...json,
        type: 'application',
        'source-directories': parseSourceDirectories(
          json['source-directories']
        ),
        dependencies: parseDirectAndIndirectDependencies(
          json['dependencies'],
          'dependencies'
        ),
        'test-dependencies': parseDirectAndIndirectDependencies(
          json['test-dependencies'],
          'test-dependencies'
        ),
      };

    case 'package':
      return {
        ...json,
        type: 'package',
        dependencies: parseDependencies(json['dependencies'], 'dependencies'),
        'test-dependencies': parseDependencies(
          json['test-dependencies'],
          'test-dependencies'
        ),
      };

    default:
      throw new Error(
        `Expected "type" to be "application" or "package", but got: ${stringify(
          json['type']
        )}`
      );
  }
}

/**
 * @param { unknown } json
 * @returns { Array<string> }
 */
function parseSourceDirectories(json) {
  if (!Array.isArray(json)) {
    throw new Error(
      `Expected "source-directories" to be an array, but got: ${stringify(
        json
      )}`
    );
  }

  const result = [];

  for (const [index, item] of json.entries()) {
    if (typeof item !== 'string') {
      throw new Error(
        `Expected "source-directories"->${index} to be a string, but got: ${stringify(
          item
        )}`
      );
    }
    result.push(item);
  }

  if (result.length === 0) {
    throw new Error(
      'Expected "source-directories" to contain at least one item, but it is empty.'
    );
  }

  return result;
}

/**
 * @param { unknown } json
 * @param { string } what
 * @returns { DirectAndIndirectDependencies }
 */
function parseDirectAndIndirectDependencies(json, what) {
  const jsonObject = parseObject(json, what);
  return {
    direct: parseDependencies(jsonObject['direct'], `${what}->"direct"`),
    indirect: parseDependencies(jsonObject['indirect'], `${what}->"indirect"`),
  };
}

/**
 * @param { unknown } json
 * @param { string } what
 * @returns { Dependencies }
 */
function parseDependencies(json, what) {
  const jsonObject = parseObject(json, what);
  /** @type { Dependencies } */
  const result = {};

  for (const [key, value] of Object.entries(jsonObject)) {
    if (typeof value !== 'string') {
      throw new Error(
        `Expected ${what}->${stringify(
          key
        )} to be a string, but got: ${stringify(value)}`
      );
    }
    result[key] = value;
  }

  return result;
}

/**
 * @param { unknown } json
 * @param { string } what
 * @returns { Record<string, unknown> }
 */
function parseObject(json, what) {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(
      `Expected ${what} to be an object, but got: ${stringify(json)}`
    );
  }
  return /** @type { Record<string, unknown> } */ (json);
}

/**
 * @param { unknown } json
 * @returns { string }
 */
function stringify(json) {
  const maybeString = JSON.stringify(json);
  return maybeString === undefined ? 'undefined' : maybeString;
}

const ELM_TEST_PACKAGE = 'elm-explorations/test';

/**
 * @param { string } dir
 * @param { ElmJson } elmJson
 * @returns { void }
 */
function requireElmTestPackage(dir, elmJson) {
  const elmJsonPath = getPath(dir);
  const versionOrRange = getElmExplorationsTestPackageVersionOrRange(elmJson);

  if (versionOrRange === undefined) {
    throw new Error(
      `${elmJsonPath}\nYou must have "${ELM_TEST_PACKAGE}" in your "test-dependencies" or "dependencies" to run elm-test.`
    );
  } else if (!versionOrRange.trimStart().startsWith('2.')) {
    throw new Error(
      `${elmJsonPath}\nThis version of elm-test only supports ${ELM_TEST_PACKAGE} 2.x, but you have ${stringify(
        versionOrRange
      )}.`
    );
  }
}

/**
 * @param { ElmJson } elmJson
 * @returns { string | undefined }
 */
function getElmExplorationsTestPackageVersionOrRange(elmJson) {
  switch (elmJson.type) {
    case 'application':
      return (
        elmJson['test-dependencies'].direct[ELM_TEST_PACKAGE] ||
        elmJson.dependencies.direct[ELM_TEST_PACKAGE]
      );
    case 'package':
      return (
        elmJson['test-dependencies'][ELM_TEST_PACKAGE] ||
        elmJson.dependencies[ELM_TEST_PACKAGE]
      );
  }
}

module.exports = {
  ELM_TEST_PACKAGE,
  getPath,
  parseDirectAndIndirectDependencies,
  read,
  requireElmTestPackage,
  write,
};
