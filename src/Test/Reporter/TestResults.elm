module Test.Reporter.TestResults
    exposing
        ( Failure
        , Outcome(..)
        , SummaryInfo
        , TestResult
        , encodeFailure
        , isFailure
        , isTodo
        , outcomesFromExpectations
        )

import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Test.Runner
import Test.Runner.Failure exposing (InvalidReason(..), Reason(..))
import Time exposing (Time)


type Outcome
    = Passed
    | Todo String
    | Failed (List Failure)


type alias TestResult =
    { labels : List String
    , outcome : Outcome
    , duration : Time
    }


type alias SummaryInfo =
    { testCount : Int
    , passed : Int
    , failed : Int
    , todos : List ( List String, String )
    , duration : Time
    }


type alias Failure =
    { given : Maybe String
    , description : String
    , reason : Reason
    }


encodeOutcome : Outcome -> Value
encodeOutcome outcome =
    case outcome of
        Passed ->
            Encode.object
                [ ( "type", Encode.string "PASS" ) ]

        Failed failures ->
            Encode.object
                [ ( "type", Encode.string "FAIL" )
                , ( "failures", Encode.list (List.map encodeFailure failures) )
                ]

        Todo message ->
            Encode.object
                [ ( "type", Encode.string "TODO" )
                , ( "message", Encode.string message )
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
        [ ( "type", Encode.string "custom" ), ( "data", data ) ]


encodeReason : String -> Reason -> Value
encodeReason description reason =
    case reason of
        Custom ->
            Encode.string description
                |> encodeReasonType "Custom"

        Equality expected actual ->
            [ ( "expected", Encode.string expected )
            , ( "actual", Encode.string actual )
            ]
                |> Encode.object
                |> encodeReasonType "Equality"

        Comparison first second ->
            [ ( "first", Encode.string first )
            , ( "second", Encode.string second )
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
            [ ( "expected", Encode.list (List.map Encode.string expected) )
            , ( "actual", Encode.list (List.map Encode.string actual) )
            ]
                |> Encode.object
                |> encodeReasonType "ListDiff"

        CollectionDiff { expected, actual, extra, missing } ->
            [ ( "expected", Encode.string expected )
            , ( "actual", Encode.string actual )
            , ( "extra", Encode.list (List.map Encode.string extra) )
            , ( "missing", Encode.list (List.map Encode.string missing) )
            ]
                |> Encode.object
                |> encodeReasonType "CollectionDiff"


isTodo : Outcome -> Bool
isTodo outcome =
    case outcome of
        Todo _ ->
            True

        _ ->
            False


isFailure : Outcome -> Bool
isFailure outcome =
    case outcome of
        Failed _ ->
            True

        _ ->
            False


outcomesFromExpectations : List Expectation -> List Outcome
outcomesFromExpectations expectations =
    case expectations of
        expectation :: [] ->
            -- Most often we'll get exactly 1 pass, so try that case first!
            case Test.Runner.getFailureReason expectation of
                Nothing ->
                    [ Passed ]

                Just failure ->
                    if Test.Runner.isTodo expectation then
                        [ Todo failure.description ]
                    else
                        [ Failed [ failure ] ]

        first :: rest ->
            let
                builder =
                    List.foldl outcomesFromExpectationsHelp
                        { passes = 0, todos = [], failures = [] }
                        expectations

                failuresList =
                    case builder.failures of
                        [] ->
                            []

                        failures ->
                            [ Failed failures ]
            in
            List.concat
                [ List.repeat builder.passes Passed
                , List.map Todo builder.todos
                , failuresList
                ]

        [] ->
            []


type alias OutcomeBuilder =
    { passes : Int, todos : List String, failures : List Failure }


outcomesFromExpectationsHelp : Expectation -> OutcomeBuilder -> OutcomeBuilder
outcomesFromExpectationsHelp expectation builder =
    case Test.Runner.getFailureReason expectation of
        Just failure ->
            if Test.Runner.isTodo expectation then
                { builder | todos = failure.description :: builder.todos }
            else
                { builder | failures = failure :: builder.failures }

        Nothing ->
            { builder | passes = builder.passes + 1 }
