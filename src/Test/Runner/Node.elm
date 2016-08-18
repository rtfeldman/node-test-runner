module Test.Runner.Node exposing (run, runWithOptions)

{-| # Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 1 if any failed.

@docs run, runWithOptions
-}

import Test exposing (Test)
import Test.Runner exposing (formatLabels)
import Expect exposing (Expectation)
import Chalk exposing (Chalk)
import Dict exposing (Dict)
import Task
import Set exposing (Set)
import Test.Runner.Node.App
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)
import String


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, List Expectation ))
    , running : Set TestId
    , queue : List TestId
    , startTime : Time
    , finishTime : Maybe Time
    , completed : List TestResult
    }


type alias TestResult =
    { labels : List String
    , expectations : List Expectation
    , duration : Time
    }


type Msg
    = Dispatch Time
    | Complete TestId ( List String, List Expectation ) Time Time
    | Finish Time


type alias Failure =
    { given : String, message : String }


failuresToChalk : List String -> List Failure -> List Chalk
failuresToChalk labels failures =
    labelsToChalk labels ++ List.concatMap failureToChalk failures


labelsToChalk : List String -> List Chalk
labelsToChalk =
    formatLabels (Chalk.withColorChar '↓' "dim") (Chalk.withColorChar '✗' "red")


failureToChalk : Failure -> List Chalk
failureToChalk { given, message } =
    let
        messageChalk =
            { styles = [], text = "\n" ++ indent message ++ "\n\n" }
    in
        if String.isEmpty given then
            [ messageChalk ]
        else
            [ { styles = [ "dim" ], text = "\nGiven " ++ given ++ "\n" }
            , messageChalk
            ]


indent : String -> String
indent str =
    str
        |> String.split "\n"
        |> List.map ((++) "    ")
        |> String.join "\n"


warn : String -> a -> a
warn str result =
    let
        _ =
            Debug.log str
    in
        result


update : Emitter Msg -> Msg -> Model -> ( Model, Cmd Msg )
update emit msg model =
    case msg of
        Finish finishTime ->
            let
                failed =
                    model.completed
                        |> List.filter (.expectations >> List.all ((/=) Expect.pass))
                        |> List.length

                passed =
                    (List.length model.completed) - failed

                duration =
                    finishTime - model.startTime

                headline =
                    if failed > 0 then
                        [ { styles = [ "underline", "red" ], text = "\nTEST RUN FAILED\n\n" } ]
                    else
                        [ { styles = [ "underline", "green" ], text = "\nTEST RUN PASSED\n\n" } ]

                stat label value =
                    [ { styles = [ "dim" ], text = label }
                    , { styles = [], text = value ++ "\n" }
                    ]

                summary =
                    [ headline
                    , stat "Duration: " (formatDuration duration)
                    , stat "Passed:   " (toString passed)
                    , stat "Failed:   " (toString failed)
                    ]
                        |> List.concat
                        |> List.map Chalk.encode
                        |> Encode.list

                exitCode =
                    if failed == 0 then
                        0
                    else
                        1

                data =
                    Encode.object
                        [ ( "exitCode", Encode.int exitCode )
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
            in
                ( newModel, Cmd.batch [ chalkAllFailures emit result, dispatch ] )

        Dispatch startTime ->
            case model.queue of
                [] ->
                    ( model, Task.perform never Finish Time.now )

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
                                ( newModel, Task.perform never complete Time.now )


never : Never -> a
never a =
    never a


chalkAllFailures : Emitter Msg -> TestResult -> Cmd Msg
chalkAllFailures emit { duration, labels, expectations } =
    case List.filterMap Expect.getFailure expectations of
        [] ->
            Cmd.none

        failures ->
            failuresToChalk labels failures
                |> chalkWith emit


dispatch : Cmd Msg
dispatch =
    Task.perform never Dispatch Time.now


formatDuration : Time -> String
formatDuration time =
    toString time ++ " ms"


init :
    Emitter Msg
    -> { initialSeed : Int
       , startTime : Time
       , thunks : List (() -> ( List String, List Expectation ))
       }
    -> ( Model, Cmd Msg )
init emit { startTime, initialSeed, thunks } =
    let
        indexedThunks : List ( TestId, () -> ( List String, List Expectation ) )
        indexedThunks =
            List.indexedMap (,) thunks

        testCount =
            List.length indexedThunks

        model =
            { available = Dict.fromList indexedThunks
            , running = Set.empty
            , queue = List.map fst indexedThunks
            , completed = []
            , startTime = startTime
            , finishTime = Nothing
            }

        reportCmd =
            reportBegin emit { testCount = testCount, initialSeed = initialSeed }
    in
        ( model, Cmd.batch [ dispatch, reportCmd ] )


reportBegin : Emitter Msg -> { testCount : Int, initialSeed : Int } -> Cmd Msg
reportBegin emit { testCount, initialSeed } =
    chalkWith emit <|
        [ { styles = []
          , text =
                "\nelm-test\n--------\n\nRunning "
                    ++ pluralize "test" "tests" testCount
                    ++ ". To reproduce these results, run: elm-test --seed "
                    ++ toString initialSeed
                    ++ "\n"
          }
        ]


pluralize : String -> String -> Int -> String
pluralize singular plural count =
    let
        suffix =
            if count == 1 then
                singular
            else
                plural
    in
        String.join " " [ toString count, suffix ]


chalkWith : Emitter Msg -> List Chalk -> Cmd Msg
chalkWith emit chalks =
    let
        encoded =
            chalks
                |> List.map Chalk.encode
                |> Encode.list
    in
        emit ( "CHALK", encoded )


type alias Emitter msg =
    ( String, Value ) -> Cmd msg


{-| Run the test and report the results.

Fuzz tests use a default run count of 100, and an initial seed based on the
system time when the test runs begin.
-}
run : Emitter Msg -> Test -> Program Value
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
runWithOptions : Options -> Emitter Msg -> Test -> Program Value
runWithOptions { runs, seed } emit =
    Test.Runner.Node.App.run
        { runs = runs
        , seed = seed
        }
        { init = init emit
        , update = update emit
        , subscriptions = \_ -> Sub.none
        }
