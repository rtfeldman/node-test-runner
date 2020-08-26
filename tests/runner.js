'use strict';

const Runner = require('../lib/Runner.js');
const assert = require('assert');
const path = require('path');

// TODO: remove this when we drop node 8 support
function assertThrowsAsync(fn, regExp) {
  return fn()
    .then(
      () => () => {},
      (e) => () => {
        throw e;
      }
    )
    .then((f) => assert.throws(f, regExp));
}

describe('Runner', () => {
  describe('getFirstLine', () => {
    it('gets first line of this file', () =>
      Runner.getFirstLine(__filename).then((fl) =>
        assert.strictEqual(fl, "'use strict';")
      ));

    it('gets first line of a dummy file', () =>
      Runner.getFirstLine(
        path.join(__dirname, 'fixtures', 'dummy.txt')
      ).then((fl) => assert.strictEqual(fl, 'DUMMY')));

    it('gets first empty line of a dummy file', () =>
      Runner.getFirstLine(
        path.join(__dirname, 'fixtures', 'empty-line.txt')
      ).then((fl) => assert.strictEqual(fl, '')));

    it('fails on an empty file', () => {
      const p = path.join(__dirname, 'fixtures', 'empty');
      return assertThrowsAsync(
        () => Runner.getFirstLine(p),
        `File ${p} is empty`
      );
    });

    it('fails a non existant file', () => {
      const p = path.join(__dirname, 'fixtures', 'must-never-exist');
      return assertThrowsAsync(
        () => Runner.getFirstLine(p),
        `ENOENT: no such file or directory`
      );
    });
  });
});
