module Test.Reporter.Console.FormatTest exposing (suite)

import Test exposing (..)
import Expect
import Test.Reporter.Console.Format exposing (highlightEqual)

suite : Test
suite = describe "highlightEqual"
    [ describe "strings that should *not* be highlighted"
        [ describe "very different strings"
            [ test "Two strings which are *just* too different for high" <|
                \() ->
                    let
                        expected =
                            "Err { context = \"Explanation of what went so wrong\", description = \"An error\" }"

                        actual =
                            "Ok \"Success.\""
                    in
                        highlightEqual expected actual
                            |> Expect.equal Nothing
            , test "A string containing another string interpersed with other characters" <|
                \() ->
                    let
                        expected =
                            "OhK3 S-u5c6c4e2s2s  4"

                        actual =
                            "Ok (Success.>"
                    in
                        highlightEqual expected actual
                            |> Expect.equal Nothing
            ]
        , test "strings containing floating point numbers" <|
            \() ->
                let
                    expected =
                        "1.6"

                    actual =
                        "16"
                in
                    highlightEqual expected actual
                        |> Expect.equal Nothing
        ]
    , describe "strings that should be highlighted"
        [ test "similar strings" <|
            \() ->
                let
                    expected =
                        "Err { context = \"Success\" }"

                    actual =
                        "(Ok \"Success\""
                in
                    highlightEqual expected actual
                        |> Expect.notEqual Nothing

        ]
    ]


