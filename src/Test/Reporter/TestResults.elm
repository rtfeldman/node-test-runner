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
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode exposing (Value)
import Test.Runner
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
    { given : Maybe String, message : String }


failureDecoder : Decoder Failure
failureDecoder =
    Decode.map2
        Failure
        (Decode.field "given" (Decode.nullable Decode.string))
        (Decode.field "message" Decode.string)


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
encodeFailure { given, message } =
    Encode.object
        [ ( "given", Maybe.withDefault Encode.null (Maybe.map Encode.string given) )
        , ( "message", Encode.string message )

        -- TODO DEPRECATED - this never should have said "actual", because it
        -- is not in fact the "actual" value. It's deprecated but not removed yet.
        , ( "actual", Encode.string message )
        ]


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
            case Test.Runner.getFailure expectation of
                Nothing ->
                    [ Passed ]

                Just failure ->
                    if Test.Runner.isTodo expectation then
                        [ Todo failure.message ]
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
    case Test.Runner.getFailure expectation of
        Just failure ->
            if Test.Runner.isTodo expectation then
                { builder | todos = failure.message :: builder.todos }
            else
                { builder | failures = failure :: builder.failures }

        Nothing ->
            { builder | passes = builder.passes + 1 }
