module Failing.Fuzz exposing (..)

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
        [ fuzzWith "adding numbers to strings has no effect" { runs = 100, distribution = Test.noDistribution } (triple string float string) <|
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


oxfordify : a -> b -> c -> String
oxfordify _ _ _ =
    "Alice, Bob, and Claire"


testFuzz : Test
testFuzz =
    describe "fuzzing"
        [ fuzz2 "empty list etc" string string <|
            \name punctuation ->
                oxfordify "This sentence is empty" "." []
                    |> Expect.equal ""
                    |> Expect.onFail "given an empty list, did not return an empty string"
        , fuzz2 "further testing" string string <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item" ]
                    |> Expect.equal "This sentence contains one item."
        , fuzz2 "custom onFail here" string string <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item", "two item" ]
                    |> Expect.equal "This sentence contains one item and two item."
                    |> Expect.onFail "given an empty list, did not return an empty string"
        , fuzz2 "This is a test." string string <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item", "two item", "three item" ]
                    |> Expect.equal "This sentence contains one item, two item, and three item."
                    |> Expect.onFail "given a list of length 3, did not return an oxford-style sentence"
        ]


testFailingFuzzTests : Test
testFailingFuzzTests =
    describe "the first element in this fuzz tuple"
        [ fuzz2 "is always \"foo\"" string string <|
            \str1 str2 ->
                str1
                    |> Expect.equal "foo"
        ]


testOxfordify : Test
testOxfordify =
    describe "oxfordify"
        [ describe "given an empty sentence"
            [ test "returns an empty string" <|
                \() ->
                    oxfordify "This sentence is empty" "." []
                        |> Expect.equal ""
            ]
        , describe "given a sentence with one item"
            [ test "still contains one item" <|
                \() ->
                    oxfordify "This sentence contains " "." [ "one item" ]
                        |> Expect.equal "This sentence contains one item."
            ]
        , describe "given a sentence with multiple items"
            [ test "returns an oxford-style sentence" <|
                \() ->
                    oxfordify "This sentence contains " "." [ "one item", "two item" ]
                        |> Expect.equal "This sentence contains one item and two item."
            , test "returns an oxford-style sentence" <|
                \() ->
                    oxfordify "This sentence contains " "." [ "one item", "two item", "three item" ]
                        |> Expect.equal "This sentence contains one item, two item, and three item."
            , test "runs a Debug.todo on purpose" <|
                \() ->
                    oxfordify "Everything is normal"
                        |> Debug.todo "this test runs a Debug.todo on purpose!"
            ]
        ]


testShrinkables : Test
testShrinkables =
    describe "Some tests that should fail and produce shrunken values"
        [ describe "a randomly generated integer"
            [ fuzz "is for sure exactly 0" int <| Expect.equal 0
            , fuzz "is <42" int <| Expect.lessThan 42
            , fuzz "is also >42" int <| Expect.greaterThan 42
            ]
        , describe "a randomly generated string"
            [ fuzz "equals its reverse" string <|
                \str ->
                    Expect.equal str (String.reverse str)
            ]
        ]
