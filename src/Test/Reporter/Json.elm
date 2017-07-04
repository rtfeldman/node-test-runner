module Test.Reporter.Json exposing (reportBegin, reportComplete, reportSummary)

import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as TestResults exposing (Outcome(..), encodeFailure, isFailure)
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
reportComplete { duration, labels, outcomes } =
    Just <|
        Encode.object
            [ ( "event", Encode.string "testCompleted" )
            , ( "status", Encode.string (getStatus outcomes) )
            , ( "labels", encodeLabels labels )
            , ( "failures", Encode.list (List.filterMap maybeEncodeFailures outcomes) )
            , ( "duration", Encode.string <| toString duration )
            ]


maybeEncodeFailures : Outcome -> Maybe Value
maybeEncodeFailures outcome =
    case outcome of
        Failed failure ->
            Just (encodeFailure failure)

        _ ->
            Nothing


{-| Algorithm:

  - If any fail, return "fail"
  - Otherwise, if any are todo, return "todo"
  - Otherwise, return "pass"

-}
getStatus : List Outcome -> String
getStatus =
    getStatusHelp "pass"


getStatusHelp : String -> List Outcome -> String
getStatusHelp result outcomes =
    case outcomes of
        [] ->
            result

        (Failed _) :: _ ->
            "fail"

        (Todo _) :: rest ->
            getStatusHelp "todo" rest

        Passed :: rest ->
            getStatusHelp result rest


encodeLabels : List String -> Value
encodeLabels labels =
    List.reverse labels
        |> List.map Encode.string
        |> Encode.list


reportSummary : Time -> Maybe String -> List TestResults.TestResult -> Value
reportSummary duration autoFail results =
    let
        failed =
            results
                |> List.filter (.outcomes >> List.any isFailure)
                |> List.length

        passed =
            List.length results - failed
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
