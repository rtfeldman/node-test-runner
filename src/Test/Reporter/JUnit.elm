module Test.Reporter.JUnit exposing (reportBegin, reportComplete, reportSummary)

import Test.Reporter.TestResults as TestResults
import Test.Runner
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


reportBegin : { paths : List String, include : Maybe String, exclude : Maybe String, fuzzRuns : Int, testCount : Int, initialSeed : Int } -> Maybe Value
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


encodeSuite : TestResults.TestResult -> List Value
encodeSuite result =
    List.map (encodeTest result) result.expectations


encodeSuites : List TestResults.TestResult -> Value
encodeSuites results =
    Encode.list <| List.concatMap encodeSuite results


reportSummary : Time -> List TestResults.TestResult -> Value
reportSummary duration results =
    let
        expectations =
            List.concatMap .expectations results

        failed =
            expectations
                |> List.filter ((/=) Expect.pass)
                |> List.length

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
                    , ( "@time", encodeTime (List.foldl (+) 0 <| List.map .duration results) )
                    , ( "testcase", encodeSuites results )
                    ]
              )
            ]
