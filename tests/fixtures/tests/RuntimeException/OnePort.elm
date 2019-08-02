module RuntimeException.OnePort exposing (testRuntimeException)

import Expect
import Port1
import Port2
import Test exposing (..)


testRuntimeException : Test
testRuntimeException =
    test "This should error because the module imports two ports with the same name." <|
        \() ->
            -- To induce a crash, we need to reference Port1.check and Port2.check.
            -- Otherwise they will get DCE'd and there won't be a runtime exception!
            [ Port1.check "foo", Port2.check "bar" ]
                |> List.drop 2
                |> List.length
                |> Expect.equal 1234
