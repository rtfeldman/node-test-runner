'use strict';

const assert = require('assert');
const path = require('path');
const glob = require('glob');
const spawn = require('cross-spawn');

const { spawnOpts } = require('./util');

function execElmJson(args, cwd) {
  return spawn.sync(
    'elm-json',
    args,
    Object.assign({ encoding: 'utf-8', cwd: cwd }, spawnOpts)
  );
}

function execElm(args, cwd) {
  return spawn.sync(
    'elm',
    args,
    Object.assign({ encoding: 'utf-8', cwd: cwd }, spawnOpts)
  );
}

describe('examples quality', () => {
  describe('Each example has valid json', () => {
    let examples = glob.sync(path.join(__dirname, '..', 'example*'));

    for (const example of examples) {
      it(`${path.basename(example)}`, () => {
        assert.strictEqual(execElmJson(['tree'], example).status, 0);
        if (require(path.join(example, 'elm.json')).type === 'package') {
          assert.strictEqual(execElm(['make'], example).status, 0);
        }
      });
    }
  });
});
