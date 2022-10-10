module Test.Reporter.Console.FormatTest exposing (suite)

import Expect
import Fuzz
import Test exposing (..)
import Test.Distribution
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
            , distribution =
                Test.reportDistribution
                    [ ( "low", \n -> n == 1 )
                    , ( "high", \n -> n == 20 )
                    , ( "in between", \n -> n > 1 && n < 20 )
                    , ( "outside", \n -> n < 1 || n > 20 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "reportDistribution: passing"
            (\_ -> Expect.pass)
        , Test.fuzzWith
            { runs = 10000
            , distribution =
                Test.reportDistribution
                    [ ( "low", \n -> n == 1 )
                    , ( "high", \n -> n == 20 )
                    , ( "in between", \n -> n > 1 && n < 20 )
                    , ( "outside", \n -> n < 1 || n > 20 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "reportDistribution: failing"
            (\_ -> Expect.fail "The test is supposed to fail")
        , Test.fuzzWith
            { runs = 10000
            , distribution =
                Test.expectDistribution
                    [ ( Test.Distribution.atLeast 4, "low", \n -> n == 1 )
                    , ( Test.Distribution.atLeast 4, "high", \n -> n == 20 )
                    , ( Test.Distribution.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                    , ( Test.Distribution.zero, "outside", \n -> n < 1 || n > 20 )
                    , ( Test.Distribution.moreThanZero, "one", \n -> n == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "expectDistribution: passing"
            (\_ -> Expect.pass)
        , Test.fuzzWith
            { runs = 10000
            , distribution =
                Test.expectDistribution
                    [ ( Test.Distribution.atLeast 4, "low", \n -> n == 1 )
                    , ( Test.Distribution.atLeast 4, "high", \n -> n == 20 )
                    , ( Test.Distribution.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                    , ( Test.Distribution.zero, "outside", \n -> n < 1 || n > 20 )
                    , ( Test.Distribution.zero, "one", \n -> n == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "expectDistribution: failing because of distribution"
            (\_ -> Expect.pass)
        , Test.fuzzWith
            { runs = 10000
            , distribution =
                Test.expectDistribution
                    [ ( Test.Distribution.atLeast 4, "low", \n -> n == 1 )
                    , ( Test.Distribution.atLeast 4, "high", \n -> n == 20 )
                    , ( Test.Distribution.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                    , ( Test.Distribution.zero, "outside", \n -> n < 1 || n > 20 )
                    , ( Test.Distribution.moreThanZero, "one", \n -> n == 1 )
                    ]
            }
            (Fuzz.intRange 1 20)
            "expectDistribution: failing because of test"
            (\_ -> Expect.fail "This test is supposed to fail")
        ]
