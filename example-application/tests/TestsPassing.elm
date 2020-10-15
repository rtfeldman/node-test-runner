module TestsPassing exposing (..)

import Expect
import Something
import Test exposing (Test, test)


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \() ->
            Something.ultimateAnswer
                |> Expect.equal 42


testTrue : Test
testTrue =
    test "Expect.true works" <|
        \() ->
            True
                |> Expect.true "this should never fail!"


testFalse : Test
testFalse =
    test "Expect.false works" <|
        \() ->
            False
                |> Expect.false "this should never fail!"


{-| This _looks_ like the code that we replace in Generate.js,
but it shouldn’t be touched. It won’t be because the compiled JS
uses a single-line strings with `\n` escapes.

notATest = testTrue

-}
code : String
code =
    """
var $author$project$Test$Runner$Node$check = function (value) {
  return $elm$core$Maybe$Nothing;
};

var $elm_explorations$test$Test$Internal$Batch = function (a) {
  return {$: 'Batch', a: a};
};
"""


testCode : Test
testCode =
    test "Multiline string is changed by mistake" <|
        \() ->
            code
                |> Expect.equal
                    "\nvar $author$project$Test$Runner$Node$check = function (value) {\n  return $elm$core$Maybe$Nothing;\n};\n\nvar $elm_explorations$test$Test$Internal$Batch = function (a) {\n  return {$: 'Batch', a: a};\n};\n"
