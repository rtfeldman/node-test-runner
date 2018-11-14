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
    test "Expect.true works" <|
        \() ->
            True
                |> Expect.true "this should never fail!"


testFalse : Test
testFalse =
    test "Expect.false works" <|
        \() ->
            False
                |> Expect.false "this should never fail!"
