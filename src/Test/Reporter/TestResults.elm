module Test.Reporter.TestResults
    exposing
        ( Failure
        , Outcome(..)
        , SummaryInfo
        , TestResult
        , isFailure
        , isTodo
        , outcomesFromExpectations
        )

import Expect exposing (Expectation)
import Test.Runner
import Test.Runner.Failure exposing (Reason(..))


type Outcome
    = Passed
    | Todo String
    | Failed (List Failure)


type alias TestResult =
    { labels : List String
    , outcome : Outcome
    , duration : Int -- in milliseconds
    }


type alias SummaryInfo =
    { testCount : Int
    , passed : Int
    , failed : Int
    , todos : List ( List String, String )
    , duration : Float
    }


type alias Failure =
    { given : Maybe String
    , description : String
    , reason : Reason
    }


isTodo : Outcome -> Bool
isTodo outcome =
    case outcome of
        Todo _ ->
            True

        _ ->
            False


isFailure : Outcome -> Bool
isFailure outcome =
    case outcome of
        Failed _ ->
            True

        _ ->
            False


outcomesFromExpectations : List Expectation -> List Outcome
outcomesFromExpectations expectations =
    case expectations of
        expectation :: [] ->
            -- Most often we'll get exactly 1 pass, so try that case first!
            case Test.Runner.getFailureReason expectation of
                Nothing ->
                    [ Passed ]

                Just failure ->
                    if Test.Runner.isTodo expectation then
                        [ Todo failure.description ]

                    else
                        [ Failed [ failure ] ]

        first :: rest ->
            let
                builder =
                    List.foldl outcomesFromExpectationsHelp
                        { passes = 0, todos = [], failures = [] }
                        expectations

                failuresList =
                    case builder.failures of
                        [] ->
                            []

                        failures ->
                            [ Failed failures ]
            in
            List.concat
                [ List.repeat builder.passes Passed
                , List.map Todo builder.todos
                , failuresList
                ]

        [] ->
            []


type alias OutcomeBuilder =
    { passes : Int, todos : List String, failures : List Failure }


outcomesFromExpectationsHelp : Expectation -> OutcomeBuilder -> OutcomeBuilder
outcomesFromExpectationsHelp expectation builder =
    case Test.Runner.getFailureReason expectation of
        Just failure ->
            if Test.Runner.isTodo expectation then
                { builder | todos = failure.description :: builder.todos }

            else
                { builder | failures = failure :: builder.failures }

        Nothing ->
            { builder | passes = builder.passes + 1 }
