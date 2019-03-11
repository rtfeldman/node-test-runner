module Test.Runner.JsMessage exposing (JsMessage(..), decoder)

import Json.Decode as Decode exposing (Decoder)


type JsMessage
    = Test Int
    | Summary Float Int (List ( List String, String ))


decoder : Decoder JsMessage
decoder =
    Decode.field "type" Decode.string
        |> Decode.andThen decodeMessageFromType


decodeMessageFromType : String -> Decoder JsMessage
decodeMessageFromType messageType =
    case messageType of
        "TEST" ->
            Decode.field "index" Decode.int
                |> Decode.map Test

        "SUMMARY" ->
            Decode.map3 Summary
                (Decode.field "duration" Decode.float)
                (Decode.field "failures" Decode.int)
                (Decode.field "todos" (Decode.list todoDecoder))

        _ ->
            Decode.fail ("Unrecognized message type: " ++ messageType)


todoDecoder : Decoder ( List String, String )
todoDecoder =
    Decode.map2 (\a b -> ( a, b ))
        (Decode.field "labels" (Decode.list Decode.string))
        (Decode.field "todo" Decode.string)
