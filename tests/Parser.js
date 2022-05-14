'use strict';

const assert = require('assert');
const stream = require('stream');
const Parser = require('../lib/Parser');

async function testParser(elmCode, expectedExposedNames) {
  const exposed = await Parser.extractExposedPossiblyTests(
    'SomeFile.elm',
    (_, options) => {
      const readable = stream.Readable.from([elmCode], {
        ...options,
        autoDestroy: true,
      });
      readable.close = readable.destroy;
      return readable;
    }
  );
  assert.deepStrictEqual(exposed, expectedExposedNames);
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

    it('handles escapes in string literals and char literals', () =>
      testParser(
        `
module Main exposing ( ..)

string = "\\n\\r\\t\\"\\'\\\\\\u{00A0}"

chars = [ '\\n', '\\r', '\\t', '\\"', '\\'', '\\\\', '\\u{00A0}' ]

test = something
--}

`,
        ['string', 'chars', 'test']
      ));

    it('handles tokens that look like the start of some other token at the end of a line', () =>
      testParser(
        `
module Main exposing (..)

testFuzz : Test
testFuzz =
    fuzz2 string string "empty list etc" <|
        \name punctuation ->
            oxfordify "This sentence is empty" "." []
                |> Expect.equal ""
                |> Expect.onFail "given an empty list, did not return an empty string"
testRecord =
    helper
        {
        }
testSubtraction =
    helper2 <|
        2 -
        1
`,
        ['testFuzz', 'testRecord', 'testSubtraction']
      ));

    it('handles a module definition with CRLF', () =>
      testParser(
        `module Main exposing
    (one
    , two
    )
`.replace(/\n/g, '\r\n'),
        ['one', 'two']
      ));

    it('handles finds test in a file with `exposing (..)` and CRLF', () =>
      testParser(
        `module Main exposing (..)

import Test exposing (Test, test)

one =
    test "one" something

two : Test
two =
    test "two" somethingElse
`.replace(/\n/g, '\r\n'),
        ['one', 'two']
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
      assert.rejects(
        testParser(
          'effect module Example where { subscription = MySub } exposing (..)',
          ['should', 'not', 'succeed']
        ),
        {
          message:
            'This file is problematic:\n\nSomeFile.elm\n\nIt starts with `effect module`. Effect modules can only exist inside src/ in elm and elm-explorations packages. They cannot contain tests.',
        }
      ));
  });
});
