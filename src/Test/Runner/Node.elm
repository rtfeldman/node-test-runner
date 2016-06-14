module Test.Runner.Node exposing (run)

import Test exposing (Test)
import Assert exposing (Assertion)
import Html
import Dict exposing (Dict)
import Task
import Set exposing (Set)
import Test.Runner.Html.App
import Json.Encode as Encode exposing (Value)
import Random.Pcg as Random
import Script exposing (WorkerId, WorkerCommands, SupervisorCommands)
import Set exposing (Set)
import Test.Runner.Node.Worker as Worker
import Test.Runner.Node.Supervisor as Supervisor
import Html


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, List Assertion ))
    , running : Set TestId
    , queue : List TestId
    , completed : List ( List String, List Assertion )
    }


type Msg
    = Dispatch


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
                    [ { styles = [ "red" ], text = "✗ " ++ lastContext }
                    , { styles = [], text = "\n" ++ message ++ "\n\n" }
                    ]

                Nothing ->
                    [ { styles = [], text = message ++ "\n\n" } ]

        outputContext =
            otherLabels
                |> List.map (\message -> { styles = [ "dim" ], text = "↓ " ++ message })
    in
        (outputContext :: (List.map outputMessage messages))
            |> List.concat
            |> List.map encodeChalk
            |> Encode.list


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
        Dispatch ->
            case model.queue of
                [] ->
                    let
                        failures =
                            model.completed
                                |> List.filter (snd >> List.all ((/=) Assert.pass))
                                |> List.length

                        testsCompleted =
                            List.length model.completed

                        completedMessage =
                            toString testsCompleted ++ " ran in total."

                        message =
                            if failures == 0 then
                                "\n\nALL TESTS PASSED! " ++ completedMessage
                            else if failures == 1 then
                                "1 TEST FAILED! " ++ completedMessage
                            else
                                toString failures ++ " TESTS FAILED! " ++ completedMessage

                        exitCode =
                            if failures == 0 then
                                0
                            else
                                1

                        data =
                            Encode.object
                                [ ( "exitCode", Encode.int exitCode )
                                , ( "message", Encode.string message )
                                ]
                    in
                        ( model, emit ( "FINISHED", data ) )
                            |> warn "Attempted to Dispatch when all tests completed!"

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


chalkAllFailures : Emitter Msg -> ( List String, List Assertion ) -> Cmd Msg
chalkAllFailures emit ( labels, assertions ) =
    case List.filterMap Assert.getFailure assertions of
        [] ->
            Cmd.none

        failures ->
            emit ( "CHALK", failuresToChalk labels failures )


dispatch : Cmd Msg
dispatch =
    Task.succeed Dispatch
        |> Task.perform identity identity


init : List (() -> ( List String, List Assertion )) -> ( Model, Cmd Msg )
init thunks =
    let
        indexedThunks : List ( TestId, () -> ( List String, List Assertion ) )
        indexedThunks =
            List.indexedMap (,) thunks

        model =
            { available = Dict.fromList indexedThunks
            , running = Set.empty
            , queue = List.map fst indexedThunks
            , completed = []
            }
    in
        ( model, dispatch )


type alias Emitter msg =
    Value -> Cmd msg


type alias Listener msg =
    Value -> Cmd msg


run : Emitter Msg -> Test -> Program Never
run =
    runWithOptions Nothing Nothing


runWithOptions : Maybe Int -> Maybe Random.Seed -> Emitter Msg -> Test -> Program Never
runWithOptions runs seed emit =
    Script.program
        { worker =
            { update = Worker.update
            , receive = Worker.receive
            , init = ( (Worker.Model "0"), Cmd.none )
            , subscriptions = \_ -> Sub.none
            }
        , supervisor =
            { update = Supervisor.update
            , init = ( (Supervisor.Model [] Set.empty), Cmd.none )
            , receive = Supervisor.receive
            , subscriptions = \_ -> Sub.none
            , view = \_ -> Html.text "Running..."
            }
        , ports = ( send, receive identity )
        }
