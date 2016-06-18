module Tests exposing (..)

import Test exposing (..)
import Assert
import String


all : Test
all =
    describe "A Test Suite"
        [ test "Addition"
            <| \_ ->
                Assert.equal (3 + 7) 10
        , test "String.left"
            <| \_ ->
                Assert.equal "a" (String.left 1 "abcdefg")
        , test "This test should fail"
            <| \_ ->
                Assert.fail "failed as expected!"
        ]
