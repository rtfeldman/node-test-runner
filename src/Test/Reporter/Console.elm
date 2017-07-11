module Test.Reporter.Console exposing (reportBegin, reportComplete, reportSummary)

import Console.Text as Text exposing (..)
import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as Results exposing (Failure, Outcome(..), SummaryInfo, TestResult, isTodo)
import Test.Runner exposing (formatLabels)
import Time exposing (Time)


formatDuration : Time -> String
formatDuration time =
    toString time ++ " ms"


indent : String -> String
indent str =
    str
        |> String.split "\n"
        |> List.map ((++) "    ")
        |> String.join "\n"


pluralize : String -> String -> Int -> String
pluralize singular plural count =
    let
        suffix =
            if count == 1 then
                singular
            else
                plural
    in
    String.join " " [ toString count, suffix ]


todosToText : ( List String, String ) -> Text
todosToText ( labels, failure ) =
    Text.concat [ todoLabelsToText labels, todoToChalk failure ]


todoLabelsToText : List String -> Text
todoLabelsToText =
    formatLabels (dark << plain << withChar '↓') (dark << plain << withChar '↓') >> Text.concat


todoToChalk : String -> Text
todoToChalk message =
    plain ("◦ TODO: " ++ message ++ "\n\n")


failuresToText : List String -> List Failure -> Text
failuresToText labels failures =
    Text.concat (failureLabelsToText labels :: List.map failureToText failures)


failureLabelsToText : List String -> Text
failureLabelsToText =
    formatLabels (dark << plain << withChar '↓') (red << withChar '✗') >> Text.concat


failureToText : Results.Failure -> Text
failureToText { given, message } =
    let
        messageText =
            plain ("\n" ++ indent message ++ "\n\n")
    in
    case given of
        Nothing ->
            messageText

        Just givenStr ->
            [ dark (plain ("\nGiven " ++ givenStr ++ "\n"))
            , messageText
            ]
                |> Text.concat


textToValue : UseColor -> Text -> Value
textToValue useColor txt =
    txt
        |> Text.render useColor
        |> Encode.string


reportBegin : UseColor -> { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin useColor { paths, fuzzRuns, testCount, initialSeed } =
    let
        prefix =
            "Running "
                ++ pluralize "test" "tests" testCount
                ++ ". To reproduce these results, run: elm-test --fuzz "
                ++ toString fuzzRuns
                ++ " --seed "
                ++ toString initialSeed
    in
    (String.join " " (prefix :: paths) ++ "\n")
        |> plain
        |> textToValue useColor
        |> Just


reportComplete : UseColor -> Results.TestResult -> Value
reportComplete useColor { duration, labels, outcome } =
    case outcome of
        Passed ->
            -- No failures of any kind.
            Encode.null

        Failed failures ->
            -- We have non-TODOs still failing; report them, not the TODOs.
            failures
                |> failuresToText labels
                |> textToValue useColor

        Todo str ->
            Encode.object
                [ ( "todo", Encode.string str )
                , ( "labels", Encode.list (List.map Encode.string labels) )
                ]


summarizeTodos : List ( List String, String ) -> Text
summarizeTodos =
    List.map todosToText >> Text.concat


reportSummary : UseColor -> SummaryInfo -> Maybe String -> Value
reportSummary useColor { todos, passed, failed, duration } autoFail =
    let
        headlineResult =
            case ( autoFail, failed, List.length todos ) of
                ( Nothing, 0, 0 ) ->
                    Ok "TEST RUN PASSED"

                ( Nothing, 0, 1 ) ->
                    Err ( yellow, "TEST RUN INCOMPLETE", " because there is 1 TODO remaining" )

                ( Nothing, 0, numTodos ) ->
                    Err ( yellow, "TEST RUN INCOMPLETE", " because there are " ++ toString numTodos ++ " TODOs remaining" )

                ( Just failure, 0, _ ) ->
                    Err ( yellow, "TEST RUN INCOMPLETE", " because " ++ failure )

                ( _, _, _ ) ->
                    Err ( red, "TEST RUN FAILED", "" )

        headline =
            case headlineResult of
                Ok str ->
                    underline (green ("\n" ++ str ++ "\n\n"))

                Err ( colorize, str, suffix ) ->
                    [ underline (colorize ("\n" ++ str))
                    , colorize (suffix ++ "\n\n")
                    ]
                        |> Text.concat

        todoStats =
            -- Print stats for Todos if there are any,
            --but don't print details unless only Todos remain
            case List.length todos of
                0 ->
                    plain ""

                numTodos ->
                    stat "Todo:     " (toString numTodos)

        individualTodos =
            if failed > 0 then
                plain ""
            else
                summarizeTodos (List.reverse todos)
    in
    [ headline
    , stat "Duration: " (formatDuration duration)
    , stat "Passed:   " (toString passed)
    , stat "Failed:   " (toString failed)
    , todoStats
    , individualTodos
    ]
        |> Text.concat
        |> Text.render useColor
        |> Encode.string


stat : String -> String -> Text
stat label value =
    Text.concat
        [ dark (plain label)
        , plain (value ++ "\n")
        ]


withChar : Char -> String -> String
withChar icon str =
    String.fromChar icon ++ " " ++ str ++ "\n"
