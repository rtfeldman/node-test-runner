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
var $author$project$Test$Runner$Node$check = $author$project$Test$Runner$Node$checkHelperReplaceMe___;

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
                    "\nvar $author$project$Test$Runner$Node$check = $author$project$Test$Runner$Node$checkHelperReplaceMe___;\n\nvar $elm_explorations$test$Test$Internal$Batch = function (a) {\n  return {$: 'Batch', a: a};\n};\n"
