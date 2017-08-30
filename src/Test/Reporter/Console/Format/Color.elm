module Test.Reporter.Console.Format.Color exposing (formatEquality)

import Console
import Test.Reporter.Highlightable as Highlightable exposing (Highlightable(..))


formatEquality : List (Highlightable Char) -> List (Highlightable Char) -> ( String, String )
formatEquality highlightedExpected highlightedActual =
    let
        formattedExpected =
            highlightedExpected
                |> List.map fromHighlightable
                |> String.join ""

        formattedActual =
            highlightedActual
                |> List.map fromHighlightable
                |> String.join ""
    in
    ( formattedExpected, formattedActual )


fromHighlightable : Highlightable Char -> String
fromHighlightable =
    Highlightable.resolve
        { fromHighlighted = String.fromChar >> Console.bgYellow
        , fromPlain = String.fromChar
        }
