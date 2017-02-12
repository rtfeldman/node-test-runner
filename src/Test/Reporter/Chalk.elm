module Test.Reporter.Chalk exposing (reportBegin, reportComplete, reportSummary)

import Chalk exposing (Chalk)
import Test.Reporter.TestResults as Results
import Expect
import Json.Encode as Encode exposing (Value)
import String
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


failuresToChalk : List String -> List Results.Failure -> List Chalk
failuresToChalk labels failures =
    labelsToChalk labels ++ List.concatMap failureToChalk failures


labelsToChalk : List String -> List Chalk
labelsToChalk =
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


reportBegin : { paths : List String, include : Maybe String, exclude : Maybe String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin { paths, include, exclude, fuzzRuns, testCount, initialSeed } =
    let
        optionalArgs =
            if include == Nothing && exclude == Nothing then
                ""
            else
                [ Maybe.map (\str -> "--include " ++ toString str) include
                , Maybe.map (\str -> "--exclude " ++ toString str) exclude
                ]
                    |> List.filterMap identity
                    |> String.join " "
                    |> (++) " "

        prefix =
            "\nelm-test\n--------\n\nRunning "
                ++ pluralize "test" "tests" testCount
                ++ ". To reproduce these results, run: elm-test --fuzz "
                ++ toString fuzzRuns
                ++ " --seed "
                ++ toString initialSeed
                ++ optionalArgs
    in
        chalkWith
            [ { styles = []
              , text = String.join " " (prefix :: paths) ++ "\n"
              }
            ]
            |> Just


reportComplete : Results.TestResult -> Maybe Value
reportComplete { duration, labels, expectations } =
    case List.filterMap Test.Runner.getFailure expectations of
        [] ->
            Nothing

        failures ->
            failuresToChalk labels failures
                |> chalkWith
                |> Just


reportSummary : Time -> List Results.TestResult -> Value
reportSummary duration results =
    let
        failed =
            results
                |> List.filter (.expectations >> List.all ((/=) Expect.pass))
                |> List.length

        headline =
            if failed > 0 then
                [ { styles = [ "underline", "red" ], text = "\nTEST RUN FAILED\n\n" } ]
            else
                [ { styles = [ "underline", "green" ], text = "\nTEST RUN PASSED\n\n" } ]

        passed =
            (List.length results) - failed

        stat label value =
            [ { styles = [ "dim" ], text = label }
            , { styles = [], text = value ++ "\n" }
            ]
    in
        [ headline
        , stat "Duration: " (formatDuration duration)
        , stat "Passed:   " (toString passed)
        , stat "Failed:   " (toString failed)
        ]
            |> List.concat
            |> List.map Chalk.encode
            |> Encode.list
