module Test.Reporter.Json exposing (reportBegin, reportComplete, reportSummary)

import Test.Reporter.Result as Results
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


reportBegin : { testCount : Int, initialSeed : Int } -> Value
reportBegin { testCount, initialSeed } =
    Encode.object
        [ ( "event", Encode.string "runStart" )
        , ( "testCount", Encode.string <| toString testCount )
        , ( "initialSeed", Encode.string <| toString initialSeed )
        ]


reportComplete : Results.TestResult -> Maybe Value
reportComplete { duration, labels, expectations } =
    Just
        <| Encode.object
            [ ( "event", Encode.string "testCompleted" )
            , ( "status", Encode.string (getStatus expectations) )
            , ( "labels", encodeLabels labels )
            , ( "failures", encodeFailures expectations )
            , ( "duration", Encode.string <| toString duration )
            ]


getStatus : List Expectation -> String
getStatus expectations =
    case (List.filterMap Expect.getFailure expectations) of
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
    List.filterMap Expect.getFailure expectations
        |> List.map encodeFailure
        |> Encode.list


encodeFailure : Results.Failure -> Value
encodeFailure { given, message } =
    Encode.object
        [ ( "given", Encode.string given )
        , ( "actual", Encode.string message )
        ]


reportSummary : Time -> List Results.TestResult -> Value
reportSummary duration results =
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
            ]
