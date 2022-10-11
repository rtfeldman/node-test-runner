module Distribution.ReportDistributionFailing exposing (test)

import Expect
import Fuzz
import Test exposing (Test)


test : Test
test =
    Test.fuzzWith
        { runs = 10000
        , distribution =
            Test.reportDistribution
                [ ( "low", \n -> n == 1 )
                , ( "high", \n -> n == 20 )
                , ( "in between", \n -> n > 1 && n < 20 )
                , ( "outside", \n -> n < 1 || n > 20 )
                ]
        }
        (Fuzz.intRange 1 20)
        "reportDistribution: failing"
        (\_ -> Expect.fail "The test is supposed to fail")
