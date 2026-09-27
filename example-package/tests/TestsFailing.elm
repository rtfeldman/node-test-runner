module TestsFailing exposing (oxfordify, someTodos, testExpectations, testFuzz, testWithoutNums, ultimateTest, withoutNums)

import Char
import Expect
import Fuzz exposing (..)
import Something
import String
import Test exposing (..)


ultimateTest : Test
ultimateTest =
    test "the ultimate answer is 41" <|
        \() ->
            Something.ultimateAnswer
                |> Expect.equal 41


someTodos : Test
someTodos =
    Test.describe "you should not see these in normal output, because there are non-Todo failures"
        [ Test.todo "write a test here"
        , Test.todo "write a second test here"
        , Test.todo "write a third test here"
        ]


withoutNums : String -> String
withoutNums =
    String.filter (\ch -> not (Char.isDigit ch || ch == '.'))


testWithoutNums : Test
testWithoutNums =
    describe "withoutNums"
        [ fuzzWith "adding numbers to strings has no effect" { runs = 100, distribution = Test.noDistribution } (triple string int string) <|
            \( prefix, num, suffix ) ->
                withoutNums (prefix ++ String.fromInt num ++ suffix)
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


oxfordify : a -> b -> c -> String
oxfordify _ _ _ =
    "Alice, Bob, and Claire"
