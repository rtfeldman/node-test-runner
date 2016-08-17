port module Main exposing (..)

import Test.Runner.Node exposing (run)
import String
import Expect
import Test exposing (..)
import Fuzz exposing (..)
import Json.Encode exposing (Value)
import Char


main : Program Value
main =
    [ testWithoutNums
    , testOxfordify
    , noDescription
    , testExpectations
    , testFailingFuzzTests
    , testFuzz
    , testShrinkables
    ]
        |> Test.concat
        |> run emit


port emit : ( String, Value ) -> Cmd msg


withoutNums : String -> String
withoutNums =
    String.filter (\ch -> not (Char.isDigit ch || ch == '.'))


testWithoutNums : Test
testWithoutNums =
    describe "withoutNums"
        [ fuzzWith { runs = 100 } (tuple3 ( string, float, string )) "adding numbers to strings has no effect" <|
            \( prefix, num, suffix ) ->
                withoutNums (prefix ++ toString num ++ suffix)
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


{-| stubbed function under test
-}
oxfordify : a -> b -> c -> String
oxfordify _ _ _ =
    "Alice, Bob, and Claire"


noDescription : Test
noDescription =
    test "" <|
        \() ->
            Expect.equal "No description" "Whatsoever!"


testFuzz : Test
testFuzz =
    describe "fuzzing"
        [ fuzz2 string string "empty list etc" <|
            \name punctuation ->
                oxfordify "This sentence is empty" "." []
                    |> Expect.equal ""
                    |> Expect.onFail "given an empty list, did not return an empty string"
        , fuzz2 string string "further testing" <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item" ]
                    |> Expect.equal "This sentence contains one item."
        , fuzz2 string string "custom onFail here" <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item", "two item" ]
                    |> Expect.equal "This sentence contains one item and two item."
                    |> Expect.onFail "given an empty list, did not return an empty string"
        , fuzz2 string string "This is a test." <|
            \name punctuation ->
                oxfordify "This sentence contains " "." [ "one item", "two item", "three item" ]
                    |> Expect.equal "This sentence contains one item, two item, and three item."
                    |> Expect.onFail "given a list of length 3, did not return an oxford-style sentence"
        ]


testFailingFuzzTests : Test
testFailingFuzzTests =
    describe "the first element in this fuzz tuple"
        [ fuzz2 string string "is always \"foo\"" <|
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
            ]
        ]


testShrinkables : Test
testShrinkables =
    describe "Some tests that should fail and produce shrunken values"
        [ describe "a randomly generated integer"
            [ fuzz int "is for sure exactly 0" <| Expect.equal 0
            , fuzz int "is <42" <| Expect.lessThan 42
            , fuzz int "is also >42" <| Expect.greaterThan 42
            ]
        , describe "a randomly generated string"
            [ fuzz string "equals its reverse" <|
                \str ->
                    Expect.equal str (String.reverse str)
            ]
        ]
