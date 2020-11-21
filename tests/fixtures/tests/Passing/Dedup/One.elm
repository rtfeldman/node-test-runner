module Passing.Dedup.One exposing (..)

import Expect
import Test exposing (..)


plainExpectation : Test
plainExpectation =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
