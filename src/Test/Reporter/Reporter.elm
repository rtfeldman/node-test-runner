module Test.Reporter.Reporter exposing (..)

import Test.Reporter.Chalk as ChalkReporter
import Test.Reporter.Json as JsonReporter
import Test.Reporter.JUnit as JUnitReporter
import Test.Reporter.TestResults exposing (TestResult)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


type Report
    = ChalkReport
    | JsonReport
    | JUnitReport


fromString : String -> Result String Report
fromString str =
    case String.toLower str of
        "chalk" ->
            Ok ChalkReport

        "json" ->
            Ok JsonReport

        "junit" ->
            Ok JUnitReport

        _ ->
            Err ("Unrecognized report type: " ++ toString str)


type alias TestReporter =
    { format : String
    , reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
    , reportComplete : TestResult -> Maybe Value
    , reportSummary : Time -> Maybe String -> List TestResult -> Value
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
