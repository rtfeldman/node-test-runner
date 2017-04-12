module OnePassing exposing (..)

import Expect
import Test exposing (..)


plainExpectation : Test
plainExpectation =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
