module DependenciesTest exposing (testOneOrMore)

import Expect
import Json.Decode as Decode
import Test exposing (Test, test)


{-| This test should pass with `--dependencies newest`,
but fail with `--dependencies oldest`, since the range
in elm.json is: `"elm/json": "1.0.0 <= v < 2.0.0"` and
`oneOrMore` was added in 1.1.0.
-}
testOneOrMore : Test
testOneOrMore =
    test "Json.Decode.oneOrMore (added in elm/json 1.1.0) works" <|
        \() ->
            let
                decoder =
                    Decode.oneOrMore (::) Decode.int
            in
            Decode.decodeString decoder "[1, 2, 3]"
                |> Expect.equal (Ok [ 1, 2, 3 ])
