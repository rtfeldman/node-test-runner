module Test.Runner.Node exposing (run, runWithOptions, TestProgram)

{-| # Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 1 if any failed.

@docs run, runWithOptions, TestProgram
-}

import Test.Reporter.Reporter exposing (TestReporter, Report(..), createReporter)
import Test.Reporter.Result exposing (Failure, TestResult)
import Test.Runner.Node.App as App
import Test exposing (Test)
import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Set exposing (Set)
import Task
import Time exposing (Time)
import Tuple
import Platform


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, List Expectation ))
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
    | Complete TestId ( List String, List Expectation ) Time Time
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
                    |> warn "Attempted to Dispatch when all tests completed!"

        Complete testId ( labels, expectations ) startTime endTime ->
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

                        Just run ->
                            let
                                complete =
                                    Complete testId (run ()) startTime

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
       , startTime : Time
       , thunks : List (() -> ( List String, List Expectation ))
       , report : Report
       }
    -> ( Model, Cmd Msg )
init emit { startTime, initialSeed, thunks, report } =
    let
        indexedThunks : List ( TestId, () -> ( List String, List Expectation ) )
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

        reportCmd =
            emit
                ( "STARTED"
                , Encode.object
                    [ ( "format", Encode.string testReporter.format )
                    , ( "message", testReporter.reportBegin { testCount = testCount, initialSeed = initialSeed } )
                    ]
                )
    in
        ( model, Cmd.batch [ dispatch, reportCmd ] )


{-| Run the test and report the results.

Fuzz tests use a default run count of 100, and an initial seed based on the
system time when the test runs begin.
-}
run : Emitter Msg -> Test -> TestProgram
run =
    runWithOptions defaultOptions


{-| The default Options for runWithOptions.
-}
defaultOptions : Options
defaultOptions =
    { runs = 100
    , seed = Nothing
    }


{-| The Options you can pass to runWithOptions.
-}
type alias Options =
    { runs : Int
    , seed : Maybe Int
    }


{-| Run the test using the provided options. If `Nothing` is provided for either
`runs` or `seed`, it will fall back on the options used in [`run`](#run).
-}
runWithOptions :
    { a | runs : Int, seed : Maybe Int }
    -> Emitter Msg
    -> Test
    -> TestProgram
runWithOptions { runs, seed } emit =
    App.run
        { runs = runs
        , seed = seed
        }
        { init = init emit
        , update = update emit
        , subscriptions = \_ -> Sub.none
        }
