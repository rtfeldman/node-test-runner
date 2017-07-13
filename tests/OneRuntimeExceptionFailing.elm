module OneRuntimeExceptionFailing exposing (suite)

import Expect
import Test exposing (..)


suite : Test
suite =
    test "intentional failure" <|
        \() ->
            -- If we don't have this condition, compiler blocks indefinitely on
            -- an MVar operation.
            if True then
                Debug.crash "This is intentionally failing with a runtime exception!"
            else
                Expect.pass
