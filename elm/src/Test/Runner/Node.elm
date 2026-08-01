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
import Test.Runner exposing (FuzzTest, Tests, UnitTest)
import Test.Runner.JsMessage as JsMessage exposing (JsMessage(..))
import Time exposing (Posix)



-- TYPES


type alias TestId =
    Int


type alias InitArgs =
    { initialSeed : Int
    , processes : Int
    , globs : List String
    , paths : List String
    , fuzzRuns : Int
    , tests : Tests
    , report : Report
    , hashes : Hashes
    , previousRun : PreviousRun
    }


type alias RunnerOptions =
    { seed : Int
    , runs : Int
    , report : Report
    , globs : List String
    , paths : List String
    , processes : Int
    , hashes : Hashes
    , previousRun : PreviousRun
    }


type alias Model =
    { unitTests : Dict TestId UnitTest
    , fuzzTests : Dict TestId FuzzTest
    , runInfo : RunInfo
    , testReporter : TestReporter
    , results : List ( TestId, TestResult )
    , processes : Int
    , nextTestToRun : TestId
    , autoFail : Maybe String
    , hashes : Hashes
    , previousRun : PreviousRun
    }


type alias Hashes =
    -- jsDefinitionName to hash
    Dict String String


type alias PreviousRun =
    { fuzzRuns : Int
    , initialSeed : Int
    , fingerprints : Dict String Fingerprints
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Int Model Msg


type Msg
    = Receive Decode.Value
    | Dispatch Posix
    | Complete String {- MetadataItem -} (List String) Outcome2 Posix Posix


{-| The port names are prefixed to reduce the likelihood of the project
having a port with the same name, which is a compile error.
-}
port elmTestPort__send : Decode.Value -> Cmd msg


port elmTestPort__receive : (Decode.Value -> msg) -> Sub msg


type alias Fingerprints =
    { hash : String
    , outcomes : Dict (List String) Outcome2
    }


type alias Outcome2 =
    { outcome : Outcome
    , isFuzzTest : Bool
    , usedDebugLog : Bool
    }


dispatch : Model -> Posix -> Cmd Msg
dispatch model startTime =
    case Dict.get model.nextTestToRun model.available of
        Nothing ->
            -- We're finished! Nothing left to run.
            sendResults True model.testReporter model.results

        Just config ->
            let
                metadata =
                    case lastTwoReversed config.labels |> Maybe.andThen (\key -> Dict.get key model.metadata) of
                        Just metadata_ ->
                            metadata_

                        -- A `Test.todo` not nested under any `Test.describe` ends up here (`config.labels` only
                        -- contains _one_ label – the one added automatically to each module).
                        -- Luckily, there is not really much speed gain to caching `Test.todo`s.
                        Nothing ->
                            { jsDefinitionName = "", hash = "" }

                maybeCachedOutcome =
                    Dict.get metadata.jsDefinitionName model.previousRun.fingerprints
                        |> Maybe.andThen
                            (\fingerprints ->
                                if metadata.hash == fingerprints.hash then
                                    Dict.get config.labels fingerprints.outcomes
                                        |> Maybe.andThen
                                            (\outcome_ ->
                                                if
                                                    not outcome_.usedDebugLog
                                                        && (not outcome_.isFuzzTest
                                                                || ((model.runInfo.fuzzRuns <= model.previousRun.fuzzRuns)
                                                                        && (model.runInfo.initialSeed == model.previousRun.initialSeed)
                                                                   )
                                                           )
                                                then
                                                    Just outcome_

                                                else
                                                    Nothing
                                            )

                                else
                                    Nothing
                            )

                outcome =
                    case maybeCachedOutcome of
                        Just outcome_ ->
                            outcome_

                        Nothing ->
                            let
                                ( expectations, isFuzzTest, usedDebugLog ) =
                                    detectFuzzTestAndDebugLog config.run
                            in
                            { outcome = outcomeFromExpectations expectations
                            , isFuzzTest = isFuzzTest
                            , usedDebugLog = usedDebugLog
                            }
            in
            Time.now
                |> Task.perform (Complete metadata config.labels outcome startTime)


lastTwoReversed : List a -> Maybe ( a, a )
lastTwoReversed list =
    case list of
        [ a, b ] ->
            Just ( b, a )

        _ :: rest ->
            lastTwoReversed rest

        _ ->
            Nothing


{-| The implementation of this function will be replaced in the generated JS
with a version that returns calls the passed function, and detects if it was
a fuzz test.

If you rename or change this function you also need to update the regex that looks for it.

-}
detectFuzzTestAndDebugLog : (() -> a) -> ( a, Bool, Bool )
detectFuzzTestAndDebugLog =
    detectFuzzTestAndDebugLogHelperReplaceMe___


detectFuzzTestAndDebugLogHelperReplaceMe___ : (() -> a) -> ( a, Bool, Bool )
detectFuzzTestAndDebugLogHelperReplaceMe___ _ =
    Debug.todo "The regex for replacing this Debug.todo in detectFuzzTestAndDebugLogHelperReplaceMe___ with some real code must have failed since you see this message!\n\nPlease report this bug: https://github.com/rtfeldman/node-test-runner/issues/new\n"


update : Msg -> Model -> ( Model, Cmd Msg )
update msg ({ testReporter } as model) =
    case msg of
        Receive val ->
            case Decode.decodeValue JsMessage.decoder val of
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

        Dispatch startTime ->
            ( model, dispatch model startTime )

        Complete metadata labels outcome2 startTime endTime ->
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
            if isFinished || isFailure outcome2.outcome then
                let
                    cmd =
                        sendResults isFinished testReporter results
                in
                if isFinished then
                    -- Don't bother updating the model, since we're done
                    ( model, cmd )

                else
                    -- Clear out the results, now that we've flushed them.
                    ( { model | nextTestToRun = nextTestToRun, results = [] }
                    , Cmd.batch
                        [ cmd
                        , Task.perform Dispatch Time.now
                        ]
                    )

            else
                ( { model | nextTestToRun = nextTestToRun, results = results }
                , Task.perform Dispatch Time.now
                )


sendResults : Bool -> TestReporter -> List ( TestId, TestResult ) -> Cmd msg
sendResults isFinished testReporter results =
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
        baseFields =
            [ ( "type", Encode.string "BEGIN" )
            , ( "testCount", Encode.int model.runInfo.testCount )
            ]

        extraFields =
            case model.testReporter.reportBegin model.runInfo of
                Just report ->
                    [ ( "message", report ) ]

                Nothing ->
                    []
    in
    Encode.object (baseFields ++ extraFields)
        |> elmTestPort__send


init : InitArgs -> Int -> ( Model, Cmd Msg )
init { processes, globs, paths, fuzzRuns, initialSeed, report, tests, hashes, previousRun } index =
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
            , nextTestToRun = index
            , results = []
            , testReporter = testReporter
            , autoFail = autoFail
            , hashes = hashes
            , previousRun = previousRun
            }

        cmd =
            Task.perform Dispatch Time.now
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
            , nextTestToRun = 0
            , results = []
            , testReporter = createReporter report
            , autoFail = Nothing
            , hashes = Dict.empty
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


foo : a -> String -> Maybe Test
foo value jsDefinitionName =
    check value
        |> Maybe.map (Test.Runner.tagTest jsDefinitionName)


{-| The implementation of this function will be replaced in the generated JS
with a version that returns `Just value` if `value` is a `Test`, otherwise `Nothing`.

If you rename or change this function you also need to update the regex that looks for it.

-}
check : a -> Maybe Test
check =
    checkHelperReplaceMe___


checkHelperReplaceMe___ : a -> b
checkHelperReplaceMe___ _ =
    Debug.todo "The regex for replacing this Debug.todo in checkHelperReplaceMe___ with some real code must have failed since you see this message!\n\nPlease report this bug: https://github.com/rtfeldman/node-test-runner/issues/new\n"


{-| Run the tests.
-}
run : RunnerOptions -> List ( String, List (Maybe Test) ) -> Program Int Model Msg
run { runs, seed, report, globs, paths, processes, hashes, previousRun } possiblyTests =
    -- TODO: Codegen the hashes.
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
                    , hashes = hashes
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
