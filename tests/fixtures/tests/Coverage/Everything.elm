module Coverage.Everything exposing (test)

import Coverage.ExpectCoverageFailingCoverage
import Coverage.ExpectCoverageFailingTest
import Coverage.ExpectCoveragePassing
import Coverage.ReportCoverageFailing
import Coverage.ReportCoveragePassing
import Expect
import Fuzz
import Test exposing (Test)


test : Test
test =
    Test.concat
        [ Coverage.ExpectCoverageFailingCoverage.test
        , Coverage.ExpectCoverageFailingTest.test
        , Coverage.ExpectCoveragePassing.test
        , Coverage.ReportCoverageFailing.test
        , Coverage.ReportCoveragePassing.test
        ]
