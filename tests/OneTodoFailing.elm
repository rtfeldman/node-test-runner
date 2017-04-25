module OneTodoFailing exposing (..)

import Expect
import Test exposing (..)


suite : Test
suite =
    Test.describe "Todo tests"
        [ Test.todo "write a test here"
        ]


aPassingTest : Test
aPassingTest =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
