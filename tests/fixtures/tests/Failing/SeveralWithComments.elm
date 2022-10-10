module Failing.SeveralWithComments exposing (testExpectations, testFailingFuzzTests, {- hello -} testWithoutNums, withoutNums)

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
        [ fuzzWith { runs = 100, distribution = Test.noDistribution } (triple string float string) "adding numbers to strings has no effect" <|
            \( prefix, num, suffix ) ->
                withoutNums (prefix ++ String.fromFloat num ++ suffix)
                    |> Expect.equal (withoutNums (prefix ++ suffix))
        ]


testExpectations : Test
testExpectations =
    describe "basic expectations"
        [ test "this should succeed" <|
            \() ->
                "blah"
                    |> Expect.equal " blah"
        , test "this should fail" <|
            \() ->
                "something"
                    |> Expect.equal "someting else"
        , test "another failure" <|
            \() ->
                "forty-two"
                    |> Expect.equal "forty-three"
        ]


testFailingFuzzTests : Test
testFailingFuzzTests =
    describe "the first element in this fuzz tuple"
        [ fuzz2 string string "is always \"foo\"" <|
            \str1 str2 ->
                str1
                    |> Expect.equal "foo"
        ]
