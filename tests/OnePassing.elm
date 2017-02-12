module OnePassing exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    [ plainExpectation ]
        |> concat


plainExpectation : Test
plainExpectation =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
