port module Test.Runner.Ports exposing (JsMessage(..), receive, sendBegin, sendError, sendReady, sendResult, sendSummary)

import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode


{-| The port names are prefixed to reduce the likelihood of the project
having a port with the same name, which is a compile error.
-}
port elmTestPort__send : Decode.Value -> Cmd msg


port elmTestPort__receive : (Decode.Value -> msg) -> Sub msg


sendBegin : Int -> Decode.Value -> Maybe Decode.Value -> Cmd msg
sendBegin testCount debugLogs maybeReport =
    let
        extraFields =
            case maybeReport of
                Just report ->
                    -- Test reporter specific:
                    [ ( "message", report ) ]

                Nothing ->
                    []
    in
    elmTestPort__send
        (Encode.object
            (( "type", Encode.string "BEGIN" )
                :: ( "testCount", Encode.int testCount )
                :: ( "debugLogs", debugLogs )
                :: extraFields
            )
        )


sendReady : List Int -> List Int -> Cmd msg
sendReady unitTests fuzzTests =
    elmTestPort__send
        (Encode.object
            [ ( "type", Encode.string "READY" )
            , ( "unitTests", Encode.list Encode.int unitTests )
            , ( "fuzzTests", Encode.list Encode.int fuzzTests )
            ]
        )


sendResult : Int -> Bool -> String -> List String -> Maybe String -> Decode.Value -> Decode.Value -> Cmd msg
sendResult testId isFuzzTest jsDefinitionName labels expectationElmCode debugLogs report =
    elmTestPort__send
        (Encode.object
            [ ( "type", Encode.string "RESULT" )
            , ( "testId", Encode.int testId )
            , ( "testType"
              , Encode.string
                    (if isFuzzTest then
                        "fuzz"

                     else
                        "unit"
                    )
              )
            , ( "jsDefinitionName", Encode.string jsDefinitionName )
            , ( "labels", Encode.list Encode.string labels )
            , ( "expectationElmCode", encodeMaybe Encode.string expectationElmCode )
            , ( "debugLogs", debugLogs )

            -- Test reporter specific:
            , ( "message", report )
            ]
        )


sendSummary : Int -> Decode.Value -> Cmd msg
sendSummary exitCode summary =
    elmTestPort__send
        (Encode.object
            [ ( "type", Encode.string "SUMMARY" )
            , ( "exitCode", Encode.int exitCode )

            -- Test reporter specific:
            , ( "message", summary )
            ]
        )


sendError : String -> Cmd msg
sendError message =
    elmTestPort__send
        (Encode.object
            [ ( "type", Encode.string "ERROR" )
            , ( "message", Encode.string message )
            ]
        )


encodeMaybe : (a -> Encode.Value) -> Maybe a -> Encode.Value
encodeMaybe encoder maybe =
    case maybe of
        Just a ->
            encoder a

        Nothing ->
            Encode.null


type JsMessage
    = RunUnitTest Int
    | RunFuzzTest Int
    | Summary Float Int (List ( List String, String ))


decoder : Decoder JsMessage
decoder =
    Decode.field "type" Decode.string
        |> Decode.andThen decodeMessageFromType


decodeMessageFromType : String -> Decoder JsMessage
decodeMessageFromType messageType =
    case messageType of
        "UNIT" ->
            Decode.map RunUnitTest
                (Decode.field "testId" Decode.int)

        "FUZZ" ->
            Decode.map RunFuzzTest
                (Decode.field "testId" Decode.int)

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


receive : (Result Decode.Error JsMessage -> msg) -> Sub msg
receive toMsg =
    elmTestPort__receive (Decode.decodeValue decoder >> toMsg)
