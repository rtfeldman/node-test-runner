module Test.Reporter.JUnit exposing (reportBegin, reportComplete, reportSummary)

import Test.Reporter.TestResults as TestResults
import Test.Runner
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


reportBegin : { paths : List String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin _ =
    Nothing


reportComplete : TestResults.TestResult -> Maybe Value
reportComplete { duration, labels, expectations } =
    Nothing


encodeTestcaseFailure : Expectation -> List ( String, Value )
encodeTestcaseFailure expectation =
    expectation
        |> Test.Runner.getFailure
        |> Maybe.map encodeFailureMessage
        |> Maybe.withDefault []


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


encodeTest : TestResults.TestResult -> Expectation -> Value
encodeTest { labels, duration } expectation =
    let
        ( classname, name ) =
            formatClassAndName labels
    in
        Encode.object
            ([ ( "@classname", Encode.string classname )
             , ( "@name", Encode.string name )
             , ( "@time", encodeTime duration )
             ]
                ++ (encodeTestcaseFailure expectation)
            )


encodeSuite : Maybe String -> TestResults.TestResult -> List Value
encodeSuite extraFailure result =
    let
        baseExpectations =
            List.map (encodeTest result) result.expectations
    in
        case extraFailure of
            Nothing ->
                baseExpectations

            Just failure ->
                let
                    expectation =
                        Expect.fail failure
                in
                    expectation
                        |> encodeTest
                            { labels = []
                            , duration = 0
                            , expectations = [ expectation ]
                            }
                        |> List.singleton
                        |> List.append baseExpectations


encodeSuites : Maybe String -> List TestResults.TestResult -> Value
encodeSuites extraFailure results =
    Encode.list <| List.concatMap (encodeSuite extraFailure) results


reportSummary : Time -> Maybe String -> List TestResults.TestResult -> Value
reportSummary duration autoFail results =
    let
        expectations =
            List.concatMap .expectations results

        failed =
            expectations
                |> List.filter ((/=) Expect.pass)
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
            (List.length expectations) - failed
    in
        Encode.object
            [ ( "testsuite"
              , Encode.object
                    [ ( "@name", Encode.string "elm-test" )
                    , ( "@package", Encode.string "elm-test" )
                      -- Would be nice to have this provided from elm-package.json of tests
                    , ( "@tests", Encode.int (List.length expectations) )
                    , ( "@failed", Encode.int failed )
                    , ( "@errors", Encode.int 0 )
                    , ( "@time", encodeTime (List.foldl (+) 0 <| List.map .duration results) )
                    , ( "testcase", encodeSuites extraFailure results )
                    ]
              )
            ]
