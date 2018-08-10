module Test.Reporter.JUnit exposing (reportBegin, reportComplete, reportSummary)

import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as TestResults exposing (Failure, Outcome(..), SummaryInfo, TestResult, isFailure)
import Test.Runner.Failure exposing (InvalidReason(..), Reason(..))


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin _ =
    Nothing


encodeOutcome : Outcome -> List ( String, Value )
encodeOutcome outcome =
    case outcome of
        Passed ->
            []

        Failed failures ->
            let
                message =
                    failures
                        |> List.map formatFailure
                        |> String.join "\n\n\n"
            in
            [ encodeFailureTuple message ]

        Todo message ->
            [ encodeFailureTuple ("TODO: " ++ message) ]


encodeFailureTuple : String -> ( String, Value )
encodeFailureTuple message =
    ( "failure", Encode.string message )


formatFailure : Failure -> String
formatFailure { given, description, reason } =
    let
        message =
            reasonToString description reason
    in
    case given of
        Just str ->
            "Given " ++ str ++ "\n\n" ++ message

        Nothing ->
            message


formatClassAndName : List String -> ( String, String )
formatClassAndName labels =
    case labels of
        head :: rest ->
            ( String.join " " (List.reverse rest), head )

        _ ->
            ( "", "" )


encodeDuration : Int -> Value
encodeDuration time =
    (toFloat time / 1000)
        |> String.fromFloat
        |> Encode.string


reportComplete : TestResult -> Value
reportComplete { labels, duration, outcome } =
    let
        ( classname, name ) =
            formatClassAndName labels
    in
    Encode.object
        ([ ( "@classname", Encode.string classname )
         , ( "@name", Encode.string name )
         , ( "@time", encodeDuration duration )
         ]
            ++ encodeOutcome outcome
        )


encodeExtraFailure : String -> Value
encodeExtraFailure failure =
    reportComplete { labels = [], duration = 0, outcome = Failed [] }


reportSummary : SummaryInfo -> Maybe String -> Value
reportSummary { testCount, duration, passed, failed, todos } autoFail =
    let
        -- JUnit doesn't have a notion of "everything passed, but you left
        -- a Test.only in there, so it's a failure overall." In that case
        -- we'll tack on an extra failed test, so the overall suite fails.
        -- Another option would be to report it as an Error, but that would
        -- make JUnit have different semantics from the other reporters.
        -- Also, there wasn't really an error. Nothing broke.
        extraFailures =
            case ( failed, autoFail ) of
                ( 0, Just failure ) ->
                    [ encodeExtraFailure failure ]

                _ ->
                    []
    in
    Encode.object
        [ ( "testsuite"
          , Encode.object
                [ ( "@name", Encode.string "elm-test" )
                , ( "@package", Encode.string "elm-test" )

                -- Would be nice to have this provided from elm-package.json of tests
                , ( "@tests", Encode.int testCount )
                , ( "@failed", Encode.int failed )
                , ( "@errors", Encode.int 0 )
                , ( "@time", Encode.float duration )
                , ( "testcase", Encode.list identity extraFailures )
                ]
          )
        ]


reasonToString : String -> Reason -> String
reasonToString description reason =
    case reason of
        Custom ->
            description

        Equality expected actual ->
            expected ++ "\n\nwas not equal to\n\n" ++ actual

        Comparison first second ->
            first ++ "\n\nfailed when compared with " ++ description ++ " on\n\n" ++ second

        TODO ->
            "TODO: " ++ description

        Invalid BadDescription ->
            let
                explanation =
                    if description == "" then
                        "The empty string is not a valid test description."

                    else
                        "This is an invalid test description: " ++ description
            in
            "Invalid test: " ++ explanation

        Invalid _ ->
            "Invalid test: " ++ description

        ListDiff expected actual ->
            String.join ", " expected ++ "\n\nhad different elements than\n\n" ++ String.join ", " actual

        CollectionDiff { expected, actual, extra, missing } ->
            expected
                ++ "\n\nhad different contents than\n\n"
                ++ actual
                ++ "\n\nthese were extra:\n\n"
                ++ String.join "\n" extra
                ++ "\n\nthese were missing:\n\n"
                ++ String.join "\n" missing
