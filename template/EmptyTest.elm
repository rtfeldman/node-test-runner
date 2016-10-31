port module Main exposing (..)

import Test.Runner.Node exposing (run)
import Test exposing (..)
import Json.Encode exposing (Value)


main : Program Value
main =
    []
        |> Test.concat
        |> run emit


port emit : ( String, Value ) -> Cmd msg
