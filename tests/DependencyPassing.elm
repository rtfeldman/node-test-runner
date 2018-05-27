module DependencyPassing exposing (..)

import Expect
import Regex
import Test exposing (..)


testDependency : Test
testDependency =
    describe "tests that use a third-party dependency (but only for the tests!)"
        [ test "Regex.replace is available" <|
            \() ->
                "this totally works"
                    |> Regex.replace (Regex.fromString "\\w+" |> Maybe.withDefault Regex.never) (always "word")
                    |> Expect.equal "word word word"
        ]
