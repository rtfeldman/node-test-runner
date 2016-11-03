port module Main exposing (..)

import Test.Runner.Node exposing (run, TestProgram)
import Expect
import Test exposing (..)
import Json.Encode exposing (Value)


main : TestProgram
main =
    [ plainExpectation ]
        |> concat
        |> run emit


port emit : ( String, Value ) -> Cmd msg


plainExpectation : Test
plainExpectation =
    test "" <|
        \() ->
            Expect.equal "success" "success"
