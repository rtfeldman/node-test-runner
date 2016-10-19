module Test.Browser exposing (..)

import Json.Decode as Decode exposing (Value, Decoder)
import Json.Encode as Encode
import Expect exposing (Expectation)


type BrowserTest
    = BrowserTest String (() -> EffectTest Value)


type EffectTest val
    = PortEffect String Value (Decoder Expectation)
    | ChainedEffect (EffectTest val) (val -> EffectTest val)
    | ResolvedEffect Expectation


type alias QuerySelector =
    String


type Step
    = Visit String
    | Title (String -> Expectation)
    | Text QuerySelector (String -> Expectation)
    | ClickLink String
    | Url (String -> Expectation)


test : String -> (() -> List Step) -> BrowserTest
test str thunk =
    BrowserTest str (thunk >> List.reverse >> stepsToBrowserEffect)



-- HELPERS --


stepsToBrowserEffect : List Step -> EffectTest val
stepsToBrowserEffect steps =
    case steps of
        [] ->
            ResolvedEffect Expect.pass

        step :: rest ->
            List.foldl chain (stepToBrowserEffect step) rest


chain : Step -> EffectTest val -> EffectTest val
chain nextStep result =
    ChainedEffect (stepToBrowserEffect nextStep) (\_ -> result)


decodeToExpectation : Decoder val -> (val -> Expectation) -> Value -> Expectation
decodeToExpectation decoder getExpectation raw =
    case Decode.decodeValue decoder raw of
        Ok val ->
            getExpectation val

        Err str ->
            Expect.fail ("Error decoding value: " ++ str ++ " - " ++ toString raw)


fireAndForget : String -> Value -> EffectTest val
fireAndForget str val =
    PortEffect str val (Decode.succeed Expect.pass)


stepToBrowserEffect : Step -> EffectTest val
stepToBrowserEffect step =
    case step of
        Visit url ->
            fireAndForget "VISIT" (Encode.string url)

        Title getExpectation ->
            Decode.map getExpectation Decode.string
                |> PortEffect "TITLE" (Encode.null)

        Text querySelector getExpectation ->
            Decode.map getExpectation Decode.string
                |> PortEffect "TEXT" (Encode.string querySelector)

        ClickLink linkName ->
            fireAndForget "CLICK_LINK" (Encode.string linkName)

        Url getExpectation ->
            Decode.map getExpectation Decode.string
                |> PortEffect "URL" (Encode.null)
