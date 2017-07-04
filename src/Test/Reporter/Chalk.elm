module Test.Reporter.Chalk exposing (reportBegin, reportComplete, reportSummary)

import Chalk exposing (Chalk)
import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as Results exposing (Failure, Outcome(..), TestResult, isTodo)
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


failuresToChalk : List String -> List Results.Failure -> List Chalk
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
    chalkWith
        [ { styles = []
          , text = String.join " " (prefix :: paths) ++ "\n"
          }
        ]
        |> Just


getNonTodoFailure : Outcome -> Maybe Failure
getNonTodoFailure outcome =
    case outcome of
        Todo _ ->
            Nothing

        Passed ->
            Nothing

        Failed failures ->
            Just failures


reportComplete : Results.TestResult -> Maybe Value
reportComplete { duration, labels, outcomes } =
    -- Don't report TODOs eagerly; report them at the summary if at all.
    case List.filterMap getNonTodoFailure outcomes of
        [] ->
            -- No failures of any kind.
            Nothing

        failures ->
            -- We have non-TODOs still failing; report them, not the TODOs.
            failuresToChalk labels failures
                |> chalkWith
                |> Just


getTodosAndFailures : List Results.TestResult -> { todos : List ( List String, String ), nonTodoFailures : Int }
getTodosAndFailures =
    getTodosAndFailuresHelp { todos = [], nonTodoFailures = 0 }


getTodosAndFailuresHelp :
    { todos : List ( List String, String ), nonTodoFailures : Int }
    -> List TestResult
    -> { todos : List ( List String, String ), nonTodoFailures : Int }
getTodosAndFailuresHelp outcome testResults =
    case testResults of
        [] ->
            outcome

        { outcomes, labels } :: rest ->
            let
                { todoFailures, nonTodoFailures } =
                    partitionTodos outcomes

                newOutcome =
                    if todoFailures == [] && nonTodoFailures == 0 then
                        outcome
                    else
                        { todos = outcome.todos ++ List.map (\message -> ( labels, message )) todoFailures
                        , nonTodoFailures = outcome.nonTodoFailures + nonTodoFailures
                        }
            in
            getTodosAndFailuresHelp newOutcome rest


type alias PartitionedTodos =
    { todoFailures : List String, nonTodoFailures : Int }


partitionTodos : List Outcome -> PartitionedTodos
partitionTodos outcomes =
    let
        result =
            partitionTodosHelp outcomes { todoFailures = [], nonTodoFailures = 0 }
    in
    { result | todoFailures = List.reverse result.todoFailures }


partitionTodosHelp : List Outcome -> PartitionedTodos -> PartitionedTodos
partitionTodosHelp outcomes result =
    case outcomes of
        [] ->
            result

        (Todo message) :: rest ->
            { result | todoFailures = message :: result.todoFailures }
                |> partitionTodosHelp rest

        (Failed _) :: rest ->
            { result | nonTodoFailures = 1 }
                |> partitionTodosHelp rest

        Passed :: rest ->
            result
                |> partitionTodosHelp rest


summarizeTodos : List ( List String, String ) -> List Chalk
summarizeTodos todos =
    case List.concatMap todosToChalk todos of
        [] ->
            []

        todoChalks ->
            { styles = [], text = "\n\n" } :: todoChalks


reportSummary : Time -> Maybe String -> List Results.TestResult -> Value
reportSummary duration autoFail results =
    let
        { todos, nonTodoFailures } =
            getTodosAndFailures results

        passed =
            List.length results - nonTodoFailures - List.length todos

        headlineResult =
            case ( autoFail, nonTodoFailures, List.length todos ) of
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
            if nonTodoFailures > 0 then
                []
            else
                summarizeTodos (List.reverse todos)
    in
    [ headline
    , stat "Duration: " (formatDuration duration)
    , stat "Passed:   " (toString passed)
    , stat "Failed:   " (toString nonTodoFailures)
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
