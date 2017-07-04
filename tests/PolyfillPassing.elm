module PolyfillPassing exposing (..)

-- Native.Polyfilled is only for testing node-test-runner

import Expect
import Native.Polyfilled
import Test exposing (..)


plainExpectation : Test
plainExpectation =
    test "plain" <|
        \() ->
            Expect.true "Polyfilling of `window` failed" True
