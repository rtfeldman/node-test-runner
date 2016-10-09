module Test.Reporter.Reporter exposing (..)

import Test.Reporter.Chalk as ChalkReporter
import Test.Reporter.Json as JsonReporter
import Test.Reporter.Result exposing (TestResult)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


type Report
    = ChalkReport
    | JsonReport


type alias TestReporter =
    { format : String
    , reportBegin : { testCount : Int, initialSeed : Int } -> Value
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
