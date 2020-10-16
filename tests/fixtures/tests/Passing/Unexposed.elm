module Passing.Unexposed exposing (all)

{- Ideally we would detect unexposed tests and warn users about them. In elm 0.18.0 we did this, but
   internal compiler changes mean we no longer can. This test passes if unexposed tests are ignored to
   keep the behavior consistent. Ideas about how we can detect unexposed tests (and thus cause this
   test to fail) are very welcome!

   See https://github.com/rtfeldman/node-test-runner/pull/425#issuecomment-637028958 (and following
   comments) for more info.
-}

import Expect
import Test exposing (..)


all : Test
all =
    describe "all"
        [ test "Expect.equal works" <|
            \() ->
                "success"
                    |> Expect.equal "success"
        , testTrue
        ]


testTrue : Test
testTrue =
    test "Expect.true works" <|
        \() ->
            True
                |> Expect.true "this should never fail!"


testUnexposed : Test
testUnexposed =
    test "This test is unexposed and will not run!" <|
        \() ->
            Expect.fail "This should fail if run!"
