module Test.Runner.Node exposing (checkTagged, run, TestProgram, PreviousRun, CachedUnitTestExpectation(..), CachedFuzzTestExpectation(..))

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs checkTagged, run, TestProgram, PreviousRun, CachedUnitTestExpectation, CachedFuzzTestExpectation

-}

import Array exposing (Array)
import Dict exposing (Dict)
import Json.Decode as Decode
import Json.Encode as Encode
import Platform
import Random
import Task
import Test exposing (Test)
import Test.Distribution exposing (DistributionReport(..))
import Test.Reporter.Reporter exposing (Report, RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome(..), TestResult)
import Test.Runner.Failure exposing (Reason(..))
import Test.Runner.Ports as Ports exposing (JsMessage(..))
import Test.RunnerV2 as Runner exposing (FuzzTest, FuzzTestExpectation(..), Tests, UnitTest, UnitTestExpectation(..))



-- TYPES


{-| A `TestId` is just an index into an `Array` of tests.
-}
type alias TestId =
    Int


{-| The compiled JavaScript name of an exposed value,
such as `$user$project$Tests$suite`.
-}
type alias JsDefinitionName =
    String


{-| Collected `Debug.log`s during a test (or during initialization before running any tests).
There are stored as `Decode.Value` instead of `List String` as an optimization. They are
collected in JavaScript code, given to Elm for a short while, and then sent through a port.
So going to from a JS array, to an Elm list, back to a JS array is pretty wasteful.
-}
type alias DebugLogs =
    Decode.Value


type alias RunnerOptions =
    { seed : Int
    , seedIsUserSupplied : Bool
    , runs : Int
    , report : Report
    , globs : List String
    , paths : List String
    , previousRun : PreviousRun
    }


type alias Model =
    { unitTests : Array UnitTest
    , fuzzTests : Array FuzzTest
    , runInfo : RunInfo
    , testReporter : TestReporter
    , autoFail : Maybe String
    , previousRun : PreviousRun
    , cacheTrawl : CacheTrawl
    }


type alias PreviousRun =
    { fuzzRuns : Int
    , initialSeed : Int
    , cachedTests : Dict JsDefinitionName CachedTests
    }


type alias CachedTests =
    { hash : String

    -- As an optimization, passing unit tests without debug logs are not stored.
    , unitTests : Dict (List String) ( CachedUnitTestExpectation, DebugLogs )

    -- As an optimization, passing fuzz tests without debug logs and distribution report are not stored.
    , fuzzTests : Dict (List String) ( CachedFuzzTestExpectation, DebugLogs )
    }


{-| Non-opaque version of `UnitTestExpectation`.
-}
type CachedUnitTestExpectation
    = CachedUnitTestPass
    | CachedUnitTestFail
        { description : String
        , reason : Reason
        }


{-| Non-opaque version of `FuzzTestExpectation`, but without `rerunFailure`.
-}
type CachedFuzzTestExpectation
    = CachedFuzzTestPass DistributionReport
    | CachedFuzzTestFail
        { description : String
        , reason : Reason
        , distributionReport : DistributionReport
        , given : Maybe String
        , fuzzerInts : List Int
        }


type CacheTrawl
    = NotTrawling
    | TrawlingUnitTests
        { current : TestId
        , unitTests : List TestId
        }
    | TrawlingFuzzTests
        { current : TestId
        , unitTests : List TestId
        , fuzzTests : List TestId
        }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Program Bool Model Msg


type Msg
    = Receive (Result Decode.Error JsMessage)
    | Trawl


noDebugLogs : DebugLogs
noDebugLogs =
    Encode.list never []


isEmptyDebugLogs : DebugLogs -> Bool
isEmptyDebugLogs debugLogs =
    Decode.decodeValue (Decode.field "length" Decode.int) debugLogs == Ok 0


dispatchUnitTest : TestId -> Model -> Cmd Msg
dispatchUnitTest testId model =
    case Array.get testId model.unitTests of
        Nothing ->
            Ports.sendError ("Unit test not found: " ++ String.fromInt testId)

        Just unitTest ->
            let
                -- The unnecessary-looking tuple here ensures that `getAndClearDebugLogs`
                -- runs _after_ the thunk.
                ( ( expectation, duration ), debugLogs ) =
                    ( runWithDuration (\() -> Runner.runUnitTest unitTest), getAndClearDebugLogs False )

                cachedExpectation =
                    case expectation of
                        UnitTestPass ->
                            CachedUnitTestPass

                        UnitTestFail data ->
                            CachedUnitTestFail
                                { description = Runner.getUnitTestFailDescription data
                                , reason = Runner.getUnitTestFailReason data
                                }
            in
            sendUnitTestResult testId unitTest cachedExpectation duration debugLogs model.testReporter


sendUnitTestResult : TestId -> UnitTest -> CachedUnitTestExpectation -> Float -> DebugLogs -> TestReporter -> Cmd Msg
sendUnitTestResult testId unitTest expectation duration debugLogs testReporter =
    let
        jsDefinitionName =
            Runner.getUnitTestTag unitTest

        hasDebugLogs =
            not (isEmptyDebugLogs debugLogs)

        outcome =
            case expectation of
                CachedUnitTestPass ->
                    Passed NoDistribution

                CachedUnitTestFail { description, reason } ->
                    case reason of
                        TODO ->
                            Todo description

                        _ ->
                            Failed
                                ( { given = Nothing
                                  , description = description
                                  , reason = reason
                                  }
                                , NoDistribution
                                )

        labels =
            Runner.getUnitTestLabels unitTest

        result : TestResult
        result =
            { labels = labels
            , outcome = outcome
            , duration = duration
            , hasDebugLogs = hasDebugLogs
            }

        report =
            testReporter.reportComplete result

        expectationElmCode =
            if expectation == CachedUnitTestPass && not hasDebugLogs then
                Nothing

            else
                Just (Debug.toString expectation)
    in
    Ports.sendResult testId False jsDefinitionName labels expectationElmCode debugLogs report


dispatchFuzzTest : TestId -> Model -> Cmd Msg
dispatchFuzzTest testId model =
    case Array.get testId model.fuzzTests of
        Nothing ->
            Ports.sendError ("Fuzz test not found: " ++ String.fromInt testId)

        Just fuzzTest ->
            let
                jsDefinitionName =
                    Runner.getFuzzTestTag fuzzTest

                fuzzerInts =
                    if
                        -- In `init` we use the same seed as the previous run if there was a failing fuzz test.
                        -- If the user has explicitly passed a different seed, don’t try to reproduce the previous
                        -- failure. They are clearly trying to run something else.
                        (model.runInfo.initialSeed == model.previousRun.initialSeed)
                            -- The number of fuzz runs must be the same (or more) as the previous run – otherwise
                            -- the user has explicitly passed fewer, and we can’t know if the previous failure
                            -- would hit or not. Since the seed is still the same, there’s still a chance it will.
                            && (model.runInfo.fuzzRuns >= model.previousRun.fuzzRuns)
                    then
                        case Dict.get jsDefinitionName model.previousRun.cachedTests of
                            Nothing ->
                                []

                            Just cachedTests ->
                                case Dict.get (Runner.getFuzzTestLabels fuzzTest) cachedTests.fuzzTests of
                                    Nothing ->
                                        []

                                    Just ( expectation_, _ ) ->
                                        case expectation_ of
                                            CachedFuzzTestPass _ ->
                                                []

                                            CachedFuzzTestFail data ->
                                                data.fuzzerInts

                    else
                        []

                seed =
                    Random.initialSeed model.runInfo.initialSeed

                ( expectation, duration, debugLogs ) =
                    -- Pause debug logs.
                    getAndClearDebugLogs True
                        |> (\_ ->
                                let
                                    ( expectation_, duration_ ) =
                                        runWithDuration (\() -> Runner.runFuzzTest fuzzTest seed model.runInfo.fuzzRuns fuzzerInts)
                                in
                                case expectation_ of
                                    FuzzTestPass data ->
                                        ( CachedFuzzTestPass (Runner.getFuzzTestPassDistributionReport data)
                                        , duration_
                                        , getAndClearDebugLogs False
                                        )

                                    FuzzTestFail data ->
                                        let
                                            newDebugLogs =
                                                -- Unpause debug logs.
                                                getAndClearDebugLogs False
                                                    |> (\_ ->
                                                            -- Collect debug logs from failing run.
                                                            Runner.rerunFuzzTestFailure data
                                                                |> (\() -> getAndClearDebugLogs False)
                                                       )
                                        in
                                        ( CachedFuzzTestFail
                                            { description = Runner.getFuzzTestFailDescription data
                                            , reason = Runner.getFuzzTestFailReason data
                                            , distributionReport = Runner.getFuzzTestFailDistributionReport data
                                            , given = Runner.getFuzzTestFailGiven data
                                            , fuzzerInts = Runner.getFuzzTestFailFuzzerInts data
                                            }
                                        , duration_
                                        , newDebugLogs
                                        )
                           )
            in
            sendFuzzTestResult testId fuzzTest expectation duration debugLogs model.testReporter


sendFuzzTestResult : TestId -> FuzzTest -> CachedFuzzTestExpectation -> Float -> DebugLogs -> TestReporter -> Cmd Msg
sendFuzzTestResult testId fuzzTest expectation duration debugLogs testReporter =
    let
        jsDefinitionName =
            Runner.getFuzzTestTag fuzzTest

        hasDebugLogs =
            not (isEmptyDebugLogs debugLogs)

        outcome =
            case expectation of
                CachedFuzzTestPass distributionReport ->
                    Passed distributionReport

                CachedFuzzTestFail { given, description, reason, distributionReport } ->
                    Failed
                        ( { given = given
                          , description = description
                          , reason = reason
                          }
                        , distributionReport
                        )

        labels =
            Runner.getFuzzTestLabels fuzzTest

        result : TestResult
        result =
            { labels = labels
            , outcome = outcome
            , duration = duration
            , hasDebugLogs = hasDebugLogs
            }

        report =
            testReporter.reportComplete result

        expectationElmCode =
            if expectation == CachedFuzzTestPass NoDistribution && not hasDebugLogs then
                Nothing

            else
                Just (Debug.toString expectation)
    in
    Ports.sendResult testId True jsDefinitionName labels expectationElmCode debugLogs report


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive (Ok jsMessage) ->
            case jsMessage of
                RunUnitTest testId ->
                    ( model, dispatchUnitTest testId model )

                RunFuzzTest testId ->
                    ( model, dispatchFuzzTest testId model )

                Summary duration failed todos ->
                    let
                        testCount =
                            model.runInfo.testCount

                        summaryInfo =
                            { testCount = testCount
                            , passed = testCount - failed - List.length todos
                            , failed = failed
                            , todos = todos
                            , duration = duration
                            }

                        summary =
                            testReporter.reportSummary summaryInfo model.autoFail

                        exitCode =
                            if failed > 0 then
                                2

                            else if model.autoFail == Nothing && List.isEmpty todos then
                                0

                            else
                                3

                        cmd =
                            Ports.sendSummary exitCode summary
                    in
                    ( model, cmd )

        Receive (Err err) ->
            ( model, Ports.sendError (Decode.errorToString err) )

        Trawl ->
            case model.cacheTrawl of
                NotTrawling ->
                    ( model, Cmd.none )

                TrawlingUnitTests data ->
                    case Array.get data.current model.unitTests of
                        Nothing ->
                            ( { model
                                | cacheTrawl =
                                    TrawlingFuzzTests
                                        { current = 0
                                        , unitTests = data.unitTests
                                        , fuzzTests = []
                                        }
                              }
                            , trawlNext
                            )

                        Just unitTest ->
                            let
                                jsDefinitionName =
                                    Runner.getUnitTestTag unitTest

                                hash =
                                    getHash jsDefinitionName

                                maybeCached =
                                    Dict.get jsDefinitionName model.previousRun.cachedTests
                                        |> Maybe.andThen
                                            (\cachedTests ->
                                                if hash == cachedTests.hash then
                                                    case Dict.get (Runner.getUnitTestLabels unitTest) cachedTests.unitTests of
                                                        -- As an optimization, passing unit tests without debug logs are not stored.
                                                        Nothing ->
                                                            Just ( CachedUnitTestPass, noDebugLogs )

                                                        cached ->
                                                            cached

                                                else
                                                    Nothing
                                            )
                            in
                            case maybeCached of
                                Nothing ->
                                    ( { model
                                        | cacheTrawl =
                                            TrawlingUnitTests
                                                { current = data.current + 1
                                                , unitTests = data.current :: data.unitTests
                                                }
                                      }
                                    , trawlNext
                                    )

                                Just ( expectation, debugLogs ) ->
                                    ( { model
                                        | cacheTrawl =
                                            TrawlingUnitTests
                                                { current = data.current + 1
                                                , unitTests = data.unitTests
                                                }
                                      }
                                    , Cmd.batch
                                        [ trawlNext
                                        , sendUnitTestResult data.current unitTest expectation 0 debugLogs model.testReporter
                                        ]
                                    )

                TrawlingFuzzTests data ->
                    case Array.get data.current model.fuzzTests of
                        Nothing ->
                            ( { model | cacheTrawl = NotTrawling }
                            , Ports.sendReady (List.reverse data.unitTests) (List.reverse data.fuzzTests)
                            )

                        Just fuzzTest ->
                            let
                                jsDefinitionName =
                                    Runner.getFuzzTestTag fuzzTest

                                hash =
                                    getHash jsDefinitionName

                                maybeCached =
                                    Dict.get jsDefinitionName model.previousRun.cachedTests
                                        |> Maybe.andThen
                                            (\cachedTests ->
                                                if
                                                    (hash == cachedTests.hash)
                                                        && (model.runInfo.initialSeed == model.previousRun.initialSeed)
                                                        -- If the fuzz tests specifies its own number of runs and the hash is the same,
                                                        -- then the number of runs must be unchanged.
                                                        && (Runner.getFuzzTestRuns fuzzTest /= Nothing || model.runInfo.fuzzRuns <= model.previousRun.fuzzRuns)
                                                then
                                                    case Dict.get (Runner.getFuzzTestLabels fuzzTest) cachedTests.fuzzTests of
                                                        -- As an optimization, passing fuzz tests without debug logs and distribution report are not stored.
                                                        Nothing ->
                                                            Just ( CachedFuzzTestPass NoDistribution, noDebugLogs )

                                                        cached ->
                                                            cached

                                                else
                                                    Nothing
                                            )
                            in
                            case maybeCached of
                                Nothing ->
                                    ( { model
                                        | cacheTrawl =
                                            TrawlingFuzzTests
                                                { current = data.current + 1
                                                , unitTests = data.unitTests
                                                , fuzzTests = data.current :: data.fuzzTests
                                                }
                                      }
                                    , trawlNext
                                    )

                                Just ( expectation, debugLogs ) ->
                                    ( { model
                                        | cacheTrawl =
                                            TrawlingFuzzTests
                                                { current = data.current + 1
                                                , unitTests = data.unitTests
                                                , fuzzTests = data.fuzzTests
                                                }
                                      }
                                    , Cmd.batch
                                        [ trawlNext
                                        , sendFuzzTestResult data.current fuzzTest expectation 0 debugLogs model.testReporter
                                        ]
                                    )


init : RunnerOptions -> Tests -> Bool -> ( Model, Cmd Msg )
init { globs, paths, runs, seed, seedIsUserSupplied, report, previousRun } tests shouldSendBegin =
    let
        autoFail =
            case ( Runner.getSeenOnly tests, Runner.getSeenSkip tests ) of
                ( False, False ) ->
                    Nothing

                ( True, False ) ->
                    Just "Test.only was used"

                ( False, True ) ->
                    Just "Test.skip was used"

                ( True, True ) ->
                    Just "Test.only and Test.skip were used"

        unitTests =
            Runner.getUnitTests tests

        fuzzTests =
            Runner.getFuzzTests tests

        testCount =
            Array.length unitTests + Array.length fuzzTests

        testReporter =
            createReporter report

        initialSeed =
            if not seedIsUserSupplied && previousRunHasFailingFuzzTest previousRun fuzzTests then
                previousRun.initialSeed

            else
                seed

        model : Model
        model =
            { unitTests = unitTests
            , fuzzTests = fuzzTests
            , runInfo =
                { testCount = testCount
                , globs = globs
                , paths = paths
                , fuzzRuns = runs
                , initialSeed = initialSeed
                }
            , testReporter = testReporter
            , autoFail = autoFail
            , previousRun = previousRun
            , cacheTrawl =
                if shouldSendBegin then
                    TrawlingUnitTests
                        { current = 0
                        , unitTests = []
                        }

                else
                    NotTrawling
            }

        -- In the main thread, we log these.
        -- In workers, we just clear them and ignore them –
        -- they are identical to the main thread.
        debugLogs =
            getAndClearDebugLogs False
    in
    ( model
    , if shouldSendBegin then
        Cmd.batch
            [ Ports.sendBegin
                initialSeed
                debugLogs
                (model.testReporter.reportBegin model.runInfo)
            , trawlNext
            ]

      else
        Cmd.none
    )


trawlNext : Cmd Msg
trawlNext =
    Task.perform (\() -> Trawl) (Task.succeed ())


failInit : String -> Report -> Bool -> ( Model, Cmd Msg )
failInit message report _ =
    let
        model : Model
        model =
            { unitTests = Array.empty
            , fuzzTests = Array.empty
            , runInfo =
                { testCount = 0
                , globs = []
                , paths = []
                , fuzzRuns = 0
                , initialSeed = 0
                }
            , testReporter = createReporter report
            , autoFail = Nothing
            , previousRun =
                { fuzzRuns = 0
                , initialSeed = 0
                , cachedTests = Dict.empty
                }
            , cacheTrawl = NotTrawling
            }

        cmd =
            Ports.sendSummary 1 (Encode.string message)
    in
    ( model, cmd )


previousRunHasFailingFuzzTest : PreviousRun -> Array FuzzTest -> Bool
previousRunHasFailingFuzzTest previousRun =
    Array.foldl
        (\fuzzTest hasFailingFuzzTest ->
            if hasFailingFuzzTest then
                hasFailingFuzzTest

            else
                let
                    jsDefinitionName =
                        Runner.getFuzzTestTag fuzzTest
                in
                case Dict.get jsDefinitionName previousRun.cachedTests of
                    Nothing ->
                        False

                    Just cachedTests ->
                        case Dict.get (Runner.getFuzzTestLabels fuzzTest) cachedTests.fuzzTests of
                            Nothing ->
                                False

                            Just ( expectation_, _ ) ->
                                case expectation_ of
                                    CachedFuzzTestPass _ ->
                                        False

                                    CachedFuzzTestFail _ ->
                                        True
        )
        False


checkTagged : a -> JsDefinitionName -> Maybe Test
checkTagged value jsDefinitionName =
    check value
        |> Maybe.map (Runner.tagTest jsDefinitionName)


{-| Returns `Just value` if `value` is a `Test`, otherwise `Nothing`.
-}
check : a -> Maybe Test
check =
    placeholderReplaceMe___ "check"


{-| Returns all debug logs created since the beginning,
or last time this function was called.

The `Bool` is set to `True` for fuzz tests, and pauses
`Debug.log` - logging is not supported for passing fuzz
tests. If the fuzz test fails, the failing run is run
again and that time we do collect logs.

-}
getAndClearDebugLogs : Bool -> DebugLogs
getAndClearDebugLogs =
    placeholderReplaceMe___ "getAndClearDebugLogs"


{-| Takes a `jsDefinitionName` and returns its hash.
-}
getHash : JsDefinitionName -> String
getHash =
    placeholderReplaceMe___ "getHash"


runWithDuration : (() -> a) -> ( a, Float )
runWithDuration =
    placeholderReplaceMe___ "runWithDuration"


{-| The implementation of functions calling this one will be replaced in the generated JS
with versions that do something not normally possible in Elm.

If you rename or change this function, or any function that calls it, you also need to update the regexes that looks for it.

-}
placeholderReplaceMe___ : String -> a
placeholderReplaceMe___ name =
    Debug.todo ("The regex for replacing this Debug.todo for '" ++ name ++ "' with some real code must have failed since you see this message!\n\nPlease report this bug: https://github.com/rtfeldman/node-test-runner/issues/new\n")


{-| Run the tests.
-}
run : RunnerOptions -> List ( String, List (Maybe Test) ) -> TestProgram
run options possiblyTests =
    let
        testsList =
            possiblyTests
                |> List.filterMap
                    (\( moduleName, maybeModuleTests ) ->
                        let
                            moduleTests =
                                List.filterMap identity maybeModuleTests
                        in
                        if List.isEmpty moduleTests then
                            Nothing

                        else
                            Just (Test.describe moduleName moduleTests)
                    )
    in
    if List.isEmpty testsList then
        Platform.worker
            { init = failInit (noTestsFoundError options.globs) options.report
            , update = \_ model -> ( model, Cmd.none )
            , subscriptions = \_ -> Sub.none
            }

    else
        let
            tests =
                Runner.toTests (Test.concat testsList)
        in
        Platform.worker
            { init = init options tests
            , update = update
            , subscriptions = \_ -> Ports.receive Receive
            }


noTestsFoundError : List String -> String
noTestsFoundError globs =
    if List.isEmpty globs then
        """
No exposed values of type Test found in the tests/ directory.

Are there tests in any .elm file in the tests/ directory?
If not – add some!
If there are – are they exposed?
        """
            |> String.trim

    else
        """
No exposed values of type Test found in files matching:

%globs

Are the above patterns correct? Maybe try running elm-test with no arguments?

Are there tests in any of the matched files?
If not – add some!
If there are – are they exposed?
        """
            |> String.trim
            |> String.replace "%globs" (String.join "\n" globs)
