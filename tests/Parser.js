'use strict';

const assert = require('assert');
const stream = require('stream');
const Parser = require('../lib/Parser');

function test(elmCode, expectedExposedNames) {
  return Parser.extractExposedPossiblyTests('SomeFile.elm', (_, options) => {
    const readable = stream.Readable.from(elmCode, options);
    readable.close = readable.destroy;
    return readable;
  }).then((exposed) => {
    assert.deepStrictEqual(exposed, expectedExposedNames);
  });
}

describe('Parser', () => {
  describe('valid Elm code', () => {
    it('handles a basic module definition', () =>
      test('module Main exposing (one, two)', ['one', 'two']));

    it('handles a module definition with comments', () =>
      test(
        `
module{--}Main {-
    {{-}-}-
-}exposing--{-

 ({--}one{--}
    ,
    -- notExport
  two{-{-{-{--}-}{--}-}{-{--}-}-},Type{--}({--}..{--}){--}
  ,    three
  )--
`,
        ['one', 'two', 'three']
      ));
  });

  // Note: It doesn’t matter much what the actual return array looks like. The
  // important part is that the function doesn’t crash. It’s still nice to get
  // test failures if the output changes, to help evaluate what a change in the
  // parser might cause.
  describe('invalid Elm code', () => {
    it('handles the empty string', () => test('', []));
  });
});
