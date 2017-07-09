module Test.Reporter.Chalk exposing (reportBegin, reportComplete, reportSummary)

import Chalk exposing (Chalk)
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


todosToChalk : ( List String, String ) -> List Chalk
todosToChalk ( labels, failure ) =
    todoLabelsToChalk labels ++ todoToChalk failure


todoLabelsToChalk : List String -> List Chalk
todoLabelsToChalk =
    formatLabels (Chalk.withColorChar '↓' "dim") (Chalk.withColorChar '↓' "dim")


todoToChalk : String -> List Chalk
todoToChalk message =
    [ { styles = [], text = "◦ TODO: " ++ message ++ "\n\n" } ]


failuresToChalk : List String -> List Failure -> List Chalk
failuresToChalk labels failures =
    failureLabelsToChalk labels ++ List.concatMap failureToChalk failures


failureLabelsToChalk : List String -> List Chalk
failureLabelsToChalk =
    formatLabels (Chalk.withColorChar '↓' "dim") (Chalk.withColorChar '✗' "red")


failureToChalk : Results.Failure -> List Chalk
failureToChalk { given, message } =
    let
        messageChalk =
            { styles = [], text = "\n" ++ indent message ++ "\n\n" }
    in
    case given of
        Nothing ->
            [ messageChalk ]

        Just givenStr ->
            [ { styles = [ "dim" ], text = "\nGiven " ++ givenStr ++ "\n" }
            , messageChalk
            ]


chalkWith : List Chalk -> Value
chalkWith chalks =
    chalks
        |> List.map Chalk.encode
        |> Encode.list


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin { paths, fuzzRuns, testCount, initialSeed } =
    let
        prefix =
            "\nelm-test\n--------\n\nRunning "
                ++ pluralize "test" "tests" testCount
                ++ ". To reproduce these results, run: elm-test --fuzz "
                ++ toString fuzzRuns
                ++ " --seed "
                ++ toString initialSeed
    in
    [ { styles = []
      , text = String.join " " (prefix :: paths) ++ "\n"
      }
    ]
        |> chalkWith
        |> Just


reportComplete : Results.TestResult -> Value
reportComplete { duration, labels, outcome } =
    case outcome of
        Passed ->
            -- No failures of any kind.
            Encode.null

        Failed failures ->
            -- We have non-TODOs still failing; report them, not the TODOs.
            failures
                |> failuresToChalk labels
                |> chalkWith

        Todo str ->
            Encode.object
                [ ( "todo", Encode.string str )
                , ( "labels", Encode.list (List.map Encode.string labels) )
                ]


summarizeTodos : List ( List String, String ) -> List Chalk
summarizeTodos todos =
    case List.concatMap todosToChalk todos of
        [] ->
            []

        todoChalks ->
            { styles = [], text = "\n\n" } :: todoChalks


reportSummary : SummaryInfo -> Maybe String -> Value
reportSummary { todos, passed, failed, duration } autoFail =
    let
        headlineResult =
            case ( autoFail, failed, List.length todos ) of
                ( Nothing, 0, 0 ) ->
                    Ok "TEST RUN PASSED"

                ( Nothing, 0, 1 ) ->
                    Err ( "yellow", "TEST RUN INCOMPLETE", " because there is 1 TODO remaining" )

                ( Nothing, 0, numTodos ) ->
                    Err ( "yellow", "TEST RUN INCOMPLETE", " because there are " ++ toString numTodos ++ " TODOs remaining" )

                ( Just failure, 0, _ ) ->
                    Err ( "yellow", "TEST RUN INCOMPLETE", " because " ++ failure )

                ( _, _, _ ) ->
                    Err ( "red", "TEST RUN FAILED", "" )

        headline =
            case headlineResult of
                Ok str ->
                    [ { styles = [ "underline", "green" ], text = "\n" ++ str ++ "\n\n" } ]

                Err ( color, str, suffix ) ->
                    [ { styles = [ "underline", color ], text = "\n" ++ str }
                    , { styles = [ color ], text = suffix ++ "\n\n" }
                    ]

        todoStats =
            -- Print stats for Todos if there are any,
            --but don't print details unless only Todos remain
            case List.length todos of
                0 ->
                    []

                numTodos ->
                    stat "Todo:     " (toString numTodos)

        individualTodos =
            if failed > 0 then
                []
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
        |> List.concat
        |> List.map Chalk.encode
        |> Encode.list


stat : String -> String -> List Chalk
stat label value =
    [ { styles = [ "dim" ], text = label }
    , { styles = [], text = value ++ "\n" }
    ]
