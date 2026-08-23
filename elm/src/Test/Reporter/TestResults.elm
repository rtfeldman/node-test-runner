module Test.Reporter.TestResults exposing
    ( Failure
    , Outcome(..)
    , SummaryInfo
    , TestResult
    )

import Test.Distribution exposing (DistributionReport)
import Test.Runner.Failure exposing (Reason)


type Outcome
    = Passed DistributionReport
    | Todo String
    | Failed ( Failure, DistributionReport )


type alias TestResult =
    { labels : List String
    , outcome : Outcome
    , duration : Float -- in milliseconds
    , hasBufferedDebugLogs : Bool
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
