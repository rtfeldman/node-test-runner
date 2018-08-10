module OneRuntimeExceptionFailing exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    test "intentional failure" <|
        \() ->
            Debug.todo "This is intentionally failing with a runtime exception!"
