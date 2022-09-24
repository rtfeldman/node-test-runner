module Passing.Several exposing (..)

import Expect
import Test exposing (..)


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \() ->
            "success"
                |> Expect.equal "success"


testTrue : Test
testTrue =
    test "Expect.equal True works" <|
        \() ->
            True
                |> Expect.equal True
                |> Expect.onFail "this should never fail!"


testFalse : Test
testFalse =
    test "Expect.equal False works" <|
        \() ->
            False
                |> Expect.equal False
                |> Expect.onFail "this should never fail!"
