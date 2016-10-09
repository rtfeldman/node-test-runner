module Test.Reporter.Result exposing (TestResult, Failure)

import Expect exposing (Expectation)
import Time exposing (Time)


type alias TestResult =
    { labels : List String
    , expectations : List Expectation
    , duration : Time
    }


type alias Failure =
    { given : String, message : String }
