module Passing.Unexposed exposing (all)

import Expect
import Test exposing (..)


all : Test
all =
    describe "all"
        [ test "Expect.equal works" <|
            \() ->
                "success"
                    |> Expect.equal "success"
        , testTrue
        ]


testTrue : Test
testTrue =
    test "Expect.true works" <|
        \() ->
            True
                |> Expect.true "this should never fail!"


testUnexposed : Test
testUnexposed =
    test "This test is unexposed and should not run!" <|
        \() ->
            Expect.fail "This should fail if run!"
