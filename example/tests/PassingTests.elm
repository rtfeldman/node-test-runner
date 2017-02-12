module PassingTests exposing (suite)

import Expect
import Test exposing (Test, test)


suite : Test
suite =
    Test.concat
        [ testEqual
        , testTrue
        , testFalse
        ]


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \() ->
            "success"
                |> Expect.equal "success"


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
