module Coverage.ExpectCoverageFailingCoverage exposing (test)

import Expect
import Fuzz
import Test exposing (Test)
import Test.Coverage


test : Test
test =
    Test.fuzzWith
        { runs = 10000
        , coverage =
            Test.expectCoverage
                [ ( Test.Coverage.atLeast 4, "low", \n -> n == 1 )
                , ( Test.Coverage.atLeast 4, "high", \n -> n == 20 )
                , ( Test.Coverage.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                , ( Test.Coverage.zero, "outside", \n -> n < 1 || n > 20 )
                , ( Test.Coverage.zero, "one", \n -> n == 1 )
                ]
        }
        (Fuzz.intRange 1 20)
        "expectCoverage: failing because of coverage"
        (\_ -> Expect.pass)
