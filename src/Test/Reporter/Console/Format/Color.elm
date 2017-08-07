module Test.Reporter.Console.Format.Color exposing (equalityToString)

import Console
import Diff exposing (Change(..))
import Test.Reporter.Console.Format exposing (verticalBar)


equalityToString : { operation : String, expected : String, actual : String } -> String
equalityToString { operation, expected, actual } =
    -- TODO make sure this looks reasonable for multiline strings
    let
        formattedExpected =
            Diff.diff (String.toList expected) (String.toList actual)
                |> List.map formatExpectedChange
                |> String.join ""

        formattedActual =
            Diff.diff (String.toList actual) (String.toList expected)
                |> List.map formatActualChange
                |> String.join ""
    in
    verticalBar operation formattedExpected formattedActual


formatExpectedChange : Change Char -> String
formatExpectedChange diff =
    case diff of
        Added char ->
            ""

        Removed char ->
            Console.bgYellow (String.fromChar char)

        NoChange char ->
            String.fromChar char


formatActualChange : Change Char -> String
formatActualChange diff =
    case diff of
        Added char ->
            ""

        Removed char ->
            Console.bgYellow (String.fromChar char)

        NoChange char ->
            String.fromChar char
