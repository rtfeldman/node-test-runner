module DependencyPassing exposing (suite)

import String.Extra
import Expect
import Test exposing (..)


suite : Test
suite =
    testDependency


testDependency : Test
testDependency =
    describe "tests that use a third-party dependency (but only for the tests!)"
        [ test "toTitleCase is available" <|
            \() ->
                "this totally works"
                    |> String.Extra.toTitleCase
                    |> Expect.equal "This Totally Works"
        ]
