module Test.Reporter.Console.Format.Monochrome exposing (formatEquality)

import Test.Reporter.Highlightable as Highlightable exposing (Highlightable(..))


formatEquality : List (Highlightable String) -> List (Highlightable String) -> ( String, String )
formatEquality highlightedExpected highlightedActual =
    let
        ( formattedExpected, expectedIndicators ) =
            highlightedExpected
                |> List.map (fromHighlightable "▲")
                |> List.unzip

        ( formattedActual, actualIndicators ) =
            highlightedActual
                |> List.map (fromHighlightable "▼")
                |> List.unzip

        combinedExpected =
            String.join "\n"
                [ String.join "" formattedExpected
                , String.join "" expectedIndicators
                ]

        combinedActual =
            String.join "\n"
                [ String.join "" actualIndicators
                , String.join "" formattedActual
                ]
    in
    ( combinedExpected, combinedActual )


fromHighlightable : String -> Highlightable String -> ( String, String )
fromHighlightable indicator =
    Highlightable.resolve
        { fromHighlighted = \char -> ( char, indicator )
        , fromPlain = \char -> ( char, " " )
        }
