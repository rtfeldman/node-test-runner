module Test.Runner.Node exposing (run)

import Test exposing (Test)
import Assert exposing (Outcome)
import Html
import Dict exposing (Dict)
import Task
import Set exposing (Set)
import Test.Runner
import Json.Encode as Encode exposing (Value)


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> Outcome)
    , running : Set TestId
    , queue : List TestId
    , completed : List Outcome
    }


type Msg
    = Dispatch


failuresToChalk : { messages : List String, context : List String } -> Value
failuresToChalk { messages, context } =
    let
        ( maybeLastContext, otherContexts ) =
            case List.reverse context of
                [] ->
                    ( Nothing, [] )

                first :: rest ->
                    ( Just first, List.reverse rest )

        outputMessage message =
            case maybeLastContext of
                Just lastContext ->
                    [ { styles = [ "red" ], text = "✗ " ++ lastContext }
                    , { styles = [], text = "\n" ++ message ++ "\n\n" }
                    ]

                Nothing ->
                    [ { styles = [], text = message ++ "\n\n" } ]

        outputContext =
            otherContexts
                |> List.map (\message -> { styles = [ "dim" ], text = "↓ " ++ message })
    in
        (outputContext :: List.map outputMessage messages)
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
                        exitCode =
                            if List.all Assert.isSuccess model.completed then
                                0
                            else
                                1
                    in
                        ( model, emit ( "FINISHED", Encode.int exitCode ) )
                            |> warn "Attempted to Dispatch when all tests completed!"

                testId :: newQueue ->
                    case Dict.get testId model.available of
                        Nothing ->
                            ( model, Cmd.none )
                                |> warn ("Could not find testId " ++ toString testId)

                        Just run ->
                            let
                                outcome =
                                    run ()

                                completed =
                                    outcome :: model.completed

                                available =
                                    Dict.remove testId model.available

                                newModel =
                                    { model
                                        | completed = completed
                                        , available = available
                                        , queue = newQueue
                                    }

                                cmd =
                                    case Assert.toFailures outcome of
                                        Nothing ->
                                            Cmd.none

                                        Just failures ->
                                            emit ( "CHALK", failuresToChalk failures )
                            in
                                ( newModel, Cmd.batch [ cmd, dispatch ] )


dispatch : Cmd Msg
dispatch =
    Task.succeed Dispatch
        |> Task.perform identity identity


init : List (() -> Outcome) -> ( Model, Cmd Msg )
init thunks =
    let
        indexedThunks : List ( TestId, () -> Outcome )
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
    ( String, Value ) -> Cmd msg


run : Emitter Msg -> Test -> Program Never
run emit test =
    Test.Runner.run
        { test = test
        , init = init
        , update = update emit
        , view = \_ -> Html.text "This should be run in Node, not in a browser!"
        , subscriptions = \_ -> Sub.none
        }
