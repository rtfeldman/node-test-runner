port module Main exposing (..)

import Test.Runner.Node exposing (run)
import Expect
import Test exposing (test, Test)
import Json.Encode exposing (Value)


main : Program Never
main =
    [ plainExpectation ]
        |> Test.concat
        |> run emit


port emit : ( String, Value ) -> Cmd msg


plainExpectation : Test
plainExpectation =
    test "" <|
        \() ->
            Expect.equal "success" "success"
