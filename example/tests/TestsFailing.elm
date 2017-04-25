module TestsFailing exposing (..)

import String
import Expect
import Test exposing (..)
import Fuzz exposing (..)
import Char
import Example


ultimateTest : Test
ultimateTest =
    test "the ultimate answer is 41" <|
        \() ->
            Example.ultimateAnswer
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
        [ fuzzWith { runs = 100 } (tuple3 ( string, int, string )) "adding numbers to strings has no effect" <|
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


oxfordify : a -> b -> c -> String
oxfordify _ _ _ =
    "Alice, Bob, and Claire"
