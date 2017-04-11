module Nested.Module.Test exposing (..)

import String
import Expect
import Test exposing (..)
import Fuzz exposing (..)
import Char


withoutNums : String -> String
withoutNums =
    String.filter (\ch -> not (Char.isDigit ch || ch == '.'))


testWithoutNums : Test
testWithoutNums =
    describe "withoutNums"
        [ fuzzWith { runs = 100 } (tuple3 ( string, int, string )) "adding numbers to strings has no effect" <|
            \( prefix, num, suffix ) ->
                withoutNums (prefix ++ toString num ++ suffix)
                    |> Expect.equal (withoutNums (prefix ++ suffix))
        ]


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \() ->
            42
                |> Expect.equal 42


testTrue : Test
testTrue =
    test "Expect.true works" <|
        \() ->
            True
                |> Expect.true "this should never fail!"
