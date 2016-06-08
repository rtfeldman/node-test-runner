port module Main exposing (..)

import Test.Runner.Node exposing (run)
import Test exposing (..)


tests : Test
tests =
    describe "A Test Suite"
        Test.unit
        [ \_ ->
            it "Addition"
                Assert.equal
                { expected = (3 + 7), actual = 10 }
        , \_ ->
            it "String.left"
                Assert.equal
                { expected = "a", actual = String.left 1 "abcdefg" }
        , \_ ->
            it "This test should fail"
                (\_ -> Assert.fail)
                ()
        ]



--tests : Test
--tests =
--    suite "A Test Suite"
--        [ test "Addition" (assertEqual (3 + 7) 10)
--        , test "String.left" (assertEqual "a" (String.left 1 "abcdefg"))
--        , test "This test should fail" (assert False)
--        ]


main : Program Never
main =
    run emit


port emit : Cmd msg
