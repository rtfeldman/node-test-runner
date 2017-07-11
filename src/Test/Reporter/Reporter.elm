module Test.Reporter.Reporter exposing (..)

import Console.Text exposing (UseColor)
import Json.Encode as Encode exposing (Value)
import Test.Reporter.Console as ConsoleReporter
import Test.Reporter.JUnit as JUnitReporter
import Test.Reporter.Json as JsonReporter
import Test.Reporter.TestResults exposing (SummaryInfo, TestResult)


type Report
    = ConsoleReport UseColor
    | JsonReport
    | JUnitReport


type alias TestReporter =
    { format : String
    , reportBegin : RunInfo -> Maybe Value
    , reportComplete : TestResult -> Value
    , reportSummary : SummaryInfo -> Maybe String -> Value
    }


type alias RunInfo =
    { paths : List String
    , fuzzRuns : Int
    , testCount : Int
    , initialSeed : Int
    }


createReporter : Report -> TestReporter
createReporter report =
    case report of
        JsonReport ->
            TestReporter "JSON"
                JsonReporter.reportBegin
                JsonReporter.reportComplete
                JsonReporter.reportSummary

        ConsoleReport useColor ->
            TestReporter "CHALK"
                (ConsoleReporter.reportBegin useColor)
                (ConsoleReporter.reportComplete useColor)
                (ConsoleReporter.reportSummary useColor)

        JUnitReport ->
            TestReporter "JUNIT"
                JUnitReporter.reportBegin
                JUnitReporter.reportComplete
                JUnitReporter.reportSummary
