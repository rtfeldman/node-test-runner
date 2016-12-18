module PassingTests exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    [ plainExpectation ]
        |> concat


plainExpectation : Test
plainExpectation =
    test "" <|
        \() ->
            Expect.equal "success" "success"
