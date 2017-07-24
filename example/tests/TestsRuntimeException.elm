module TestsRuntimeException exposing (..)

import Expect
import Port1
import Port2
import Test exposing (..)


testRuntimeException : Test
testRuntimeException =
    describe "runtime exception"
        [ test "should catch this" <|
            \() ->
                Expect.pass
        ]
