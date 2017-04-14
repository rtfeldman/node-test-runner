module PolyfillPassing exposing (..)

import Expect
import Test exposing (..)


-- Native.Polyfilled is only for testing node-test-runner

import Native.Polyfilled


plainExpectation : Test
plainExpectation =
    test "plain" <|
        \() ->
            Expect.true "Polyfilling of `window` failed" True
