module Test.Reporter.Reporter exposing (..)

import Console.Text exposing (UseColor(..))
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode exposing (Value)
import Test.Reporter.Console as ConsoleReporter
import Test.Reporter.JUnit as JUnitReporter
import Test.Reporter.Json as JsonReporter
import Test.Reporter.TestResults exposing (SummaryInfo, TestResult)


type Report
    = ConsoleReport UseColor
    | JsonReport
    | JUnitReport


decoder : Decoder Report
decoder =
    Decode.string
        |> Decode.andThen reportFromString


reportFromString : String -> Decoder Report
reportFromString reportType =
    case reportType of
        "console-color" ->
            Decode.succeed (ConsoleReport UseColor)

        "console-monochrome" ->
            Decode.succeed (ConsoleReport Monochrome)

        "json" ->
            Decode.succeed JsonReport

        "junit" ->
            Decode.succeed JUnitReport

        _ ->
            Decode.fail ("Unrecognized report type:" ++ reportType)


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
