port module Passing.Ports exposing (..)

import Expect
import Test exposing (..)



-- Reasonably common port names:


port send : String -> Cmd msg


port receive : (String -> msg) -> Sub msg


testWithPorts : Test
testWithPorts =
    test "test with ports should pass" <|
        \() ->
            ( "success", ( send "out", receive always ) )
                |> Tuple.first
                |> Expect.equal "success"
