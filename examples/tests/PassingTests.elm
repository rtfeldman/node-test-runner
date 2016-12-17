module PassingTests exposing (tests)

import Test.Runner.Node exposing (run, TestProgram)
import Expect
import Test exposing (..)
import Json.Encode exposing (Value)


-- Native.Polyfilled is only for testing node-test-runner

import Native.Polyfilled


tests : Test
tests =
    [ plainExpectation ]
        |> concat


plainExpectation : Test
plainExpectation =
    test "" <|
        \() ->
            Expect.equal "success" "success"
