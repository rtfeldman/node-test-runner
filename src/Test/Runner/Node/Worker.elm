module Test.Runner.Node.Worker exposing (run)

import Json.Encode as Encode exposing (Value)
import Json.Decode as Decode exposing ((:=))
import Script exposing (WorkerCommands)


type alias Model =
    { id : String }


update : WorkerCommands Msg -> Msg -> Model -> ( Model, Cmd Msg )
update commands msg model =
    case msg of
        RecordId id ->
            ( { model | id = id }
            , commands.send (Encode.string ("Hi, my name is Worker " ++ id ++ "!"))
            )

        SendError err ->
            ( model
            , commands.send (Encode.string ("Error on worker " ++ model.id ++ ": " ++ err))
            )

        NoOp ->
            ( model, Cmd.none )


receive : Value -> Msg
receive data =
    case Decode.decodeValue Decode.string data of
        Ok id ->
            RecordId id

        Err err ->
            SendError err


type Msg
    = NoOp
    | RecordId String
    | SendError String
