// @flow

const fs = require('fs');
const path = require('path');

// Poor man’s type alias. We can’t use /*:: type Dependencies = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
const Dependencies /*: { [string]: string } */ = {};

const DirectAndIndirectDependencies /*: {
  direct: typeof Dependencies,
  indirect: typeof Dependencies,
} */ = { direct: {}, indirect: {} };

const ElmJson /*:
  | {
      type: 'application',
      'source-directories': Array<string>,
      dependencies: typeof DirectAndIndirectDependencies,
      'test-dependencies': typeof DirectAndIndirectDependencies,
      [string]: mixed,
    }
  | {
      type: 'package',
      dependencies: typeof Dependencies,
      'test-dependencies': typeof Dependencies,
      [string]: mixed,
    } */ = {
  type: 'package',
  dependencies: Dependencies,
  'test-dependencies': Dependencies,
};

function getPath(dir /*: string */) /*: string */ {
  return path.join(dir, 'elm.json');
}

function write(dir /*: string */, elmJson /*: typeof ElmJson */) /*: void */ {
  const elmJsonPath = getPath(dir);

  try {
    fs.writeFileSync(elmJsonPath, JSON.stringify(elmJson, null, 4) + '\n');
  } catch (error) {
    throw new Error(
      `${elmJsonPath}\nFailed to write elm.json:\n${error.message}`
    );
  }
}

function read(dir /*: string */) /*: typeof ElmJson */ {
  const elmJsonPath = getPath(dir);

  try {
    return readHelper(elmJsonPath);
  } catch (error) {
    throw new Error(
      `${elmJsonPath}\nFailed to read elm.json:\n${error.message}`
    );
  }
}

function readHelper(elmJsonPath /*: string */) /*: typeof ElmJson */ {
  const json = parseObject(
    JSON.parse(fs.readFileSync(elmJsonPath, 'utf8')),
    'the file'
  );

  switch (json.type) {
    case 'application':
      return {
        ...json,
        type: 'application',
        'source-directories': parseSourceDirectories(
          json['source-directories']
        ),
        dependencies: parseDirectAndIndirectDependencies(
          json.dependencies,
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
        dependencies: parseDependencies(json.dependencies, 'dependencies'),
        'test-dependencies': parseDependencies(
          json['test-dependencies'],
          'test-dependencies'
        ),
      };

    default:
      throw new Error(
        `Expected "type" to be "application" or "package", but got: ${stringify(
          json.type
        )}`
      );
  }
}

function parseSourceDirectories(json /*: mixed */) /*: Array<string> */ {
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

function parseDirectAndIndirectDependencies(
  json /*: mixed */,
  what /*: string */
) /*: typeof DirectAndIndirectDependencies */ {
  const jsonObject = parseObject(json, what);
  return {
    direct: parseDependencies(jsonObject.direct, `${what}->"direct"`),
    indirect: parseDependencies(jsonObject.indirect, `${what}->"indirect"`),
  };
}

function parseDependencies(
  json /*: mixed */,
  what /*: string */
) /*: typeof Dependencies */ {
  const jsonObject = parseObject(json, what);
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

function parseObject(
  json /*: mixed */,
  what /*: string */
) /*: { +[string]: mixed } */ {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(
      `Expected ${what} to be an object, but got: ${stringify(json)}`
    );
  }
  return json;
}

function stringify(json /*: mixed */) /*: string */ {
  const maybeString = JSON.stringify(json);
  return maybeString === undefined ? 'undefined' : maybeString;
}

module.exports = {
  Dependencies,
  DirectAndIndirectDependencies,
  ElmJson,
  getPath,
  parseDirectAndIndirectDependencies,
  read,
  write,
};
