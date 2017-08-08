module Test.Reporter.Console.Format.Color exposing (equalityToString)

import Console
import Test.Reporter.Console.Format exposing (Highlight(..), highlightEqual, verticalBar)


equalityToString : { operation : String, expected : String, actual : String } -> String
equalityToString { operation, expected, actual } =
    case highlightEqual expected actual of
        Nothing ->
            verticalBar operation expected actual

        Just ( highlightedExpected, highlightedActual ) ->
            let
                formattedExpected =
                    highlightedExpected
                        |> List.map fromHighlight
                        |> String.join ""

                formattedActual =
                    highlightedActual
                        |> List.map fromHighlight
                        |> String.join ""
            in
            verticalBar operation formattedExpected formattedActual


fromHighlight : Highlight -> String
fromHighlight highlight =
    case highlight of
        Highlighted char ->
            Console.bgYellow (String.fromChar char)

        Plain char ->
            String.fromChar char
