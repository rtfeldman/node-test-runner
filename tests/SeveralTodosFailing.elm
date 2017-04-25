module SeveralTodosFailing exposing (..)

import Expect
import Test exposing (..)


someTodos : Test
someTodos =
    Test.describe "three Todo tests"
        [ Test.todo "write a test here"
        , Test.todo "write a second test here"
        , Test.todo "write a third test here"
        ]


aPassingTest : Test
aPassingTest =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
