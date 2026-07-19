'use strict';

const assert = require('assert');
const path = require('path');
const { globSync } = require('tinyglobby');
const Spawn = require('../lib/Spawn');

const { spawnOpts } = require('./util');

/**
 * @param { Array<string> } args
 * @param { string } cwd
 * @returns { import('child_process').SpawnSyncReturns<string> }
 */
function execElmJson(args, cwd) {
  return Spawn.spawnSync(
    'elm-json',
    args,
    Object.assign(
      /** @type { const } */ ({ encoding: 'utf-8', cwd: cwd }),
      spawnOpts
    )
  );
}

/**
 * @param { Array<string> } args
 * @param { string } cwd
 * @returns { import('child_process').SpawnSyncReturns<string> }
 */
function execElm(args, cwd) {
  return Spawn.spawnSync(
    'elm',
    args,
    Object.assign(
      /** @type { const } */ ({ encoding: 'utf-8', cwd: cwd }),
      spawnOpts
    )
  );
}

let examples = globSync(path.join(__dirname, '..', 'example*'));

describe('examples quality', () => {
  describe('Each example has valid json', () => {
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
