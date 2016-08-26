module Tests exposing (..)

import Fuzz exposing (string)
import Test exposing (..)
import Expect
import String


all : Test
all =
    describe "A Test Suite"
        [ test "Addition" <|
            \() ->
                Expect.equal (3 + 7) 10
        , test "String.left" <|
            \() ->
                Expect.equal "a" (String.left 1 "abcdefg")
        , test "This test should fail" <|
            \() ->
                Expect.fail "failed as expected!"
        , fuzz string "This test runs multiple times with randomly generated strings based on the initial seed" <|
            \randomlyGeneratedString ->
                randomlyGeneratedString
                    |> String.reverse
                    |> String.reverse
                    |> Expect.equal randomlyGeneratedString
          -- uncomment the line below to see the values being used in the console when the test runs!
          -- |> Debug.log randomlyGeneratedString
        ]
