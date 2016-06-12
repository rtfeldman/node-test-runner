module Test.Runner.Node exposing (run)

import Test exposing (Suite)
import Test.Outcome exposing (Outcome)
import Html
import Dict exposing (Dict)
import Task
import Set exposing (Set)
import Test.Runner
import Json.Encode as Encode exposing (Value)
import Random.Pcg as Random


type alias TestId =
    Int


type alias Model =
    { available : Dict TestId (() -> ( List String, Outcome ))
    , running : Set TestId
    , queue : List TestId
    , completed : List Outcome
    }


type Msg
    = Dispatch


failuresToChalk : List String -> List String -> Value
failuresToChalk labels messages =
    let
        ( maybeLastLabel, otherLabels ) =
            case List.reverse labels of
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
                        exitCode =
                            if List.all ((/=) Test.Outcome.pass) model.completed then
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
                                ( labels, outcome ) =
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
                                    case Test.Outcome.toFailures outcome of
                                        Nothing ->
                                            Cmd.none

                                        Just failures ->
                                            emit ( "CHALK", failuresToChalk labels failures )
                            in
                                ( newModel, Cmd.batch [ cmd, dispatch ] )


dispatch : Cmd Msg
dispatch =
    Task.succeed Dispatch
        |> Task.perform identity identity


init : List (() -> ( List String, Outcome )) -> ( Model, Cmd Msg )
init thunks =
    let
        indexedThunks : List ( TestId, () -> ( List String, Outcome ) )
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


run : Emitter Msg -> Suite -> Program Never
run =
    runWithOptions Nothing Nothing


runWithOptions : Maybe Random.Seed -> Maybe Int -> Emitter Msg -> Suite -> Program Never
runWithOptions seed runs emit suite =
    Test.Runner.run
        { suite = suite
        , seed = seed
        , runs = runs
        , init = init
        , update = update emit
        , view = \_ -> Html.text "This should be run in Node, not in a browser!"
        , subscriptions = \_ -> Sub.none
        }
