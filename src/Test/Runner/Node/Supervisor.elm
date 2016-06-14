module Test.Runner.Node.Supervisor exposing (run)

import Json.Encode as Encode exposing (Value)
import Json.Decode as Decode exposing ((:=))
import Script exposing (SupervisorCommands, WorkerId)
import Set exposing (Set)
import String


type Msg
    = NoOp
    | Echo String
    | SendError String


type alias Model =
    { messagesReceived : List String
    , workerIds : Set WorkerId
    }


update : SupervisorCommands Msg -> Msg -> Model -> ( Model, Cmd Msg )
update commands msg model =
    case msg of
        Echo str ->
            let
                _ =
                    Debug.log str
            in
                ( model, Cmd.none )

        SendError err ->
            Debug.crash err

        NoOp ->
            ( model, Cmd.none )


receive : WorkerId -> Value -> Msg
receive id data =
    case Decode.decodeValue Decode.string data of
        Ok str ->
            Echo ("worker[" ++ id ++ "] says: " ++ str)

        Err err ->
            SendError ("worker[" ++ id ++ "] sent malformed example data:" ++ toString data)



--sub data =
--    case Decode.decodeValue (Decode.object2 (,) ("msgType" := Decode.string) ("data" := Decode.string)) data of
--        Ok ( "echo", msg ) ->
--            let
--                newMessagesReceived =
--                    model.messagesReceived ++ [ msg ]
--                output =
--                    "Here are all the messages I've received so far:\n"
--                        ++ (String.join "\n" newMessagesReceived)
--            in
--                ( { model | messagesReceived = newMessagesReceived }, Supervisor.emit (Encode.string output) )
--        Ok ( "echoViaWorker", workerId ) ->
--            ( model
--            , Supervisor.send workerId (Encode.string ("I have " ++ toString model.workerIds ++ " workers"))
--            )
--        Ok ( "spawn", workerId ) ->
--            ( { model | workerIds = Set.insert workerId model.workerIds }
--            , Supervisor.send workerId (Encode.string workerId)
--            )
--        Ok ( msgType, msg ) ->
--            Debug.crash ("Urecognized msgType: " ++ msgType ++ " with data: " ++ msg)
--        Err err ->
--            ( model, Supervisor.emit (Encode.string ("Error decoding message; error was: " ++ err)) )
