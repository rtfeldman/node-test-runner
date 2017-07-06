port module Test.Runner.Node exposing (TestProgram, runWithOptions)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs run, runWithOptions, TestProgram

-}

import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode exposing (Value)
import Native.RunTest
import Platform
import Task exposing (Task)
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report(..), RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome(..), TestResult, encodeRawTestResult, isFailure, outcomeFromExpectation)
import Test.Runner exposing (Runner, SeededRunners(..))
import Test.Runner.JsMessage as JsMessage exposing (JsMessage(..))
import Test.Runner.Node.App as App
import Time exposing (Time)


{-| Execute the given thunk.

If it throws an exception, return a failure instead of crashing.

-}
runThunk : (() -> List Expectation) -> List Expectation
runThunk =
    Native.RunTest.runThunk


port receive : (Decode.Value -> msg) -> Sub msg


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId Runner
    , runInfo : RunInfo
    , testReporter : TestReporter
    , autoFail : Maybe String
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Value (App.Model Msg Model) (App.Msg Msg)


type Msg
    = Receive Decode.Value
    | Dispatch TestId Time
    | Complete TestId (List String) (List Outcome) Time Time


port send : String -> Cmd msg


warn : String -> a -> a
warn str result =
    let
        _ =
            Debug.log str
    in
    result


dispatch : Model -> TestId -> Time -> Cmd Msg
dispatch model testId startTime =
    case Dict.get testId model.available of
        Nothing ->
            Cmd.none
                |> warn ("Could not find testId " ++ toString testId)

        Just { labels, run } ->
            let
                outcomes =
                    runThunk run
                        |> List.map outcomeFromExpectation
            in
            Time.now
                |> Task.perform (Complete testId labels outcomes startTime)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive val ->
            let
                cmd =
                    case Decode.decodeValue JsMessage.decoder val of
                        Ok Begin ->
                            sendBegin model

                        Ok (Summary duration completed) ->
                            let
                                summary =
                                    testReporter.reportSummary duration model.autoFail completed

                                defaultExitCode =
                                    if model.autoFail == Nothing then
                                        0
                                    else
                                        3

                                exitCode =
                                    List.concatMap .outcomes completed
                                        |> getExitCode defaultExitCode
                            in
                            Encode.object
                                [ ( "type", Encode.string "SUMMARY" )
                                , ( "exitCode", Encode.int exitCode )
                                , ( "format", Encode.string model.testReporter.format )
                                , ( "message", summary )
                                ]
                                |> Encode.encode 0
                                |> send

                        Ok (Test index) ->
                            if index >= model.runInfo.testCount then
                                Encode.object
                                    [ ( "type", Encode.string "FINISHED" ) ]
                                    |> Encode.encode 0
                                    |> send
                            else
                                Task.perform (Dispatch index) Time.now

                        Err err ->
                            Encode.object
                                [ ( "type", Encode.string "ERROR" )
                                , ( "message", Encode.string err )
                                ]
                                |> Encode.encode 0
                                |> send
            in
            ( model, cmd )

        Dispatch index startTime ->
            ( model, dispatch model index startTime )

        Complete testId labels outcomes startTime endTime ->
            let
                result =
                    { labels = labels
                    , outcomes = outcomes
                    , duration = endTime - startTime
                    }

                encodedOutcome =
                    case testReporter.reportComplete result of
                        Just val ->
                            val

                        Nothing ->
                            Encode.null

                cmd =
                    Encode.object
                        [ ( "type", Encode.string "TEST_COMPLETED" )
                        , ( "summary", encodeRawTestResult result )
                        , ( "format", Encode.string testReporter.format )
                        , ( "message", encodedOutcome )
                        ]
                        |> Encode.encode 0
                        |> send
            in
            ( model, cmd )


getExitCode : Int -> List Outcome -> Int
getExitCode exitCode outcomes =
    case outcomes of
        [] ->
            exitCode

        Passed :: rest ->
            getExitCode exitCode rest

        (Todo _) :: rest ->
            getExitCode 4 rest

        (Failed _) :: rest ->
            2


encodeExpectation : Expectation -> Value
encodeExpectation expectation =
    let
        fields =
            if Test.Runner.isTodo expectation then
                [ ( "type", Encode.string "TODO" ) ]
            else
                case Test.Runner.getFailure expectation of
                    Nothing ->
                        [ ( "type", Encode.string "PASS" ) ]

                    Just { given, message } ->
                        [ ( "type", Encode.string "FAIL" )
                        , ( "message", Encode.string message )
                        , ( "given", Maybe.withDefault Encode.null (Maybe.map Encode.string given) )
                        ]
    in
    Encode.object fields


sendBegin : Model -> Cmd msg
sendBegin model =
    let
        baseFields =
            [ ( "type", Encode.string "BEGIN" )
            , ( "format", Encode.string model.testReporter.format )
            , ( "testCount", Encode.int model.runInfo.testCount )
            ]

        extraFields =
            case model.testReporter.reportBegin model.runInfo of
                Just report ->
                    [ ( "message", report ) ]

                Nothing ->
                    []
    in
    Encode.object (baseFields ++ extraFields)
        |> Encode.encode 0
        |> send


init :
    { initialSeed : Int
    , paths : List String
    , fuzzRuns : Int
    , startTime : Time
    , runners : SeededRunners
    , report : Report
    }
    -> ( Model, Cmd Msg )
init { startTime, paths, fuzzRuns, initialSeed, runners, report } =
    let
        { indexedRunners, autoFail } =
            case runners of
                Plain runnerList ->
                    { indexedRunners = List.indexedMap (,) runnerList
                    , autoFail = Nothing
                    }

                Only runnerList ->
                    { indexedRunners = List.indexedMap (,) runnerList
                    , autoFail = Just "Test.only was used"
                    }

                Skipping runnerList ->
                    { indexedRunners = List.indexedMap (,) runnerList
                    , autoFail = Just "Test.skip was used"
                    }

                Invalid str ->
                    { indexedRunners = []
                    , autoFail = Just str
                    }

        testCount =
            List.length indexedRunners

        testReporter =
            createReporter report

        model =
            { available = Dict.fromList indexedRunners
            , runInfo =
                { testCount = testCount
                , paths = paths
                , fuzzRuns = fuzzRuns
                , initialSeed = initialSeed
                }
            , testReporter = testReporter
            , autoFail = autoFail
            }
    in
    ( model, Cmd.none )


{-| Run the test using the provided options. If `Nothing` is provided for either
`runs` or `seed`, it will fall back on the options used in [`run`](#run).
-}
runWithOptions :
    App.RunnerOptions
    -> Test
    -> TestProgram
runWithOptions options =
    App.run options
        { init = init
        , update = update
        , subscriptions = \_ -> receive Receive
        }
