port module Test.Runner.Node exposing (TestProgram, run)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs run, TestProgram

-}

import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode exposing (Value)
import Platform
import Random
import Task exposing (Task)
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report(..), RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome(..), TestResult, isFailure, outcomesFromExpectations)
import Test.Runner exposing (Runner, SeededRunners(..))
import Test.Runner.JsMessage as JsMessage exposing (JsMessage(..))
import Time exposing (Posix)


-- TYPES


type alias TestId =
    Int


type alias InitArgs =
    { initialSeed : Int
    , processes : Int
    , paths : List String
    , fuzzRuns : Int
    , runners : SeededRunners
    , report : Report
    }


type alias RunnerOptions =
    { seed : Int
    , runs : Maybe Int
    , report : Report
    , paths : List String
    , processes : Int
    }


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
    Platform.Program Int Model Msg


type Msg
    = Receive Decode.Value
    | Dispatch Posix
    | Complete (List String) (List Outcome) Posix Posix


port send : String -> Cmd msg


warn : String -> a -> a
warn str result =
    let
        _ =
            Debug.log str
    in
    result


dispatch : Model -> Posix -> Cmd Msg
dispatch model startTime =
    case Dict.get model.nextTestToRun model.available of
        Nothing ->
            -- We're finished! Nothing left to run.
            sendResults True model.testReporter model.results

        Just config ->
            let
                outcomes =
                    outcomesFromExpectations (config.run ())
            in
            Time.now
                |> Task.perform (Complete config.labels outcomes startTime)


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
                                , ( "message", Encode.string (Decode.errorToString err) )
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
                    Time.posixToMillis endTime - Time.posixToMillis startTime

                prependOutcome outcome rest =
                    ( model.nextTestToRun
                    , { labels = labels, outcome = outcome, duration = duration }
                    )
                        :: rest

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
            ( String.fromInt testId, testReporter.reportComplete result ) :: list
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


init : InitArgs -> Int -> ( Model, Cmd Msg )
init { processes, paths, fuzzRuns, initialSeed, report, runners } startTimeMs =
    let
        startTime =
            Time.millisToPosix startTimeMs

        { indexedRunners, autoFail } =
            case runners of
                Plain runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
                    , autoFail = Nothing
                    }

                Only runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
                    , autoFail = Just "Test.only was used"
                    }

                Skipping runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
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


{-| Run the tests.
-}
run : RunnerOptions -> Test -> Program Int Model Msg
run { runs, seed, report, paths, processes } test =
    let
        fuzzRuns =
            Maybe.withDefault defaultRunCount runs

        runners =
            Test.Runner.fromTest fuzzRuns (Random.initialSeed seed) test

        wrappedInit =
            init
                { initialSeed = seed
                , processes = processes
                , paths = paths
                , fuzzRuns = fuzzRuns
                , runners = runners
                , report = report
                }
    in
    Platform.worker
        { init = wrappedInit
        , update = update
        , subscriptions = \_ -> receive Receive
        }


defaultRunCount : Int
defaultRunCount =
    100


port receive : (Decode.Value -> msg) -> Sub msg
