module Test.Reporter.JUnit exposing (reportBegin, reportComplete, reportSummary)

import Json.Encode as Encode exposing (Value)
import Test.Reporter.TestResults as TestResults exposing (Outcome(Failed), isFailure)
import Time exposing (Time)


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin _ =
    Nothing


reportComplete : TestResults.TestResult -> Maybe Value
reportComplete { duration, labels, outcomes } =
    Nothing


encodeTestcaseFailure : Outcome -> List ( String, Value )
encodeTestcaseFailure outcome =
    case outcome of
        Failed failure ->
            encodeFailureMessage failure

        _ ->
            []


encodeFailureMessage : TestResults.Failure -> List ( String, Value )
encodeFailureMessage { given, message } =
    [ ( "failure", Encode.string (Maybe.withDefault "" given ++ message) ) ]


formatClassAndName : List String -> ( String, String )
formatClassAndName labels =
    case labels of
        head :: rest ->
            ( String.join " " (List.reverse rest), head )

        _ ->
            ( "", "" )


encodeTime : Time -> Value
encodeTime time =
    time
        |> Time.inSeconds
        |> toString
        |> Encode.string


encodeTest : TestResults.TestResult -> Outcome -> Value
encodeTest { labels, duration } outcome =
    let
        ( classname, name ) =
            formatClassAndName labels
    in
    Encode.object
        ([ ( "@classname", Encode.string classname )
         , ( "@name", Encode.string name )
         , ( "@time", encodeTime duration )
         ]
            ++ encodeTestcaseFailure outcome
        )


encodeSuite : Maybe String -> TestResults.TestResult -> List Value
encodeSuite extraFailure result =
    let
        baseOutcomes =
            List.map (encodeTest result) result.outcomes
    in
    case extraFailure of
        Nothing ->
            baseOutcomes

        Just failure ->
            let
                outcome =
                    Failed { given = Nothing, message = failure }
            in
            outcome
                |> encodeTest
                    { labels = []
                    , duration = 0
                    , outcomes = [ outcome ]
                    }
                |> List.singleton
                |> List.append baseOutcomes


encodeSuites : Maybe String -> List TestResults.TestResult -> Value
encodeSuites extraFailure results =
    Encode.list <| List.concatMap (encodeSuite extraFailure) results


reportSummary : Time -> Maybe String -> List TestResults.TestResult -> Value
reportSummary duration autoFail results =
    let
        outcomes =
            List.concatMap .outcomes results

        failed =
            outcomes
                |> List.filter isFailure
                |> List.length

        extraFailure =
            -- JUnit doesn't have a notion of "everything passed, but you left
            -- a Test.only in there, so it's a failure overall." In that case
            -- we'll tack on an extra failed test, so the overall suite fails.
            -- Another option would be to report it as an Error, but that would
            -- make JUnit have different semantics from the other reporters.
            -- Also, there wasn't really an error. Nothing broke.
            if failed == 0 && autoFail /= Nothing then
                autoFail
            else
                Nothing

        passed =
            List.length outcomes - failed
    in
    Encode.object
        [ ( "testsuite"
          , Encode.object
                [ ( "@name", Encode.string "elm-test" )
                , ( "@package", Encode.string "elm-test" )

                -- Would be nice to have this provided from elm-package.json of tests
                , ( "@tests", Encode.int (List.length outcomes) )
                , ( "@failed", Encode.int failed )
                , ( "@errors", Encode.int 0 )
                , ( "@time", encodeTime (List.foldl (+) 0 <| List.map .duration results) )
                , ( "testcase", encodeSuites extraFailure results )
                ]
          )
        ]
