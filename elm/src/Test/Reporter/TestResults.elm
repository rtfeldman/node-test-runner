module Test.Reporter.TestResults exposing
    ( Failure
    , Outcome(..)
    , SummaryInfo
    , TestResult
    , isFailure
    , outcomeFromExpectations
    )

import Expect exposing (Expectation)
import Test.Distribution exposing (DistributionReport)
import Test.Runner
import Test.Runner.Failure exposing (Reason)


type Outcome
    = Passed DistributionReport
    | Todo String
    | Failed ( Failure, DistributionReport )


type alias TestResult =
    { labels : List String
    , outcome : Outcome
    , duration : Int -- in milliseconds
    , jsDefinitionName : String
    , isFuzzTest : Bool
    , usedDebugLog : Bool
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


outcomeFromExpectations : List Expectation -> Outcome
outcomeFromExpectations expectations =
    case expectations of
        -- The type of test runner functions says that they return `List Expectation`,
        -- but in practice they only ever return lists with exactly one item:
        -- https://github.com/elm-explorations/test/pull/244
        -- That PR was reverted because it unfortunately was a breaking change for the package:
        -- https://github.com/elm-explorations/test/commit/11f70d5fc0b6fdc88d7a34ea1d10f56969890493
        -- But to keep things simpler here, we only support exactly one expectation.
        [ expectation ] ->
            case Test.Runner.getFailureReason expectation of
                Nothing ->
                    Passed (Test.Runner.getDistributionReport expectation)

                Just failure ->
                    if Test.Runner.isTodo expectation then
                        Todo failure.description

                    else
                        Failed ( failure, Test.Runner.getDistributionReport expectation )

        _ ->
            Debug.todo ("A test somehow did not return exactly 1 expectation, it returned " ++ String.fromInt (List.length expectations) ++ "!")
