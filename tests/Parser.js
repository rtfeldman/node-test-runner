'use strict';

const assert = require('assert');
const stream = require('stream');
const Parser = require('../lib/Parser');

function testParser(elmCode, expectedExposedNames) {
  return Parser.extractExposedPossiblyTests('SomeFile.elm', (_, options) => {
    const readable = stream.Readable.from(elmCode, {
      ...options,
      autoDestroy: true,
    });
    readable.close = readable.destroy;
    return readable;
  }).then((exposed) => {
    assert.deepStrictEqual(exposed, expectedExposedNames);
  });
}

describe('Parser', () => {
  describe('valid Elm code', () => {
    it('handles a basic module definition', () =>
      testParser('module Main exposing (one, two)', ['one', 'two']));

    it('handles unicode', () =>
      testParser('module Main exposing (åäö, Åä, π, ᾀ_5Ϡ)', [
        'åäö',
        'π',
        'ᾀ_5Ϡ',
      ]));

    it('handles a module definition with comments', () =>
      testParser(
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

    it('is not fooled by strings, chars and comments', () =>
      testParser(
        `
module Main exposing ( ..)

one="\\"{-"
two="""-}
notAThing = something
\\"""
notAThing2 = something
"""
three = '"' {- "
notAThing3 = something
-}
four{--}=--{-
    1
five = something
--}

`,
        ['one', 'two', 'three', 'four', 'five']
      ));

    it('is not fooled by imports, ports, types and let-in', () =>
      testParser(
        `
port module Main exposing (..--
        ){-
-}
import Dict exposing (get)

port sendMessage : String -> Cmd msg
port messageReceiver : (String -> msg) -> Sub msg

type alias Model =
    { one : String
    , two : Int }

init flags =
    let
        notATest = 1
    in
    Model "" 0

type User
  = Regular String
  | Visitor String

user
  = Regular "Joe"
`,
        ['user']
      ));
  });

  // Note: It doesn’t matter much what the actual return array looks like. The
  // important part is that the function doesn’t crash. It’s still nice to get
  // test failures if the output changes, to help evaluate what a change in the
  // parser might cause.
  describe('invalid Elm code', () => {
    it('handles the empty string', () => testParser('', []));

    it('handles a malformed module declaration', () =>
      testParser(
        `
module Main

import X exposing (one, two)
`,
        []
      ));

    it('handles lowercase type', () =>
      testParser('module A.BBB.Circle exposing (one, circle (..))', []));

    it('handles uppercase declaration', () =>
      testParser(
        `
module Main exposing (..)

One = 1
`,
        []
      ));

    it('does not treat strings as comments', () =>
      testParser('module "string" Main exposing (one)', []));

    it('treats `effect module` as a critical error', () =>
      testParser(
        'effect module Example where { subscription = MySub } exposing (..)',
        ['should', 'not', 'succeed']
      ).catch((error) => {
        assert.strictEqual(
          error.message,
          'This file is problematic:\n\nSomeFile.elm\n\nIt starts with `effect module`. Effect modules can only exist inside src/ in elm and elm-explorations packages. They cannot contain tests.'
        );
      }));
  });
});
