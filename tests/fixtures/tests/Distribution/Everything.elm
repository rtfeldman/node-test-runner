module Distribution.Everything exposing (test)

import Distribution.ExpectDistributionFailingDistribution
import Distribution.ExpectDistributionFailingTest
import Distribution.ExpectDistributionPassing
import Distribution.ReportDistributionFailing
import Distribution.ReportDistributionPassing
import Expect
import Fuzz
import Test exposing (Test)


test : Test
test =
    Test.concat
        [ Distribution.ExpectDistributionFailingDistribution.test
        , Distribution.ExpectDistributionFailingTest.test
        , Distribution.ExpectDistributionPassing.test
        , Distribution.ReportDistributionFailing.test
        , Distribution.ReportDistributionPassing.test
        ]
