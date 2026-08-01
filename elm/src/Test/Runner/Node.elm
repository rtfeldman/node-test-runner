module Test.Runner.Node exposing (checkTagged, run, TestProgram, PreviousRun)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs checkTagged, run, TestProgram, PreviousRun

-}

import Dict exposing (Dict)
import Json.Decode as Decode
import Json.Encode as Encode
import Platform
import Random
import Set exposing (Set)
import Task
import Test exposing (Test)
import Test.Distribution exposing (DistributionReport(..))
import Test.Reporter.Reporter exposing (Report, RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome(..), TestResult, isFailure, outcomeFromExpectations)
import Test.Runner exposing (FuzzTest, FuzzTestExpectation(..), Tests, UnitTest, UnitTestExpectation(..))
import Test.Runner.Failure exposing (Reason(..))
import Test.Runner.Ports as Ports exposing (JsMessage(..))



-- TYPES


type alias TestId =
    Int


type alias JsDefinitionName =
    String


type alias DebugLogs =
    Decode.Value


type alias InitArgs =
    { initialSeed : Int
    , processes : Int
    , globs : List String
    , paths : List String
    , fuzzRuns : Int
    , tests : Tests
    , report : Report
    , previousRun : PreviousRun
    }


type alias RunnerOptions =
    { seed : Int
    , runs : Int
    , report : Report
    , globs : List String
    , paths : List String
    , processes : Int
    , previousRun : PreviousRun
    }


type alias Model =
    { unitTests : Dict TestId UnitTest
    , fuzzTests : Dict TestId FuzzTest
    , runInfo : RunInfo
    , testReporter : TestReporter
    , processes : Int
    , autoFail : Maybe String
    , previousRun : PreviousRun
    }


type alias PreviousRun =
    { fuzzRuns : Int
    , initialSeed : Int
    , cachedTests : Dict JsDefinitionName CachedTests
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Int Model Msg


type Msg
    = Receive (Result Decode.Error JsMessage)


type alias CachedTests =
    { hash : String

    -- As an optimization, passing unit tests without debug logs are not stored.
    , unitTests : Dict (List String) ( UnitTestExpectation, DebugLogs )

    -- As an optimization, passing fuzz tests without debug logs and distribution report are not stored.
    , fuzzTests : Dict (List String) ( FuzzTestExpectation, DebugLogs )
    }


noDebugLogs : DebugLogs
noDebugLogs =
    Encode.list never []


isEmptyDebugLogs : DebugLogs -> Bool
isEmptyDebugLogs debugLogs =
    Decode.decodeValue (Decode.field "length" Decode.int) debugLogs == Ok 0


dispatchUnitTest : TestId -> Model -> ( Model, Cmd Msg )
dispatchUnitTest testId model =
    case Dict.get testId model.unitTests of
        Nothing ->
            ( model
            , Ports.sendError ("Unit test not found: " ++ String.fromInt testId)
            )

        Just unitTest ->
            let
                jsDefinitionName =
                    unitTest.tag

                hash =
                    getHash jsDefinitionName

                maybeCached =
                    Dict.get jsDefinitionName model.previousRun.cachedTests
                        |> Maybe.andThen
                            (\cachedTests ->
                                if hash == cachedTests.hash then
                                    case Dict.get unitTest.labels cachedTests.unitTests of
                                        -- As an optimization, passing unit tests without debug logs are not stored.
                                        Nothing ->
                                            Just ( UnitTestPass, noDebugLogs )

                                        cached ->
                                            cached

                                else
                                    Nothing
                            )

                ( ( expectation, duration ), debugLogs ) =
                    case maybeCached of
                        Just ( expectation_, debugLogs_ ) ->
                            ( ( expectation_, 0 ), debugLogs_ )

                        Nothing ->
                            ( runWithDuration unitTest.thunk, getAndClearDebugLogs False )

                outcome =
                    case expectation of
                        UnitTestPass ->
                            Passed NoDistribution

                        UnitTestFail { description, reason } ->
                            if reason == TODO then
                                Todo description

                            else
                                Failed
                                    ( { given = Nothing
                                      , description = description
                                      , reason = reason
                                      }
                                    , NoDistribution
                                    )

                result : TestResult
                result =
                    { labels = unitTest.labels
                    , outcome = outcome
                    , duration = duration
                    }

                report =
                    model.testReporter.reportComplete result

                expectationElmCode =
                    if expectation == UnitTestPass && isEmptyDebugLogs debugLogs then
                        Nothing

                    else
                        Just (Debug.toString expectation)
            in
            ( model
            , Ports.sendResult testId jsDefinitionName unitTest.labels expectationElmCode debugLogs report
            )


dispatchFuzzTest : TestId -> Model -> ( Model, Cmd Msg )
dispatchFuzzTest testId model =
    case Dict.get testId model.fuzzTests of
        Nothing ->
            ( model
            , Ports.sendError ("Fuzz test not found: " ++ String.fromInt testId)
            )

        Just fuzzTest ->
            let
                jsDefinitionName =
                    fuzzTest.tag

                hash =
                    getHash jsDefinitionName

                ( fuzzerInts, maybeCached ) =
                    case Dict.get jsDefinitionName model.previousRun.cachedTests of
                        Nothing ->
                            ( [], Nothing )

                        Just cachedTests ->
                            let
                                canUseCached =
                                    (hash == cachedTests.hash)
                                        && (model.runInfo.initialSeed == model.previousRun.initialSeed)
                                        -- If the fuzz tests specifies its own number of runs and the hash is the same,
                                        -- then the number of runs must be unchanged.
                                        && (fuzzTest.runs /= Nothing || model.runInfo.fuzzRuns <= model.previousRun.fuzzRuns)
                            in
                            case Dict.get fuzzTest.labels cachedTests.fuzzTests of
                                -- As an optimization, passing fuzz tests without debug logs and distribution report are not stored.
                                Nothing ->
                                    ( []
                                    , if canUseCached then
                                        Just ( FuzzTestPass { distributionReport = NoDistribution }, noDebugLogs )

                                      else
                                        Nothing
                                    )

                                (Just ( expectation_, debugLogs_ )) as cached ->
                                    let
                                        fuzzerInts_ =
                                            case expectation_ of
                                                FuzzTestPass _ ->
                                                    []

                                                FuzzTestFail data ->
                                                    data.fuzzerInts
                                    in
                                    ( fuzzerInts_
                                    , if canUseCached then
                                        cached

                                      else
                                        Nothing
                                    )

                ( ( expectation, duration ), debugLogs ) =
                    case maybeCached of
                        Just ( expectation_, debugLogs_ ) ->
                            ( ( expectation_, 0 ), debugLogs_ )

                        Nothing ->
                            let
                                seed =
                                    Random.initialSeed model.runInfo.initialSeed
                            in
                            getAndClearDebugLogs True
                                |> (\_ ->
                                        let
                                            ( expectation_, duration_ ) =
                                                runWithDuration (\() -> fuzzTest.thunk seed model.runInfo.fuzzRuns fuzzerInts)
                                        in
                                        case expectation_ of
                                            FuzzTestPass data ->
                                                ( ( expectation_, duration_ )
                                                , getAndClearDebugLogs False
                                                )

                                            FuzzTestFail data ->
                                                let
                                                    newDebugLogs =
                                                        getAndClearDebugLogs False
                                                            |> (\_ ->
                                                                    data.rerunFailure ()
                                                                        |> (\() -> getAndClearDebugLogs False)
                                                               )
                                                in
                                                ( ( expectation_, duration_ )
                                                , newDebugLogs
                                                )
                                   )

                outcome =
                    case expectation of
                        FuzzTestPass { distributionReport } ->
                            Passed distributionReport

                        FuzzTestFail { given, description, reason, distributionReport } ->
                            Failed
                                ( { given = given
                                  , description = description
                                  , reason = reason
                                  }
                                , distributionReport
                                )

                result : TestResult
                result =
                    { labels = fuzzTest.labels
                    , outcome = outcome
                    , duration = duration
                    }

                report =
                    model.testReporter.reportComplete result

                expectationElmCode =
                    if expectation == FuzzTestPass { distributionReport = NoDistribution } && isEmptyDebugLogs debugLogs then
                        Nothing

                    else
                        Debug.toString expectation
                            -- For `rerunFailure`:
                            |> String.replace "<function>" "identity"
                            |> Just
            in
            ( model
            , Ports.sendResult testId jsDefinitionName fuzzTest.labels expectationElmCode debugLogs report
            )


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive (Ok jsMessage) ->
            case jsMessage of
                RunUnitTest testId ->
                    dispatchUnitTest testId model

                RunFuzzTest testId ->
                    dispatchFuzzTest testId model

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


init : InitArgs -> Int -> ( Model, Cmd Msg )
init { processes, globs, paths, fuzzRuns, initialSeed, report, tests, previousRun } index =
    let
        autoFail =
            case ( tests.seenOnly, tests.seenSkip ) of
                ( False, False ) ->
                    Nothing

                ( True, False ) ->
                    Just "Test.only was used"

                ( False, True ) ->
                    Just "Test.skip was used"

                ( True, True ) ->
                    Just "Test.only and Test.skip were used"

        testCount =
            List.length tests.unitTests + List.length tests.fuzzTests

        testReporter =
            createReporter report

        model : Model
        model =
            { unitTests = toIndexedDict tests.unitTests
            , fuzzTests = toIndexedDict tests.fuzzTests
            , runInfo =
                { testCount = testCount
                , globs = globs
                , paths = paths
                , fuzzRuns = fuzzRuns
                , initialSeed = initialSeed
                }
            , processes = processes
            , testReporter = testReporter
            , autoFail = autoFail
            , previousRun = previousRun
            }
    in
    ( model
      -- TODO: `index` doesn't really make sense anymore.
    , if index == 0 then
        Ports.sendBegin
            (Dict.size model.unitTests)
            (Dict.size model.fuzzTests)
            (model.testReporter.reportBegin model.runInfo)

      else
        Cmd.none
    )


failInit : String -> Report -> Int -> ( Model, Cmd Msg )
failInit message report _ =
    let
        model : Model
        model =
            { unitTests = Dict.empty
            , fuzzTests = Dict.empty
            , runInfo =
                { testCount = 0
                , globs = []
                , paths = []
                , fuzzRuns = 0
                , initialSeed = 0
                }
            , processes = 0
            , testReporter = createReporter report
            , autoFail = Nothing
            , previousRun =
                { fuzzRuns = 0
                , initialSeed = 0
                , cachedTests = Dict.empty
                }
            }

        cmd =
            -- TODO: This isn't using the reporter? How does that work?
            Ports.sendSummary 1 (Encode.string message)
    in
    ( model, cmd )


toIndexedDict : List a -> Dict Int a
toIndexedDict list =
    list
        |> List.indexedMap Tuple.pair
        |> Dict.fromList


checkTagged : a -> JsDefinitionName -> Maybe Test
checkTagged value jsDefinitionName =
    check value
        |> Maybe.map (Test.Runner.tagTest jsDefinitionName)


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
run : RunnerOptions -> List ( String, List (Maybe Test) ) -> Program Int Model Msg
run { runs, seed, report, globs, paths, processes, previousRun } possiblyTests =
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
            { init = failInit (noTestsFoundError globs) report
            , update = \_ model -> ( model, Cmd.none )
            , subscriptions = \_ -> Sub.none
            }

    else
        let
            tests =
                Test.Runner.toTests (Test.concat testsList)

            wrappedInit =
                init
                    { initialSeed = seed
                    , processes = processes
                    , globs = globs
                    , paths = paths
                    , fuzzRuns = runs
                    , tests = tests
                    , report = report
                    , previousRun = previousRun
                    }
        in
        Platform.worker
            { init = wrappedInit
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
