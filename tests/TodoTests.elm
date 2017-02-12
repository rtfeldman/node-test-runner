module TodoTests exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    Test.describe "TODO tests"
        [ someTodos
        , aPassingTest
        ]


someTodos : Test
someTodos =
    Test.describe "three TODO tests"
        [ Test.todo "write a test here"
        , Test.todo "write a second test here"
        , Test.todo "write a third test here"
        ]


aPassingTest : Test
aPassingTest =
    test "this should pass" <|
        \() ->
            Expect.equal "success" "success"
