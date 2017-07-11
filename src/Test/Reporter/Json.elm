module Test.Reporter.Json exposing (reportBegin, reportComplete, reportSummary)

import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as TestResults exposing (Outcome(..), SummaryInfo, encodeFailure, isFailure)


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


reportComplete : TestResults.TestResult -> Value
reportComplete { duration, labels, outcome } =
    Encode.object
        [ ( "event", Encode.string "testCompleted" )
        , ( "status", Encode.string (getStatus outcome) )
        , ( "labels", encodeLabels labels )
        , ( "failures", Encode.list (encodeFailures outcome) )
        , ( "duration", Encode.string <| toString duration )
        ]


encodeFailures : Outcome -> List Value
encodeFailures outcome =
    case outcome of
        Failed failures ->
            List.map encodeFailure failures

        Todo str ->
            [ Encode.string str ]

        _ ->
            []


{-| Algorithm:

  - If any fail, return "fail"
  - Otherwise, if any are todo, return "todo"
  - Otherwise, return "pass"

-}
getStatus : Outcome -> String
getStatus outcome =
    case outcome of
        Failed _ ->
            "fail"

        Todo _ ->
            "todo"

        Passed ->
            "pass"


encodeLabels : List String -> Value
encodeLabels labels =
    List.reverse labels
        |> List.map Encode.string
        |> Encode.list


reportSummary : SummaryInfo -> Maybe String -> Value
reportSummary { duration, passed, failed, todos, testCount } autoFail =
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
