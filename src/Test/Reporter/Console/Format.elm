module Test.Reporter.Console.Format exposing (Highlight(..), highlightEqual, verticalBar)

import Diff exposing (Change(..))


verticalBar : String -> String -> String -> String
verticalBar comparison expected actual =
    [ actual
    , "╵"
    , "│ " ++ comparison
    , "╷"
    , expected
    ]
        |> String.join "\n"


type Highlight
    = Highlighted Char
    | Plain Char


highlightEqual : String -> String -> Maybe ( List Highlight, List Highlight )
highlightEqual expected actual =
    if isFloat expected && isFloat actual then
        -- Diffing numbers looks silly. Don't bother.
        Nothing
    else
        Just
            ( toHighlight expected actual
            , toHighlight actual expected
            )


isFloat : String -> Bool
isFloat str =
    case String.toFloat str of
        Ok _ ->
            True

        Err _ ->
            False


toHighlight : String -> String -> List Highlight
toHighlight expected actual =
    -- TODO make sure this looks reasonable for multiline strings
    Diff.diff (String.toList expected) (String.toList actual)
        |> List.concatMap highlightFromDiff


highlightFromDiff : Change Char -> List Highlight
highlightFromDiff diff =
    case diff of
        Added char ->
            []

        Removed char ->
            [ Highlighted char ]

        NoChange char ->
            [ Plain char ]
