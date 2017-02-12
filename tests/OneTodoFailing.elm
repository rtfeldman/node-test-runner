module OneTodoFailing exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    Test.describe "TODO tests"
        [ aPassingTest
        , Test.todo "write a test here"
        ]


aPassingTest : Test
aPassingTest =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
