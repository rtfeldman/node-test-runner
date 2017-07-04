module Test.Runner.JsMessage exposing (JsMessage(..), decoder)

import Json.Decode as Decode exposing (Decoder)
import Test.Reporter.TestResults exposing (TestResult, testResultDecoder)


type JsMessage
    = Begin
    | Test Int
    | Summary (List TestResult)


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

        "BEGIN" ->
            Decode.succeed Begin

        "SUMMARY" ->
            Decode.field "testResults" (Decode.list testResultDecoder)
                |> Decode.map Summary

        _ ->
            Decode.fail ("Unrecognized message type: " ++ messageType)
