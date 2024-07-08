'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ElmJson = require('../lib/ElmJson');
const { fixturesDir } = require('./util');

const invalidElmJsonContainerDir = path.join(fixturesDir, 'invalid-elm-json');

const invalidElmJsonDirs = [
  'application-with-package-style-test-dependencies',
  'dependency-not-string',
  'elm-test-package-too-old-application',
  'elm-test-package-too-old-package',
  'empty-source-directories',
  'is-folder',
  'is-null',
  'json-syntax-error',
  'missing-elm-test-package',
  'null-type',
  'package-with-application-style-dependencies',
  'source-directories-not-array',
  'source-directory-not-string',
  'unknown-type',
];

describe('handling invalid elm.json', () => {
  it('Should run every directory in invalid-elm-json/', () => {
    const filesFound = fs.readdirSync(invalidElmJsonContainerDir).sort();
    assert.deepStrictEqual(filesFound, invalidElmJsonDirs);
  });

  for (const dir of invalidElmJsonDirs) {
    it(`Should handle error for: ${dir}`, () => {
      const fullPath = path.join(invalidElmJsonContainerDir, dir);
      const expected = fs
        .readFileSync(path.join(fullPath, 'expected.txt'), 'utf8')
        .trim()
        .replace('/full/path/to/elm.json', path.join(fullPath, 'elm.json'))
        .replace(/\r\n/g, '\n');
      assert.throws(
        () => {
          const elmJson = ElmJson.read(fullPath);
          ElmJson.requireElmTestPackage(fullPath, elmJson);
        },
        (error) => {
          assert.strictEqual(
            error.message.replace(
              // Handle slightly different JSON.parse error messages on different Node.js versions.
              /^.+ in JSON at position .+$/gm,
              '(the JSON parse error)'
            ),
            expected
          );
          return true;
        }
      );
    });
  }
});

// Note:
// - The fields should be in the same order as the input file.
// - The changed fields should be updated.
// - The non-standard fields should be preserved.
// - The file should use 4 spaces of indentation.
const expectedWrittenElmJson = `{
    "nonStandardFieldStart": 1,
    "type": "application",
    "source-directories": [
        "other/directory"
    ],
    "elm-version": "0.19.0",
    "dependencies": {
        "direct": {
            "elm/core": "1.0.0"
        },
        "indirect": {}
    },
    "nonStandardFieldMiddle": [
        1,
        2,
        3
    ],
    "test-dependencies": {
        "direct": {
            "elm/regex": "1.0.0",
            "elm-explorations/test": "2.0.0"
        },
        "indirect": {
            "elm/html": "1.0.0",
            "elm/virtual-dom": "1.0.2"
        }
    },
    "nonStandardFieldEnd": {
        "a": 1,
        "b": 2
    }
}
`;

describe('Writing an elm.json', () => {
  it('Should have a correct output', () => {
    const dir = path.join(fixturesDir, 'write-elm-json');
    fs.copyFileSync(
      path.join(dir, 'elm.input.json'),
      path.join(dir, 'elm.json')
    );
    const elmJson = ElmJson.read(dir);
    const newElmJson = {
      ...elmJson,
      'elm-version': '0.19.0',
      'source-directories': ['other/directory'],
    };
    ElmJson.write(dir, newElmJson);
    const actual = fs.readFileSync(path.join(dir, 'elm.json'), 'utf8');
    assert.strictEqual(actual, expectedWrittenElmJson);
    assert(actual.endsWith('\n'), 'elm.json should end with a newline');
  });
});
