port module Main exposing (..)

import Test.Runner.Node exposing (run)
import Assert
import Test exposing (..)
import Json.Encode exposing (Value)


main : Program Never
main =
    [ plainAssertion ]
        |> batch
        |> run emit


port emit : ( String, Value ) -> Cmd msg


plainAssertion : Test
plainAssertion =
    test ""
        <| \_ ->
            Assert.equal "success" "success"
