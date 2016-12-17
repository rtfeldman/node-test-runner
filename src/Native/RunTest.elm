module Native.RunTest exposing (run)

import Expect exposing (Expectation)


{-| Execute the given thunk.

If it throws an exception, return a failure instead of crashing.
-}
run : (() -> ( List String, List Expectation )) -> ( List String, List Expectation )
run =
    Native.run
