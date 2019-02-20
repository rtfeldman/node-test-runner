module Test.Reporter.Json exposing (reportBegin, reportComplete, reportSummary)

import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as TestResults exposing (Failure, Outcome(..), SummaryInfo, isFailure)
import Test.Runner.Failure exposing (InvalidReason(..), Reason(..))


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin { paths, fuzzRuns, testCount, initialSeed } =
    Encode.object
        [ ( "event", Encode.string "runStart" )
        , ( "testCount", Encode.string <| String.fromInt testCount )
        , ( "fuzzRuns", Encode.string <| String.fromInt fuzzRuns )
        , ( "paths", Encode.list Encode.string paths )
        , ( "initialSeed", Encode.string <| String.fromInt initialSeed )
        ]
        |> Just


reportComplete : TestResults.TestResult -> Value
reportComplete { duration, labels, outcome } =
    Encode.object
        [ ( "event", Encode.string "testCompleted" )
        , ( "status", Encode.string (getStatus outcome) )
        , ( "labels", encodeLabels labels )
        , ( "failures", Encode.list identity (encodeFailures outcome) )
        , ( "duration", Encode.string <| String.fromInt duration )
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
        |> Encode.list Encode.string


reportSummary : SummaryInfo -> Maybe String -> Value
reportSummary { duration, passed, failed, todos, testCount } autoFail =
    Encode.object
        [ ( "event", Encode.string "runComplete" )
        , ( "passed", Encode.string <| String.fromInt passed )
        , ( "failed", Encode.string <| String.fromInt failed )
        , ( "duration", Encode.string <| String.fromFloat duration )
        , ( "autoFail"
          , autoFail
                |> Maybe.map Encode.string
                |> Maybe.withDefault Encode.null
          )
        ]


encodeFailure : Failure -> Value
encodeFailure { given, description, reason } =
    Encode.object
        [ ( "given", Maybe.withDefault Encode.null (Maybe.map Encode.string given) )
        , ( "message", Encode.string description )
        , ( "reason", encodeReason description reason )
        ]


encodeReasonType : String -> Value -> Value
encodeReasonType reasonType data =
    Encode.object
        [ ( "type", Encode.string reasonType ), ( "data", data ) ]


encodeReason : String -> Reason -> Value
encodeReason description reason =
    case reason of
        Custom ->
            Encode.string description
                |> encodeReasonType "Custom"

        Equality expected actual ->
            [ ( "expected", Encode.string expected )
            , ( "actual", Encode.string actual )
            , ( "comparison", Encode.string description )
            ]
                |> Encode.object
                |> encodeReasonType "Equality"

        Comparison first second ->
            [ ( "first", Encode.string first )
            , ( "second", Encode.string second )
            , ( "comparison", Encode.string description )
            ]
                |> Encode.object
                |> encodeReasonType "Comparison"

        TODO ->
            Encode.string description
                |> encodeReasonType "TODO"

        Invalid BadDescription ->
            let
                explanation =
                    if description == "" then
                        "The empty string is not a valid test description."

                    else
                        "This is an invalid test description: " ++ description
            in
            Encode.string explanation
                |> encodeReasonType "Invalid"

        Invalid _ ->
            Encode.string description
                |> encodeReasonType "Invalid"

        ListDiff expected actual ->
            [ ( "expected", Encode.list Encode.string expected )
            , ( "actual", Encode.list Encode.string actual )
            ]
                |> Encode.object
                |> encodeReasonType "ListDiff"

        CollectionDiff { expected, actual, extra, missing } ->
            [ ( "expected", Encode.string expected )
            , ( "actual", Encode.string actual )
            , ( "extra", Encode.list Encode.string extra )
            , ( "missing", Encode.list Encode.string missing )
            ]
                |> Encode.object
                |> encodeReasonType "CollectionDiff"
