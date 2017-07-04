module Test.Reporter.TestResults exposing (Failure, Outcome(..), TestResult, encodeFailure, encodeOutcome, encodeTestResult, isFailure, isTodo, outcomeFromExpectation, testResultDecoder)

import Expect exposing (Expectation)
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode exposing (Value)
import Test.Runner
import Time exposing (Time)


type Outcome
    = Passed
    | Todo String
    | Failed Failure


type alias TestResult =
    { labels : List String
    , outcomes : List Outcome
    , duration : Time
    }


type alias Failure =
    { given : Maybe String, message : String }


testResultDecoder : Decoder TestResult
testResultDecoder =
    Decode.map3
        TestResult
        (Decode.field "labels" (Decode.list Decode.string))
        (Decode.field "outcomes" (Decode.list outcomeDecoder))
        (Decode.field "duration" Decode.float)


outcomeDecoder : Decoder Outcome
outcomeDecoder =
    Decode.field "type" Decode.string
        |> Decode.andThen outcomeFromTypeDecoder


outcomeFromTypeDecoder : String -> Decoder Outcome
outcomeFromTypeDecoder outcomeType =
    case outcomeType of
        "PASS" ->
            Decode.succeed Passed

        "FAIL" ->
            Decode.field "failure" failureDecoder
                |> Decode.map Failed

        "TODO" ->
            Decode.field "message" Decode.string
                |> Decode.map Todo

        _ ->
            Decode.fail ("Unrecognized outcome type: " ++ outcomeType)


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

        Failed failure ->
            Encode.object
                [ ( "type", Encode.string "FAIL" )
                , ( "failure", encodeFailure failure )
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


outcomeFromExpectation : Expectation -> Outcome
outcomeFromExpectation expectation =
    case Test.Runner.getFailure expectation of
        Just failure ->
            if Test.Runner.isTodo expectation then
                Todo failure.message
            else
                Failed failure

        Nothing ->
            Passed


encodeTestResult : TestResult -> Value
encodeTestResult { labels, outcomes, duration } =
    Encode.object
        [ ( "labels", Encode.list (List.map Encode.string labels) )
        , ( "outcomes", Encode.list (List.map encodeOutcome outcomes) )
        , ( "duration", Encode.float duration )
        ]
