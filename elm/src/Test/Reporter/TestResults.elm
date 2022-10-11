module Test.Reporter.TestResults exposing
    ( Failure
    , Outcome(..)
    , SummaryInfo
    , TestResult
    , isFailure
    , outcomesFromExpectations
    )

import Expect exposing (Expectation)
import Test.Distribution exposing (DistributionReport)
import Test.Runner
import Test.Runner.Failure exposing (Reason)


type Outcome
    = Passed DistributionReport
    | Todo String
    | Failed (List ( Failure, DistributionReport ))


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
                    [ Passed (Test.Runner.getDistributionReport expectation) ]

                Just failure ->
                    if Test.Runner.isTodo expectation then
                        [ Todo failure.description ]

                    else
                        [ Failed
                            [ ( failure, Test.Runner.getDistributionReport expectation ) ]
                        ]

        _ :: _ ->
            let
                builder =
                    List.foldl outcomesFromExpectationsHelp
                        { passes = [], todos = [], failures = [] }
                        expectations

                failuresList =
                    case builder.failures of
                        [] ->
                            []

                        failures ->
                            [ Failed failures ]
            in
            List.concat
                [ List.map Passed builder.passes
                , List.map Todo builder.todos
                , failuresList
                ]

        [] ->
            []


type alias OutcomeBuilder =
    { passes : List DistributionReport
    , todos : List String
    , failures : List ( Failure, DistributionReport )
    }


outcomesFromExpectationsHelp : Expectation -> OutcomeBuilder -> OutcomeBuilder
outcomesFromExpectationsHelp expectation builder =
    case Test.Runner.getFailureReason expectation of
        Just failure ->
            if Test.Runner.isTodo expectation then
                { builder | todos = failure.description :: builder.todos }

            else
                { builder
                    | failures =
                        ( failure
                        , Test.Runner.getDistributionReport expectation
                        )
                            :: builder.failures
                }

        Nothing ->
            { builder
                | passes =
                    Test.Runner.getDistributionReport expectation
                        :: builder.passes
            }
