module Test.Reporter.Reporter exposing (..)

import Test.Reporter.Chalk as ChalkReporter
import Test.Reporter.Json as JsonReporter
import Test.Reporter.JUnit as JUnitReporter
import Test.Reporter.Result exposing (TestResult)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


type Report
    = ChalkReport
    | JsonReport
    | JUnitReport


type alias TestReporter =
    { format : String
    , reportBegin : { fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
    , reportComplete : TestResult -> Maybe Value
    , reportSummary : Time -> List TestResult -> Value
    }


createReporter : Report -> TestReporter
createReporter report =
    case report of
        JsonReport ->
            TestReporter "JSON"
                JsonReporter.reportBegin
                JsonReporter.reportComplete
                JsonReporter.reportSummary

        ChalkReport ->
            TestReporter "CHALK"
                ChalkReporter.reportBegin
                ChalkReporter.reportComplete
                ChalkReporter.reportSummary

        JUnitReport ->
            TestReporter "JUNIT"
                JUnitReporter.reportBegin
                JUnitReporter.reportComplete
                JUnitReporter.reportSummary
