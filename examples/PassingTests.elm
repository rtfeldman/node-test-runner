port module Main exposing (..)

import Test.Runner.Node exposing (run)
import Assert
import Test exposing (..)
import Json.Encode exposing (Value)


main : Program Never
main =
    run emit suites


port emit : ( String, Value ) -> Cmd msg


{-| A fuzzzer that usually generates "foo", but occasonally "bar". We expect a claim that it's always "foo" to fail.
-}
suites : Suite
suites =
    Batch
        [ plainAssertion
        ]


plainAssertion : Suite
plainAssertion =
    Test.singleton
        <| \_ ->
            { expected = "success"
            , actual = "success"
            }
                |> Assert.equal
