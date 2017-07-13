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
import Platform
import Task exposing (Task)
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report(..), RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome(..), TestResult, isFailure, outcomesFromExpectations)
import Test.Runner exposing (Runner, SeededRunners(..))
import Test.Runner.JsMessage as JsMessage exposing (JsMessage(..))
import Test.Runner.Node.App as App
import Time exposing (Time)


{-| Execute the given thunk.
-}
runThunk : (() -> List Expectation) -> List Expectation
runThunk thunk =
    thunk ()


port receive : (Decode.Value -> msg) -> Sub msg


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId Runner
    , runInfo : RunInfo
    , testReporter : TestReporter
    , results : List ( TestId, TestResult )
    , processes : Int
    , nextTestToRun : TestId
    , autoFail : Maybe String
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Value (App.Model Msg Model) (App.Msg Msg)


type Msg
    = Receive Decode.Value
    | Dispatch Time
    | Complete (List String) (List Outcome) Time Time


port send : String -> Cmd msg


warn : String -> a -> a
warn str result =
    let
        _ =
            Debug.log str
    in
    result


dispatch : Model -> Time -> Cmd Msg
dispatch model startTime =
    case Dict.get model.nextTestToRun model.available of
        Nothing ->
            -- We're finished! Nothing left to run.
            sendResults True model.testReporter model.results

        Just { labels, run } ->
            let
                outcomes =
                    outcomesFromExpectations (runThunk run)
            in
            Time.now
                |> Task.perform (Complete labels outcomes startTime)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive val ->
            case Decode.decodeValue JsMessage.decoder val of
                Ok (Summary duration failed todos) ->
                    let
                        testCount =
                            model.runInfo.testCount

                        summaryInfo =
                            { testCount = testCount
                            , passed = testCount - failed - List.length todos
                            , failed = failed
                            , todos = todos
                            , duration = duration
                            }

                        summary =
                            testReporter.reportSummary summaryInfo model.autoFail

                        exitCode =
                            if failed > 0 then
                                2
                            else if model.autoFail == Nothing && List.isEmpty todos then
                                0
                            else
                                3

                        cmd =
                            Encode.object
                                [ ( "type", Encode.string "SUMMARY" )
                                , ( "exitCode", Encode.int exitCode )
                                , ( "message", summary )
                                ]
                                |> Encode.encode 0
                                |> send
                    in
                    ( model, cmd )

                Ok (Test index) ->
                    let
                        cmd =
                            Task.perform Dispatch Time.now
                    in
                    if index == -1 then
                        ( { model | nextTestToRun = index + model.processes }
                        , Cmd.batch [ cmd, sendBegin model ]
                        )
                    else
                        ( { model | nextTestToRun = index }, cmd )

                Err err ->
                    let
                        cmd =
                            Encode.object
                                [ ( "type", Encode.string "ERROR" )
                                , ( "message", Encode.string err )
                                ]
                                |> Encode.encode 0
                                |> send
                    in
                    ( model, cmd )

        Dispatch startTime ->
            ( model, dispatch model startTime )

        Complete labels outcomes startTime endTime ->
            let
                duration =
                    endTime - startTime

                prependOutcome outcome results =
                    ( model.nextTestToRun
                    , { labels = labels, outcome = outcome, duration = duration }
                    )
                        :: results

                results =
                    List.foldl prependOutcome model.results outcomes

                nextTestToRun =
                    model.nextTestToRun + model.processes

                isFinished =
                    nextTestToRun >= model.runInfo.testCount
            in
            if isFinished || List.any isFailure outcomes then
                let
                    cmd =
                        sendResults isFinished testReporter results
                in
                if isFinished then
                    -- Don't bother updating the model, since we're done
                    ( model, cmd )
                else
                    -- Clear out the results, now that we've flushed them.
                    ( { model | nextTestToRun = nextTestToRun, results = [] }
                    , Cmd.batch
                        [ cmd
                        , Task.perform Dispatch Time.now
                        ]
                    )
            else
                ( { model | nextTestToRun = nextTestToRun, results = results }
                , Task.perform Dispatch Time.now
                )


countFailures : ( TestId, TestResult ) -> Int -> Int
countFailures ( _, { outcome } ) failures =
    case outcome of
        Failed _ ->
            failures + 1

        _ ->
            failures


sendResults : Bool -> TestReporter -> List ( TestId, TestResult ) -> Cmd msg
sendResults isFinished testReporter results =
    let
        typeStr =
            if isFinished then
                "FINISHED"
            else
                "RESULTS"

        addToKeyValues ( testId, result ) list =
            -- These are coming in in reverse order. Doing a foldl with ::
            -- means we reverse the list again, while also doing the conversion!
            ( toString testId, testReporter.reportComplete result ) :: list
    in
    Encode.object
        [ ( "type", Encode.string typeStr )
        , ( "results"
          , results
                |> List.foldl addToKeyValues []
                |> Encode.object
          )
        ]
        |> Encode.encode 0
        |> send


sendBegin : Model -> Cmd msg
sendBegin model =
    let
        baseFields =
            [ ( "type", Encode.string "BEGIN" )
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


init : App.InitArgs -> ( Model, Cmd Msg )
init { startTime, processes, paths, fuzzRuns, initialSeed, runners, report } =
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
            , processes = processes
            , nextTestToRun = 0
            , results = []
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
