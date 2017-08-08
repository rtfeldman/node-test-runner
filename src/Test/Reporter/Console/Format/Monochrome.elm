module Test.Reporter.Console.Format.Monochrome exposing (equalityToString)

import Test.Reporter.Console.Format exposing (Highlight(..), highlightEqual, verticalBar)


equalityToString : { operation : String, expected : String, actual : String } -> String
equalityToString { operation, expected, actual } =
    case highlightEqual expected actual of
        Nothing ->
            verticalBar operation expected actual

        Just ( highlightedExpected, highlightedActual ) ->
            let
                ( formattedExpected, expectedIndicators ) =
                    highlightedExpected
                        |> List.map (fromHighlight "▼")
                        |> List.unzip

                ( formattedActual, actualIndicators ) =
                    highlightedActual
                        |> List.map (fromHighlight "▲")
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
            verticalBar operation combinedExpected combinedActual


fromHighlight : String -> Highlight -> ( String, String )
fromHighlight indicator highlight =
    case highlight of
        Highlighted char ->
            ( String.fromChar char, indicator )

        Plain char ->
            ( String.fromChar char, " " )
