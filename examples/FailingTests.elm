port module Main exposing (..)

import Test.Runner.Node exposing (run)
import String
import Assert
import Test exposing (..)
import Fuzz exposing (Fuzzer, int, string)
import Random.Pcg as Random
import Shrink
import Json.Encode exposing (Value)


main : Program Never
main =
    [ testOxfordify
    , noDescription
    , testAssertions
    , testFailingFuzzTests
    , actualFuzzTest
    , testFuzz
    , testShrinkables
    ]
        |> batch
        |> run emit


port emit : ( String, Value ) -> Cmd msg


{-| A fuzzzer that usually generates "foo", but occasonally "bar". We expect a claim that it's always "foo" to fail.
-}
usuallyFoo : Fuzzer String
usuallyFoo =
    Fuzzer
        (Random.oneIn 30
            |> Random.map
                (\b ->
                    if b then
                        "bar"
                    else
                        "foo"
                )
        )
        Shrink.string


actualFuzzTest : Test
actualFuzzTest =
    describe "actual fuzz test"
        [ fuzz usuallyFoo "description goes here"
            <| \shouldBeFoo ->
                { expected = "foo"
                , actual = shouldBeFoo
                }
                    |> Assert.equal
                    |> Assert.onFail "It wasn't \"foo\"."
        ]


testAssertions : Test
testAssertions =
    describe "basic assertions"
        [ test "this should succeed"
            <| \_ ->
                { expected = ()
                , actual = ()
                }
                    |> Assert.equal
        , test "this should fail"
            <| \_ ->
                { expected = "something"
                , actual = "someting else"
                }
                    |> Assert.equal
        , test "another failure"
            <| \_ ->
                { expected = "forty-two"
                , actual = "forty-three"
                }
                    |> Assert.equal
        ]



{- After this point, we're really just showing that Richard's proposed API compiles. -}


{-| stubbed function under test
-}
oxfordify : a -> b -> c -> String
oxfordify _ _ _ =
    "Alice, Bob, and Claire"


{-| Stubbed fuzzer - TODO implement
-}
string : Fuzzer String
string =
    Fuzzer (Random.choice "foo" "bar")
        Shrink.string


noDescription : Test
noDescription =
    test ""
        <| \_ ->
            { expected = "No description"
            , actual = "Whatsoever!"
            }
                |> Assert.equal


testFuzz : Test
testFuzz =
    describe "fuzzing"
        [ fuzz2 string string "empty list etc"
            <| \name punctuation ->
                { expected = ""
                , actual = oxfordify "This sentence is empty" "." []
                }
                    |> Assert.equal
                    |> Assert.onFail "given an empty list, did not return an empty string"
        , fuzz2 string string "further testing"
            <| \name punctuation ->
                { expected = "This sentence contains one item."
                , actual = oxfordify "This sentence contains " "." [ "one item" ]
                }
                    |> Assert.equal
        , fuzz2 string string "custom onFail here"
            <| \name punctuation ->
                { expected = "This sentence contains one item and two item."
                , actual = oxfordify "This sentence contains " "." [ "one item", "two item" ]
                }
                    |> Assert.equal
                    |> Assert.onFail "given an empty list, did not return an empty string"
        , fuzz2 string string "This is a test."
            <| \name punctuation ->
                { expected = "This sentence contains one item, two item, and three item."
                , actual = oxfordify "This sentence contains " "." [ "one item", "two item", "three item" ]
                }
                    |> Assert.equal
                    |> Assert.onFail "given a list of length 3, did not return an oxford-style sentence"
        ]


testFailingFuzzTests : Test
testFailingFuzzTests =
    describe "the first element in this fuzz tuple"
        [ fuzz2 string string "is always \"foo\""
            <| \str1 str2 ->
                Assert.equal
                    { expected = "foo"
                    , actual = str1
                    }
        ]


testOxfordify : Test
testOxfordify =
    describe "oxfordify"
        [ describe "given an empty sentence"
            [ test "returns an empty string"
                <| \_ ->
                    Assert.equal
                        { expected = ""
                        , actual = oxfordify "This sentence is empty" "." []
                        }
            ]
        , describe "given a sentence with one item"
            [ test "still contains one item"
                <| \_ ->
                    Assert.equal
                        { expected = "This sentence contains one item."
                        , actual = oxfordify "This sentence contains " "." [ "one item" ]
                        }
            ]
        , describe "given a sentence with multiple items"
            [ test "returns an oxford-style sentence"
                <| \_ ->
                    Assert.equal
                        { expected = "This sentence contains one item and two item."
                        , actual = oxfordify "This sentence contains " "." [ "one item", "two item" ]
                        }
            , test "returns an oxford-style sentence"
                <| \_ ->
                    Assert.equal
                        { expected = "This sentence contains one item, two item, and three item."
                        , actual = oxfordify "This sentence contains " "." [ "one item", "two item", "three item" ]
                        }
            ]
        ]


testShrinkables : Test
testShrinkables =
    describe "Some tests that should fail and produce shrunken values"
        [ describe "a randomly generated integer"
            [ fuzz int "is for sure exactly 0"
                <| \i ->
                    Assert.equal
                        { expected = 0
                        , actual = i
                        }
            , fuzz int "is <42"
                <| \i ->
                    Assert.lessThan
                        { greater = 42
                        , lesser = i
                        }
            , fuzz int "is also >42"
                <| \i ->
                    Assert.greaterThan
                        { greater = 42
                        , lesser = i
                        }
            ]
        , describe "a randomly generated string"
            [ fuzz string "equals its reverse"
                <| \s ->
                    Assert.equal
                        { expected = s
                        , actual = String.reverse s
                        }
            ]
        ]
