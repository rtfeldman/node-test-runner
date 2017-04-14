module OneFailing exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    test "intentional failure" <|
        \() ->
            Expect.fail "This should fail!"
