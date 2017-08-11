module Test.Reporter.Format exposing (format, highlightEqual)

import Test.Reporter.Highlightable as Highlightable exposing (Highlightable)


-- import Test.Runner.Failure exposing (InvalidReason(BadDescription), Reason(..))


format =
    "TODO"



--
-- format : String -> Reason -> String
-- format description reason =
--     case reason of
--         Custom ->
--             description
--
--         Equality expected actual ->
--             equalityToString { operation = description, expected = expected, actual = actual }
--
--         Comparison first second ->
--             verticalBar description first second
--
--         TODO ->
--             description
--
--         Invalid BadDescription ->
--             if description == "" then
--                 "The empty string is not a valid test description."
--             else
--                 "This is an invalid test description: " ++ description
--
--         Invalid _ ->
--             description
--
--         ListDiff expected actual ->
--             listDiffToString 0
--                 description
--                 { expected = expected
--                 , actual = actual
--                 }
--                 { originalExpected = expected
--                 , originalActual = actual
--                 }
--
--         CollectionDiff { expected, actual, extra, missing } ->
--             let
--                 extraStr =
--                     if List.isEmpty extra then
--                         ""
--                     else
--                         "\nThese keys are extra: "
--                             ++ (extra |> String.join ", " |> (\d -> "[ " ++ d ++ " ]"))
--
--                 missingStr =
--                     if List.isEmpty missing then
--                         ""
--                     else
--                         "\nThese keys are missing: "
--                             ++ (missing |> String.join ", " |> (\d -> "[ " ++ d ++ " ]"))
--             in
--             String.join ""
--                 [ verticalBar description expected actual
--                 , "\n"
--                 , extraStr
--                 , missingStr
--                 ]
--
--


highlightEqual : String -> String -> Maybe ( List (Highlightable String), List (Highlightable String) )
highlightEqual expected actual =
    if isFloat expected && isFloat actual then
        -- Diffing numbers looks silly. Don't bother.
        Nothing
    else
        let
            expectedChars =
                String.toList expected

            actualChars =
                String.toList actual
        in
        Just
            ( Highlightable.fromLists expectedChars actualChars
                |> List.map (Highlightable.map String.fromChar)
            , Highlightable.fromLists actualChars expectedChars
                |> List.map (Highlightable.map String.fromChar)
            )


isFloat : String -> Bool
isFloat str =
    case String.toFloat str of
        Ok _ ->
            True

        Err _ ->
            False
