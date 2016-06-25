module Test.Runner.Node exposing (run, runWithOptions)

{-| # Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 1 if any failed.

@docs run, runWithOptions
-}

import Test exposing (Test)
import Expect exposing (Expectation)
import Html
import Dict exposing (Dict)
import Task
import Set exposing (Set)
import Test.Runner.Html.App
import Json.Encode as Encode exposing (Value)
import Random.Pcg as Random
import Time exposing (Time)
import String


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, List Expectation ))
    , running : Set TestId
    , queue : List TestId
    , completed : List ( List String, List Expectation )
    , startTime : Time
    , finishTime : Maybe Time
    }


type Msg
    = Dispatch
    | Finish Time


failuresToChalk : List String -> List String -> Value
failuresToChalk labels messages =
    let
        ( maybeLastLabel, otherLabels ) =
            case labels of
                [] ->
                    ( Nothing, [] )

                first :: rest ->
                    ( Just first, List.reverse rest )

        outputMessage message =
            case maybeLastLabel of
                Just lastContext ->
                    [ { styles = [ "red" ], text = "✗ " ++ lastContext ++ "\n" }
                    , { styles = [], text = "\n" ++ indent message ++ "\n\n" }
                    ]

                Nothing ->
                    [ { styles = [], text = indent message ++ "\n\n" } ]

        outputContext =
            otherLabels
                |> List.map (\message -> { styles = [ "dim" ], text = "↓ " ++ message ++ "\n" })
    in
        (outputContext :: (List.map outputMessage messages))
            |> List.concat
            |> List.map encodeChalk
            |> Encode.list


indent : String -> String
indent str =
    str
        |> String.split "\n"
        |> List.map ((++) "    ")
        |> String.join "\n"


encodeChalk : { styles : List String, text : String } -> Value
encodeChalk { styles, text } =
    Encode.object
        [ ( "styles", Encode.list (List.map Encode.string styles) )
        , ( "text", Encode.string text )
        ]


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
                        |> List.filter (snd >> List.all ((/=) Expect.pass))
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
                        |> List.map encodeChalk
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

        Dispatch ->
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
                                result =
                                    run ()

                                completed =
                                    model.completed ++ [ result ]

                                available =
                                    Dict.remove testId model.available

                                newModel =
                                    { model
                                        | completed = completed
                                        , available = available
                                        , queue = newQueue
                                    }

                                cmd =
                                    chalkAllFailures emit result
                            in
                                ( newModel, Cmd.batch [ cmd, dispatch ] )


never : Never -> a
never a =
    never a


chalkAllFailures : Emitter Msg -> ( List String, List Expectation ) -> Cmd Msg
chalkAllFailures emit ( labels, expectations ) =
    case List.filterMap Expect.getFailure expectations of
        [] ->
            Cmd.none

        failures ->
            emit ( "CHALK", failuresToChalk labels failures )


dispatch : Cmd Msg
dispatch =
    Task.succeed Dispatch
        |> Task.perform identity identity


formatDuration : Time -> String
formatDuration time =
    toString time ++ " ms"


init : Time -> List (() -> ( List String, List Expectation )) -> ( Model, Cmd Msg )
init startTime thunks =
    let
        indexedThunks : List ( TestId, () -> ( List String, List Expectation ) )
        indexedThunks =
            List.indexedMap (,) thunks

        model =
            { available = Dict.fromList indexedThunks
            , running = Set.empty
            , queue = List.map fst indexedThunks
            , completed = []
            , startTime = startTime
            , finishTime = Nothing
            }
    in
        ( model, dispatch )


type alias Emitter msg =
    ( String, Value ) -> Cmd msg


{-| Run the test and report the results.

Fuzz tests use a default run count of 100, and an initial seed based on the
system time when the test runs begin.
-}
run : Emitter Msg -> Test -> Program Never
run =
    runWithOptions Nothing Nothing


{-| Run the test using the provided options. If `Nothing` is provided for either
`runs` or `seed`, it will fall back on the options used in [`run`](#run).
-}
runWithOptions : Maybe Int -> Maybe Random.Seed -> Emitter Msg -> Test -> Program Never
runWithOptions runs seed emit =
    Test.Runner.Html.App.run
        { runs = runs
        , seed = seed
        }
        { init = init
        , update = update emit
        , view = \_ -> Html.text "This should be run in Node, not in a browser!"
        , subscriptions = \_ -> Sub.none
        }
