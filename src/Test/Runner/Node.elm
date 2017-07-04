port module Test.Runner.Node exposing (TestProgram, runWithOptions)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs run, runWithOptions, TestProgram

-}

import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Native.RunTest
import Platform
import Task exposing (Task)
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report(..), RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (TestResult)
import Test.Runner exposing (Runner, SeededRunners(..))
import Test.Runner.Node.App as App
import Time exposing (Time)


{-| Execute the given thunk.

If it throws an exception, return a failure instead of crashing.

-}
runThunk : (() -> List Expectation) -> List Expectation
runThunk =
    Native.RunTest.runThunk


port receive : ({ message : String } -> msg) -> Sub msg


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId Runner
    , startTime : Time
    , runInfo : RunInfo
    , testReporter : TestReporter
    , autoFail : Maybe String
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Value (App.Model Msg Model) (App.Msg Msg)


type Msg
    = Receive String
    | Dispatch TestId Time
    | Complete TestId (List String) (List Expectation) Time Time
    | Summary (List TestResult) Time


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
                expectations =
                    runThunk run

                complete =
                    Complete testId labels expectations startTime

                available =
                    Dict.remove testId model.available
            in
            Task.perform complete Time.now


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive str ->
            let
                cmd =
                    if str == "BEGIN" then
                        sendBegin model
                    else if str == "SUMMARY" then
                        sendSummary model
                    else
                        case String.toInt str of
                            Ok index ->
                                if index >= model.runInfo.testCount then
                                    -- TODO send something more proper
                                    send "{\"type\": \"FINISHED\"}"
                                else
                                    Task.perform (Dispatch index) Time.now

                            Err err ->
                                -- TODO send an ERROR message
                                Cmd.none
            in
            ( model, cmd )

        Dispatch index startTime ->
            ( model, dispatch model index startTime )

        Summary completed finishTime ->
            let
                failed =
                    completed
                        |> List.filter (.expectations >> List.all ((/=) Expect.pass))
                        |> List.length

                duration =
                    finishTime - model.startTime

                summary =
                    testReporter.reportSummary duration model.autoFail completed

                exitCode =
                    if failed > 0 then
                        2
                    else if model.autoFail /= Nothing then
                        3
                    else
                        0

                cmd =
                    Encode.object
                        [ ( "type", Encode.string "FINISHED" )
                        , ( "exitCode", Encode.int exitCode )
                        , ( "format", Encode.string testReporter.format )
                        , ( "message", summary )
                        ]
                        |> Encode.encode 0
                        |> send
            in
            ( model, cmd )

        Complete testId labels expectations startTime endTime ->
            let
                result =
                    { labels = labels
                    , expectations = expectations
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
                        , ( "index", Encode.int testId )
                        , ( "format", Encode.string testReporter.format )
                        , ( "message", encodedOutcome )
                        ]
                        |> Encode.encode 0
                        |> send
            in
            ( model, cmd )


sendSummary : Model -> Cmd msg
sendSummary model =
    let
        maybeReport =
            model.testReporter.reportBegin model.runInfo
    in
    case maybeReport of
        Just report ->
            Encode.object
                [ ( "type", Encode.string "SUMMARY" )
                , ( "format", Encode.string model.testReporter.format )
                , ( "message", report )
                ]
                |> Encode.encode 0
                |> send

        Nothing ->
            Cmd.none


sendBegin : Model -> Cmd msg
sendBegin model =
    let
        maybeReport =
            model.testReporter.reportBegin model.runInfo
    in
    case maybeReport of
        Just report ->
            Encode.object
                [ ( "type", Encode.string "BEGIN" )
                , ( "format", Encode.string model.testReporter.format )
                , ( "testCount", Encode.int model.runInfo.testCount )
                , ( "message", report )
                ]
                |> Encode.encode 0
                |> send

        Nothing ->
            Cmd.none


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
            , startTime = startTime
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
        , subscriptions = \_ -> receive (.message >> Receive)
        }
