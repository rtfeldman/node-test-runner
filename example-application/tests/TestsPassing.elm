module TestsPassing exposing (testEqual, testFalse, testTrue)

import Expect
import Something
import Test exposing (Test, test)


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \() ->
            Something.ultimateAnswer
                |> Expect.equal 42


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
