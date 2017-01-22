module Test.Runner.Node exposing (runWithOptions, TestProgram)

{-| # Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 1 if any failed.

@docs run, runWithOptions, TestProgram
-}

import Test.Reporter.Reporter exposing (TestReporter, Report(..), createReporter)
import Test.Reporter.Result exposing (Failure, TestResult)
import Test.Runner.Node.App as App exposing (LabeledThunk)
import Test exposing (Test)
import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Set exposing (Set)
import Task
import Time exposing (Time)
import Tuple
import Platform
import Native.RunTest


{-| Execute the given thunk.

If it throws an exception, return a failure instead of crashing.
-}
runThunk : (() -> List Expectation) -> List Expectation
runThunk =
    Native.RunTest.runThunk


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId LabeledThunk
    , running : Set TestId
    , queue : List TestId
    , startTime : Time
    , finishTime : Maybe Time
    , completed : List TestResult
    , testReporter : TestReporter
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Value (App.Model Msg Model) (App.Msg Msg)


type alias Emitter msg =
    ( String, Value ) -> Cmd msg


type Msg
    = Dispatch Time
    | Complete TestId (List String) (List Expectation) Time Time
    | Finish Time


warn : String -> a -> a
warn str result =
    let
        _ =
            Debug.log str
    in
        result


update : Emitter Msg -> Msg -> Model -> ( Model, Cmd Msg )
update emit msg ({ testReporter } as model) =
    case msg of
        Finish finishTime ->
            let
                failed =
                    model.completed
                        |> List.filter (.expectations >> List.all ((/=) Expect.pass))
                        |> List.length

                duration =
                    finishTime - model.startTime

                summary =
                    testReporter.reportSummary duration model.completed

                exitCode =
                    if failed == 0 then
                        0
                    else
                        1

                data =
                    Encode.object
                        [ ( "exitCode", Encode.int exitCode )
                        , ( "format", Encode.string testReporter.format )
                        , ( "message", summary )
                        ]
            in
                ( model, emit ( "FINISHED", data ) )

        Complete testId labels expectations startTime endTime ->
            let
                result =
                    { labels = labels
                    , expectations = expectations
                    , duration = endTime - startTime
                    }

                newModel =
                    { model | completed = result :: model.completed }

                reportCmd =
                    case (testReporter.reportComplete result) of
                        Just val ->
                            emit
                                ( "TEST_COMPLETED"
                                , Encode.object
                                    [ ( "format", Encode.string testReporter.format )
                                    , ( "message", val )
                                    ]
                                )

                        Nothing ->
                            Cmd.none
            in
                ( newModel, Cmd.batch [ reportCmd, dispatch ] )

        Dispatch startTime ->
            case model.queue of
                [] ->
                    ( model, Task.perform Finish Time.now )

                testId :: newQueue ->
                    case Dict.get testId model.available of
                        Nothing ->
                            ( model, Cmd.none )
                                |> warn ("Could not find testId " ++ toString testId)

                        Just { labels, thunk } ->
                            let
                                expectations =
                                    runThunk thunk

                                complete =
                                    Complete testId labels expectations startTime

                                available =
                                    Dict.remove testId model.available

                                newModel =
                                    { model
                                        | available = available
                                        , queue = newQueue
                                    }
                            in
                                ( newModel, Task.perform complete Time.now )


dispatch : Cmd Msg
dispatch =
    Task.perform Dispatch Time.now


init :
    Emitter Msg
    -> { initialSeed : Int
       , paths : List String
       , fuzzRuns : Int
       , startTime : Time
       , thunks : List LabeledThunk
       , report : Report
       }
    -> ( Model, Cmd Msg )
init emit { startTime, paths, fuzzRuns, initialSeed, thunks, report } =
    let
        indexedThunks : List ( TestId, LabeledThunk )
        indexedThunks =
            List.indexedMap (,) thunks

        testCount =
            List.length indexedThunks

        testReporter =
            createReporter report

        model =
            { available = Dict.fromList indexedThunks
            , running = Set.empty
            , queue = List.map Tuple.first indexedThunks
            , completed = []
            , startTime = startTime
            , finishTime = Nothing
            , testReporter = testReporter
            }

        maybeReport =
            testReporter.reportBegin
                { paths = paths
                , fuzzRuns = fuzzRuns
                , testCount = testCount
                , initialSeed = initialSeed
                }

        reportCmd =
            case maybeReport of
                Just report ->
                    emit
                        ( "STARTED"
                        , Encode.object
                            [ ( "format", Encode.string testReporter.format )
                            , ( "message", report )
                            ]
                        )

                Nothing ->
                    Cmd.none
    in
        ( model, Cmd.batch [ dispatch, reportCmd ] )


{-| Run the test using the provided options. If `Nothing` is provided for either
`runs` or `seed`, it will fall back on the options used in [`run`](#run).
-}
runWithOptions :
    App.RunnerOptions
    -> Emitter Msg
    -> Test
    -> TestProgram
runWithOptions options emit =
    App.run options
        { init = init emit
        , update = update emit
        , subscriptions = \_ -> Sub.none
        }
