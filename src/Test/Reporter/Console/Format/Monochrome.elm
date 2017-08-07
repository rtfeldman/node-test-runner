module Test.Reporter.Console.Format.Monochrome exposing (equalityToString)

import Diff exposing (Change(..))
import Test.Reporter.Console.Format exposing (verticalBar)


equalityToString : { operation : String, expected : String, actual : String } -> String
equalityToString { operation, expected, actual } =
    -- TODO make sure this looks reasonable for multiline strings
    let
        ( formattedExpected, belowFormattedExpected ) =
            Diff.diff (String.toList expected) (String.toList actual)
                |> List.map formatExpectedChange
                |> List.unzip

        ( formattedActual, belowFormattedActual ) =
            Diff.diff (String.toList actual) (String.toList expected)
                |> List.map formatActualChange
                |> List.unzip

        combinedExpected =
            String.join "\n"
                [ String.join "" formattedExpected
                , String.join "" belowFormattedExpected
                ]

        combinedActual =
            String.join "\n"
                [ String.join "" formattedActual
                , String.join "" belowFormattedActual
                ]
    in
    verticalBar operation combinedExpected combinedActual


formatExpectedChange : Change Char -> ( String, String )
formatExpectedChange diff =
    case diff of
        Added char ->
            ( "", "" )

        Removed char ->
            ( String.fromChar char, "▲" )

        NoChange char ->
            ( String.fromChar char, " " )


formatActualChange : Change Char -> ( String, String )
formatActualChange diff =
    case diff of
        Added char ->
            ( "", "" )

        Removed char ->
            ( "▼", String.fromChar char )

        NoChange char ->
            ( " ", String.fromChar char )
