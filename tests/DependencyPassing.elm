module DependencyPassing exposing (..)

import String.Extra
import Expect
import Test exposing (..)


testDependency : Test
testDependency =
    describe "tests that use a third-party dependency (but only for the tests!)"
        [ test "toTitleCase is available" <|
            \() ->
                "this totally works"
                    |> String.Extra.toTitleCase
                    |> Expect.equal "This Totally Works"
        ]
