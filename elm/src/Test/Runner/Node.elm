port module Test.Runner.Node exposing (foo, run, TestProgram, PreviousRun)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs foo, run, TestProgram, PreviousRun

-}

import Dict exposing (Dict)
import Json.Decode as Decode
import Json.Encode as Encode
import Platform
import Random
import Set exposing (Set)
import Task
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report, RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome, TestResult, isFailure, outcomeFromExpectations)
import Test.Runner exposing (FuzzTest, FuzzTestExpectation(..), Tests, UnitTest, UnitTestExpectation(..))
import Test.Runner.Failure exposing (Reason)
import Test.Runner.JsMessage as JsMessage exposing (JsMessage(..))
import Time exposing (Posix)



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
    { unitTests : List UnitTest
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
    = Receive Decode.Value
    | DispatchUnitTest Posix
    | Complete String (List String) UnitTestExpectation DebugLogs (List UnitTest) Posix Posix


{-| The port names are prefixed to reduce the likelihood of the project
having a port with the same name, which is a compile error.
-}
port elmTestPort__send : Decode.Value -> Cmd msg


port elmTestPort__receive : (Decode.Value -> msg) -> Sub msg


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


dispatchUnitTest : Model -> Posix -> Cmd Msg
dispatchUnitTest model startTime =
    case model.unitTests of
        [] ->
            -- We're finished! Nothing left to run.
            -- TODO: Send new message: finished but no data
            sendResults True model.testReporter model.results

        unitTest :: remainingUnitTests ->
            let
                hash =
                    getHash unitTest.tag

                maybeCached =
                    Dict.get unitTest.tag model.previousRun.cachedTests
                        |> Maybe.andThen
                            (\cachedTests ->
                                if hash == cachedTests.hash then
                                    Dict.get unitTest.labels cachedTests.unitTests
                                        -- As an optimization, passing unit tests without debug logs are not stored.
                                        |> Maybe.withDefault ( UnitTestPass, noDebugLogs )

                                else
                                    Nothing
                            )

                ( expectation, debugLogs ) =
                    case maybeCached of
                        Just cached ->
                            cached

                        Nothing ->
                            ( unitTest.thunk (), getAndClearDebugLogs False )
            in
            Time.now
                |> Task.perform (Complete hash unitTest.labels expectation debugLogs remainingUnitTests startTime)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive val ->
            case Decode.decodeValue JsMessage.decoder val of
                Ok RunUnitTests ->
                    ( model
                    , Task.perform DispatchUnitTest Time.now
                    )

                Ok (RunFuzzTest testId) ->
                    -- TODO: Run fuzz test
                    ( model, Cmd.none )

                Ok (Summary duration failed todos) ->
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
                            Encode.object
                                [ ( "type", Encode.string "SUMMARY" )
                                , ( "exitCode", Encode.int exitCode )
                                , ( "message", summary )
                                ]
                                |> elmTestPort__send
                    in
                    ( model, cmd )

                Err err ->
                    let
                        cmd =
                            Encode.object
                                [ ( "type", Encode.string "ERROR" )
                                , ( "message", Encode.string (Decode.errorToString err) )
                                ]
                                |> elmTestPort__send
                    in
                    ( model, cmd )

        DispatchUnitTest startTime ->
            ( model, dispatchUnitTest model startTime )

        Complete hash labels expectation debugLogs remainingUnitTests startTime endTime ->
            let
                duration =
                    Time.posixToMillis endTime - Time.posixToMillis startTime

                results =
                    ( model.nextTestToRun
                    , { labels = labels
                      , outcome = outcome2.outcome
                      , duration = duration
                      , jsDefinitionName = metadata.jsDefinitionName
                      , isFuzzTest = outcome2.isFuzzTest
                      , usedDebugLog = outcome2.usedDebugLog
                      }
                    )
                        :: model.results

                nextTestToRun =
                    model.nextTestToRun + model.processes

                isFinished =
                    nextTestToRun >= model.runInfo.testCount
            in
            ( { model | unitTests = remainingUnitTests }
            , Cmd.batch
                [ cmd
                , sendResults isFinished testReporter results
                ]
            )


sendResults : TestReporter -> List ( TestId, TestResult ) -> Cmd msg
sendResults testReporter results =
    let
        typeStr =
            if isFinished then
                "FINISHED"

            else
                "RESULTS"

        addToKeyValues ( testId, result ) list =
            -- These are coming in in reverse order. Doing a foldl with ::
            -- means we reverse the list again, while also doing the conversion!
            ( String.fromInt testId, testReporter.reportComplete result ) :: list

        encodeNewStuff ( _, result ) =
            let
                dictTuple : ( List String, Outcome2 )
                dictTuple =
                    ( result.labels
                    , { outcome = result.outcome
                      , isFuzzTest = result.isFuzzTest
                      , usedDebugLog = result.usedDebugLog
                      }
                    )
            in
            Encode.object
                [ ( "jsDefinitionName", Encode.string result.jsDefinitionName )
                , ( "dictTupleElmCode", Encode.string (Debug.toString dictTuple) )
                ]
    in
    Encode.object
        [ ( "type", Encode.string typeStr )
        , ( "results"
          , results
                |> List.foldl addToKeyValues []
                |> Encode.object
          )
        , ( "newStuff", Encode.list encodeNewStuff results )
        ]
        |> elmTestPort__send


sendBegin : Model -> Cmd msg
sendBegin model =
    let
        extraFields =
            case model.testReporter.reportBegin model.runInfo of
                Just report ->
                    [ ( "message", report ) ]

                Nothing ->
                    []

        fields =
            ( "type", Encode.string "BEGIN" )
                :: ( "testCount", Encode.int model.runInfo.testCount )
                :: ( "fuzzTests", Encode.list Encode.int (Dict.keys model.fuzzTests) )
                :: extraFields
    in
    Encode.object fields
        |> elmTestPort__send


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
            { unitTests = tests.unitTests
            , fuzzTests = toIndexedDict tests.fuzzTests
            , runInfo =
                { testCount = testCount
                , globs = globs
                , paths = paths
                , fuzzRuns = fuzzRuns
                , initialSeed = initialSeed
                }
            , processes = processes
            , results = []
            , testReporter = testReporter
            , autoFail = autoFail
            , previousRun = previousRun
            }

        cmd =
            Task.perform DispatchUnitTest Time.now
    in
    ( model
    , Cmd.batch
        [ cmd
        , if index == 0 then
            sendBegin model

          else
            Cmd.none
        ]
    )


failInit : String -> Report -> Int -> ( Model, Cmd Msg )
failInit message report _ =
    let
        model : Model
        model =
            { unitTests = []
            , fuzzTests = Dict.empty
            , runInfo =
                { testCount = 0
                , globs = []
                , paths = []
                , fuzzRuns = 0
                , initialSeed = 0
                }
            , processes = 0
            , results = []
            , testReporter = createReporter report
            , autoFail = Nothing
            , previousRun =
                { fuzzRuns = 0
                , initialSeed = 0
                , fingerprints = Dict.empty
                }
            }

        cmd =
            Encode.object
                [ ( "type", Encode.string "SUMMARY" )
                , ( "exitCode", Encode.int 1 )
                , ( "message", Encode.string message )
                ]
                |> elmTestPort__send
    in
    ( model, cmd )


toIndexedDict : List a -> Dict Int a
toIndexedDict list =
    list
        |> List.indexedMap Tuple.pair
        |> Dict.fromList


foo : a -> JsDefinitionName -> Maybe Test
foo value jsDefinitionName =
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
            , subscriptions = \_ -> elmTestPort__receive Receive
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
