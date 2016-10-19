module Test.Browser exposing (..)

import Json.Encode exposing (Value)
import Expect exposing (Expectation)


type BrowserTest
    = BrowserTest String (() -> EffectTest Value)


type EffectTest val
    = PortEffect String Value (Value -> Expectation)
    | ChainedEffect (EffectTest val) (val -> EffectTest val)
    | NoEffect


type Step
    = Visit String
    | Title
    | Text String
    | ClickLink String
    | Url


test : String -> (() -> List Step) -> BrowserTest
test str thunk =
    BrowserTest str (thunk >> List.reverse >> stepsToBrowserEffect)



-- HELPERS --


stepsToBrowserEffect : List Step -> EffectTest Value
stepsToBrowserEffect steps =
    case steps of
        [] ->
            NoEffect

        step :: rest ->
            List.foldl chain (stepToBrowserEffect step) rest


chain : Step -> EffectTest Value -> EffectTest Value
chain nextStep result =
    ChainedEffect (stepToBrowserEffect nextStep) (\_ -> result)


alwaysPass : a -> Expectation
alwaysPass _ =
    Expect.pass


stepToBrowserEffect : Step -> EffectTest Value
stepToBrowserEffect step =
    case step of
        Visit url ->
            PortEffect "VISIT" (Json.Encode.string url) alwaysPass

        Title ->
            -- TODO expect title to be something
            PortEffect "TITLE" (Json.Encode.null) alwaysPass

        Text querySelector ->
            -- TODO expect text to be something
            PortEffect "TEXT" (Json.Encode.string querySelector) alwaysPass

        ClickLink linkName ->
            PortEffect "CLICK_LINK" (Json.Encode.string linkName) alwaysPass

        Url ->
            -- TODO expect url to be something
            PortEffect "URL" (Json.Encode.null) alwaysPass
