module OnePortRuntimeException exposing (..)

import Expect
import Port1
import Port2
import Test exposing (..)


testRuntimeException : Test
testRuntimeException =
    test "This should error because the module imports two ports with the same name." <|
        \() ->
            Expect.pass
