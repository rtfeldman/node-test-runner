module Test.Reporter.Console.FormatTest exposing (suite)

import Expect
import Fuzz
import Test exposing (..)
import Test.Coverage
import Test.Reporter.Console.Format exposing (highlightEqual)


suite : Test
suite =
    describe "highlightEqual"
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
        , Test.fuzzWith
            { runs = 10000
            , coverage =
                Test.reportCoverage
                    [ ( "fizz", \n -> (n |> modBy 3) == 0 )
                    , ( "buzz", \n -> (n |> modBy 5) == 0 )
                    , ( "even", \n -> (n |> modBy 2) == 0 )
                    , ( "odd", \n -> (n |> modBy 2) == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "Fizz buzz even odd - fail"
            (\n -> Expect.fail "boo")
        , Test.fuzzWith
            { runs = 10000
            , coverage =
                Test.reportCoverage
                    [ ( "fizz", \n -> (n |> modBy 3) == 0 )
                    , ( "buzz", \n -> (n |> modBy 5) == 0 )
                    , ( "even", \n -> (n |> modBy 2) == 0 )
                    , ( "odd", \n -> (n |> modBy 2) == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "Fizz buzz even odd - pass"
            (\n -> Expect.pass)
        , Test.fuzzWith
            { runs = 10000
            , coverage =
                Test.expectCoverage
                    [ ( Test.Coverage.atLeast 4, "low", \n -> n == 1 )
                    , ( Test.Coverage.atLeast 4, "high", \n -> n == 20 )
                    , ( Test.Coverage.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                    , ( Test.Coverage.zero, "outside", \n -> n < 1 || n > 20 )
                    , ( Test.Coverage.moreThanZero, "one", \n -> n == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "Int range boundaries - mandatory - pass"
            (\n -> Expect.pass)
        , Test.fuzzWith
            { runs = 10000
            , coverage =
                Test.expectCoverage
                    [ ( Test.Coverage.atLeast 4, "low", \n -> n == 1 )
                    , ( Test.Coverage.atLeast 4, "high", \n -> n == 20 )
                    , ( Test.Coverage.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                    , ( Test.Coverage.zero, "outside", \n -> n < 1 || n > 20 )
                    , ( Test.Coverage.zero, "one", \n -> n == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "Int range boundaries - mandatory - fail"
            (\n -> Expect.fail "x")
        ]
