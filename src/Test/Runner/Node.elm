module Test.Runner.Node exposing (run, runWithOptions, runWithBrowserOptions, defaultOptions)

{-| # Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 1 if any failed.

@docs run, runWithOptions, runWithBrowserOptions, defaultOptions
-}

import Test.Reporter.Reporter exposing (TestReporter, Report(..), createReporter)
import Test.Reporter.Result exposing (Failure, TestResult)
import Test.Runner.Node.App as App exposing (ExpectationsOrEffects(..))
import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Json.Decode as Decode exposing (Decoder)
import Set exposing (Set)
import Task
import Test exposing (Test)
import Test.Browser exposing (..)
import Time exposing (Time)


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, ExpectationsOrEffects ))
    , running : Set TestId
    , queue : List TestId
    , maybePending : Maybe ( TestId, Value -> ( List String, EffectTest Value ) )
    , startTime : Time
    , finishTime : Maybe Time
    , completed : List TestResult
    , testReporter : TestReporter
    }


type alias Emitter msg =
    ( String, Value ) -> Cmd msg


type Msg
    = Dispatch Time
    | DispatchNext
    | Complete TestId ( List String, List Expectation ) Time Time
    | Finish Time
    | RunPending Value
    | Receive ReceivedValue


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
        DispatchNext ->
            ( model, Task.perform never Dispatch Time.now )

        RunPending val ->
            case model.maybePending of
                Just ( testId, getPendingTests ) ->
                    let
                        ( maybeNext, cmd ) =
                            runEffectTest emit testId (getPendingTests val)

                        maybePending =
                            Maybe.map (\fn -> ( testId, \val -> fn val )) maybeNext
                    in
                        ( { model | maybePending = maybePending }, cmd )

                Nothing ->
                    -- When it's time to RunPending and we're out of pending tests,
                    -- that means it's time to quit Webdriver.
                    ( model, emitWebdriver emit "QUIT" Encode.null )

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
                    ( model, Task.perform never Finish Time.now )

                testId :: newQueue ->
                    case Dict.get testId model.available of
                        Nothing ->
                            ( model, Cmd.none )
                                |> warn ("Could not find testId " ++ toString testId)

                        Just run ->
                            let
                                available =
                                    Dict.remove testId model.available

                                ( maybePending, cmd ) =
                                    runTest emit startTime testId (run ())

                                newModel =
                                    { model
                                        | available = available
                                        , queue = newQueue
                                        , maybePending = maybePending
                                    }
                            in
                                ( newModel, cmd )

        Receive receivedValue ->
            -- TODO do more interesting stuff with receivedValue
            ( model, Cmd.none )


runTest : Emitter Msg -> Time -> TestId -> ( List String, ExpectationsOrEffects ) -> ( Maybe ( TestId, Value -> ( List String, EffectTest Value ) ), Cmd Msg )
runTest emit startTime testId ( labels, expectationsOrEffects ) =
    case expectationsOrEffects of
        Expectations expectations ->
            let
                complete =
                    Complete testId ( labels, expectations ) startTime
            in
                ( Nothing, Task.perform never complete Time.now )

        Effects effectTest ->
            let
                ( maybeNext, cmd ) =
                    runEffectTest emit testId ( labels, ChainedEffect initEffectTest (\_ -> effectTest) )
            in
                ( Maybe.map (\fn -> ( testId, \val -> fn val )) maybeNext
                , cmd
                )


runEffectTest : Emitter Msg -> TestId -> ( List String, EffectTest Value ) -> ( Maybe (Value -> ( List String, EffectTest Value )), Cmd Msg )
runEffectTest emit testId ( labels, effectTest ) =
    case effectTest of
        NoEffect ->
            ( Nothing, Cmd.none )

        ChainedEffect currentTest runNextTest ->
            let
                -- ( Maybe ( TestId, Value -> ( List String, EffectTest Value ) ), Cmd Msg )
                ( maybeNext, cmd ) =
                    runEffectTest emit testId ( labels, currentTest )
            in
                case maybeNext of
                    Just getTest ->
                        ( Just (\val -> ( labels, ChainedEffect (snd (getTest val)) runNextTest )), cmd )

                    Nothing ->
                        ( Just (\val -> ( labels, runNextTest val )), cmd )

        PortEffect cmdType payload handler ->
            -- TODO pretty bad sign that handler is unused here...
            ( Nothing, emitWebdriver emit cmdType payload )


emitWebdriver : Emitter Msg -> String -> Value -> Cmd Msg
emitWebdriver emit cmdType payload =
    emit
        ( "WEBDRIVER"
        , Encode.object
            [ ( "cmd", Encode.string cmdType )
            , ( "val", payload )
            ]
        )


initEffectTest : EffectTest Value
initEffectTest =
    PortEffect "INIT" (Encode.string "chrome") (\_ -> Expect.pass)


never : Never -> a
never a =
    never a


dispatch : Cmd Msg
dispatch =
    Task.perform never Dispatch Time.now


init :
    Emitter Msg
    -> { initialSeed : Int
       , startTime : Time
       , thunks : List (() -> ( List String, ExpectationsOrEffects ))
       , report : Report
       }
    -> ( Model, Cmd Msg )
init emit { startTime, initialSeed, thunks, report } =
    let
        indexedThunks : List ( TestId, () -> ( List String, ExpectationsOrEffects ) )
        indexedThunks =
            List.indexedMap (,) thunks

        testCount =
            List.length indexedThunks

        testReporter =
            createReporter report

        model =
            { available = Dict.fromList indexedThunks
            , running = Set.empty
            , queue = List.map fst indexedThunks
            , maybePending = Nothing
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
    App.run
        { runs = runs
        , seed = seed
        }
        { init = init emit
        , update = update emit
        , subscriptions = \_ -> Sub.none
        }
        (BrowserTest "" (\() -> NoEffect))


type alias Receive msg =
    (Value -> msg) -> Sub msg


decodeReceiveToMsg : Value -> Msg
decodeReceiveToMsg val =
    case Decode.decodeValue receiveTupleDecoder val of
        Ok msg ->
            msg

        Err str ->
            Receive (ErrReceiving str)


receiveTupleDecoder : Decoder Msg
receiveTupleDecoder =
    Decode.andThen (Decode.tuple2 (,) Decode.string Decode.value) (uncurry receiveDecoder)


receiveDecoder : String -> Value -> Decoder Msg
receiveDecoder msgType val =
    case msgType of
        "WEBDRIVER_FINISHED" ->
            Decode.succeed DispatchNext

        "WEBDRIVER_INITIALIZED" ->
            -- val contains the browser
            Decode.succeed (RunPending val)

        "WEBDRIVER_SUCCESS" ->
            Decode.succeed (RunPending Encode.null)

        "WEBDRIVER_VISIT" ->
            Decode.succeed (RunPending Encode.null)

        "WEBDRIVER_CLICK_LINK" ->
            Decode.succeed (RunPending Encode.null)

        "WEBDRIVER_URL" ->
            Decode.succeed (RunPending val)

        "WEBDRIVER_TEXT" ->
            Decode.succeed (RunPending val)

        "WEBDRIVER_TITLE" ->
            Decode.succeed (RunPending val)

        _ ->
            let
                _ =
                    Debug.log "Failed decoding " ( msgType, val )
            in
                Decode.fail ("Unrecognized msgType: " ++ msgType)


type ReceivedValue
    = ReceivedValue
    | ErrReceiving String


{-| Run the test using the provided options. If `Nothing` is provided for either
`runs` or `seed`, it will fall back on the options used in [`run`](#run).
-}
runWithBrowserOptions : Options -> Emitter Msg -> Receive Msg -> BrowserTest -> Test -> Program Value
runWithBrowserOptions { runs, seed } emit receive =
    App.run
        { runs = runs
        , seed = seed
        }
        { init = init emit
        , update = update emit
        , subscriptions = \_ -> receive decodeReceiveToMsg
        }
