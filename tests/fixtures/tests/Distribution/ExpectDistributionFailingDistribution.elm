module Distribution.ExpectDistributionFailingDistribution exposing (test)

import Expect
import Fuzz
import Test exposing (Test)
import Test.Distribution


test : Test
test =
    Test.fuzzWith
        { runs = 10000
        , distribution =
            Test.expectDistribution
                [ ( Test.Distribution.atLeast 4, "low", \n -> n == 1 )
                , ( Test.Distribution.atLeast 4, "high", \n -> n == 20 )
                , ( Test.Distribution.atLeast 80, "in between", \n -> n > 1 && n < 20 )
                , ( Test.Distribution.zero, "outside", \n -> n < 1 || n > 20 )
                , ( Test.Distribution.zero, "one", \n -> n == 1 )
                ]
        }
        (Fuzz.intRange 1 20)
        "expectDistribution: failing because of distribution"
        (\_ -> Expect.pass)
