module Passing.TrickyMultilines exposing (..)

import Expect
import Test exposing (Test, test)


{-| This _looks_ like the code that we replace in Generate.js,
but it shouldn’t be touched. It won’t be because the compiled JS
uses a single-line strings with `\n` escapes.

notATest = testTrue

-}
code : String
code =
    """
var $author$project$Test$Runner$Node$check = function (value) {
  return _Debug_todo(
    'Test.Runner.Node',
    {
      start: {line: 320, column: 5},
      end: {line: 320, column: 15}
    })('Long\\nmessage');
};

var $elm_explorations$test$Test$Internal$Batch = function (a) {
  return {$: 'Batch', a: a};
};
"""


testCode : Test
testCode =
    test "Multiline string is not changed by mistake" <|
        \() ->
            code
                |> Expect.equal
                    "\nvar $author$project$Test$Runner$Node$check = function (value) {\n  return _Debug_todo(\n    'Test.Runner.Node',\n    {\n      start: {line: 320, column: 5},\n      end: {line: 320, column: 15}\n    })('Long\\nmessage');\n};\n\nvar $elm_explorations$test$Test$Internal$Batch = function (a) {\n  return {$: 'Batch', a: a};\n};\n"
