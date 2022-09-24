module Nested.Module.Test exposing (..)

import Char
import Expect
import Fuzz exposing (..)
import String
import Test exposing (..)


withoutNums : String -> String
withoutNums =
    String.filter (\ch -> not (Char.isDigit ch || ch == '.'))


testWithoutNums : Test
testWithoutNums =
    describe "withoutNums"
        [ fuzzWith { runs = 100, coverage = Test.noCoverage } (triple string int string) "adding numbers to strings has no effect" <|
            \( prefix, num, suffix ) ->
                withoutNums (prefix ++ String.fromInt num ++ suffix)
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
    test "Expect.equal True works" <|
        \() ->
            True
                |> Expect.equal True
                |> Expect.onFail "this should never fail!"
