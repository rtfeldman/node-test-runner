module Test.Reporter.JUnit exposing (reportBegin, reportComplete, reportSummary)

import Test.Reporter.Result as Results
import Expect exposing (Expectation)
import Json.Encode as Encode exposing (Value)
import Time exposing (Time)


reportBegin : { testCount : Int, initialSeed : Int } -> Maybe Value
reportBegin { testCount, initialSeed } = Nothing


reportComplete : Results.TestResult -> Maybe Value
reportComplete { duration, labels, expectations } = Nothing

encodeTestcaseFailure : Expectation -> List (String, Value)
encodeTestcaseFailure expectation =
    expectation
        |> Expect.getFailure
        |> Maybe.map (\f -> [ ("failure", Encode.string (f.given ++ f.message) )  ])
        |> Maybe.withDefault []

formatClassAndName : List String -> (String, String)
formatClassAndName labels =
    case labels of
        head::rest ->
            (String.join " " (List.reverse rest), head)

        _ ->
            ("", "")
            
encodeTime : Time -> Value
encodeTime time =
    time
        |> Time.inSeconds
        |> toString
        |> Encode.string

encodeTest : Results.TestResult -> Expectation -> Value
encodeTest { labels, duration } expectation =
    let
        (classname, name) = formatClassAndName labels
    in
        Encode.object
            (
              [ ( "@classname", Encode.string classname )
              , ( "@name", Encode.string name )
              , ( "@time", encodeTime duration )
              ] ++ (encodeTestcaseFailure expectation)
            )

encodeSuite : Results.TestResult -> List Value
encodeSuite result =
    List.map (encodeTest result) result.expectations

encodeSuites : List Results.TestResult -> Value
encodeSuites results =
    Encode.list <| List.concatMap encodeSuite results

reportSummary : Time -> List Results.TestResult -> Value
reportSummary duration results =
    let
        expectations = List.concatMap .expectations results
        failed =
            expectations
                |> List.filter ((/=) Expect.pass)
                |> List.length

        passed =
            (List.length expectations) - failed
    in
        Encode.object
            [ ( "testsuite", Encode.object
                [ ( "@name", Encode.string "elm-test" )
                , ( "@tests", Encode.int (List.length expectations) )
                , ( "@failed", Encode.int failed )
                , ( "@time", encodeTime (List.foldl (+) 0 <| List.map .duration results) )
                , ( "testcase", encodeSuites results )
                ]
            ) ]
