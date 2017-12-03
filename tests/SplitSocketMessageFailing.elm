module SplitSocketMessageFailing exposing (..)

import Expect exposing (Expectation)
import Test exposing (..)
import Array.Hamt as Array


{- This is a regression test.

   For some reason, the failure output of this specific test ends up being read
   from the socket in 2 separate chunks. This breaks our assumption and leads to
   a crash.

   I'm not sure to what degree this can be reproduced on platforms _other_ than
   OSX.
-}


suite : Test
suite =
    test "scce" <|
        \_ ->
            Expect.equal
                (Array.repeat 1 0)
                (Array.repeat 49 0)
