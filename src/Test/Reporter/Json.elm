module Test.Reporter.Json exposing (reportBegin, reportComplete, reportSummary)

import Test.Reporter.TestResults as TestResults
import Expect exposing (Expectation)
import Test.Runner
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin { paths, fuzzRuns, testCount, initialSeed } =
    Encode.object
        [ ( "event", Encode.string "runStart" )
        , ( "testCount", Encode.string <| toString testCount )
        , ( "fuzzRuns", Encode.string <| toString fuzzRuns )
        , ( "paths", Encode.list (List.map Encode.string paths) )
        , ( "initialSeed", Encode.string <| toString initialSeed )
        ]
        |> Just


reportComplete : TestResults.TestResult -> Maybe Value
reportComplete { duration, labels, expectations } =
    Just <|
        Encode.object
            [ ( "event", Encode.string "testCompleted" )
            , ( "status", Encode.string (getStatus expectations) )
            , ( "labels", encodeLabels labels )
            , ( "failures", encodeFailures expectations )
            , ( "duration", Encode.string <| toString duration )
            ]


getStatus : List Expectation -> String
getStatus expectations =
    case (List.filterMap Test.Runner.getFailure expectations) of
        [] ->
            "pass"

        xs ->
            "fail"


encodeLabels : List String -> Value
encodeLabels labels =
    List.reverse labels
        |> List.map Encode.string
        |> Encode.list


encodeFailures : List Expectation -> Value
encodeFailures expectations =
    expectations
        |> List.filterMap (Test.Runner.getFailure >> Maybe.map encodeFailure)
        |> Encode.list


encodeFailure : TestResults.Failure -> Value
encodeFailure { given, message } =
    Encode.object
        [ ( "given", Maybe.withDefault Encode.null (Maybe.map Encode.string given) )
        , ( "actual", Encode.string message )
        ]


reportSummary : Time -> Maybe String -> List TestResults.TestResult -> Value
reportSummary duration autoFail results =
    let
        failed =
            results
                |> List.filter (.expectations >> List.all ((/=) Expect.pass))
                |> List.length

        passed =
            (List.length results) - failed
    in
        Encode.object
            [ ( "event", Encode.string "runComplete" )
            , ( "passed", Encode.string <| toString passed )
            , ( "failed", Encode.string <| toString failed )
            , ( "duration", Encode.string <| toString duration )
            , ( "autoFail"
              , autoFail
                    |> Maybe.map Encode.string
                    |> Maybe.withDefault Encode.null
              )
            ]
