port module Test.Runner.Node exposing (check, run, TestProgram)

{-|


# Node Runner

Runs a test and outputs its results to the console. Exit code is 0 if tests
passed and 2 if any failed. Returns 1 if something went wrong.

@docs check, run, TestProgram

-}

import Dict exposing (Dict)
import Expect exposing (Expectation)
import Json.Decode as Decode
import Json.Encode as Encode
import Platform
import Random
import Task
import Test exposing (Test)
import Test.Reporter.Reporter exposing (Report, RunInfo, TestReporter, createReporter)
import Test.Reporter.TestResults exposing (Outcome, TestResult, isFailure, outcomesFromExpectations)
import Test.Runner exposing (Runner, SeededRunners(..))
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
    , runners : SeededRunners
    , report : Report
    , metadata : Metadata
    }


type alias RunnerOptions =
    { seed : Int
    , runs : Int
    , report : Report
    , globs : List String
    , paths : List String
    , processes : Int
    }


type alias Model =
    { available : Dict TestId Runner
    , runInfo : RunInfo
    , testReporter : TestReporter
    , results : List ( TestId, TestResult )
    , processes : Int
    , nextTestToRun : TestId
    , autoFail : Maybe String
    , metadata : Metadata
    }


type alias Metadata =
    Dict ( String, String ) MetadataItem


type alias MetadataItem =
    { jsDefinitionName : String
    , hash : String
    }


{-| A program which will run tests and report their results.
-}
type alias TestProgram =
    Platform.Program Int Model Msg


type Msg
    = Receive Decode.Value
    | Dispatch Posix
    | Complete MetadataItem (List String) Outcome2 Posix Posix


{-| The port names are prefixed to reduce the likelihood of the project
having a port with the same name, which is a compile error.
-}
port elmTestPort__send : String -> Cmd msg


port elmTestPort__receive : (Decode.Value -> msg) -> Sub msg


type alias Fingerprints =
    { hash : String
    , outcomes : Dict (List String) Outcome2
    }


type alias Outcome2 =
    { isFuzzTest : Bool
    , outcomes : List Outcome
    }


oldFuzzRuns : Int
oldFuzzRuns =
    0


oldInitialSeed : Int
oldInitialSeed =
    0


oldFingerprints : Dict String Fingerprints
oldFingerprints =
    -- TODO:
    -- Have these three definitions in a separate file? Or pass around?
    -- Could import a file with the hardcoded empty values and exposing (..)
    -- then insert the real values in this file, they shadow the imports
    -- Note: Can code-gen easily with Debug.toString
    -- Update `sendResults` to also send what we need to build the file (Debug.toString-ed stuff)
    -- When tests done, assemble everything we need
    Dict.empty


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

                        -- This should not happen: All tests should have metadata.
                        -- TODO: Can we get here for `Test.todo`?
                        Nothing ->
                            { jsDefinitionName = "MISSING:" ++ Debug.toString config.labels, hash = "" }

                maybeCachedOutcome =
                    Dict.get metadata.jsDefinitionName oldFingerprints
                        |> Maybe.andThen
                            (\fingerprints ->
                                if metadata.hash == fingerprints.hash then
                                    Dict.get config.labels fingerprints.outcomes
                                        |> Maybe.andThen
                                            (\outcome_ ->
                                                if
                                                    not outcome_.isFuzzTest
                                                        || ((model.runInfo.fuzzRuns <= oldFuzzRuns)
                                                                && (model.runInfo.initialSeed == oldInitialSeed)
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
                            runTestAndCheckIfFuzzTest config.run
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


runTestAndCheckIfFuzzTest : (() -> List Expectation) -> Outcome2
runTestAndCheckIfFuzzTest run_ =
    -- Replace with kernel code that:
    -- Resets global `isFuzzTest` var to `false`
    -- Reads it again instead of `False` below
    -- + patch `fuzzLoop` to set `isFuzzTest` to `true`
    { outcomes = outcomesFromExpectations (run_ ())
    , isFuzzTest = False
    }


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
                                |> Encode.encode 0
                                |> elmTestPort__send
                    in
                    ( model, cmd )

                Ok (Test index) ->
                    let
                        cmd =
                            Task.perform Dispatch Time.now
                    in
                    if index == -1 then
                        ( { model | nextTestToRun = index + model.processes }
                        , Cmd.batch [ cmd, sendBegin model ]
                        )

                    else
                        ( { model | nextTestToRun = index }, cmd )

                Err err ->
                    let
                        cmd =
                            Encode.object
                                [ ( "type", Encode.string "ERROR" )
                                , ( "message", Encode.string (Decode.errorToString err) )
                                ]
                                |> Encode.encode 0
                                |> elmTestPort__send
                    in
                    ( model, cmd )

        Dispatch startTime ->
            ( model, dispatch model startTime )

        Complete metadata labels outcome2 startTime endTime ->
            let
                duration =
                    Time.posixToMillis endTime - Time.posixToMillis startTime

                prependOutcome outcome rest =
                    -- NOTE: This can add multiple results with the same test ID.
                    -- Later in `sendResults` we encode the results as a JSON object
                    -- keyed by test ID. When parsing that JSON, the last one of
                    -- each duplicate key wins. All in all, the code gives the
                    -- impression of that a single test somehow can result in multiple
                    -- outcomes, and for a while the code supports that, but then we
                    -- implicitly decided there is a single outcome and forget about
                    -- the rest. If there ever were any. I’m not sure.
                    ( model.nextTestToRun
                    , { labels = labels
                      , outcome = outcome
                      , duration = duration
                      , jsDefinitionName = metadata.jsDefinitionName
                      , isFuzzTest = outcome2.isFuzzTest
                      }
                    )
                        :: rest

                results =
                    List.foldl prependOutcome model.results outcome2.outcomes

                nextTestToRun =
                    model.nextTestToRun + model.processes

                isFinished =
                    nextTestToRun >= model.runInfo.testCount
            in
            if isFinished || List.any isFailure outcome2.outcomes then
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
                    ( result.labels, { isFuzzTest = result.isFuzzTest, outcomes = [ result.outcome ] } )
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
        |> Encode.encode 0
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
        |> Encode.encode 0
        |> elmTestPort__send


init : InitArgs -> Int -> ( Model, Cmd Msg )
init { processes, globs, paths, fuzzRuns, initialSeed, report, runners, metadata } _ =
    let
        { indexedRunners, autoFail } =
            case runners of
                Plain runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
                    , autoFail = Nothing
                    }

                Only runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
                    , autoFail = Just "Test.only was used"
                    }

                Skipping runnerList ->
                    { indexedRunners = List.indexedMap (\a b -> ( a, b )) runnerList
                    , autoFail = Just "Test.skip was used"
                    }

                Invalid str ->
                    { indexedRunners = []
                    , autoFail = Just str
                    }

        testCount =
            List.length indexedRunners

        testReporter =
            createReporter report

        model : Model
        model =
            { available = Dict.fromList indexedRunners
            , runInfo =
                { testCount = testCount
                , globs = globs
                , paths = paths
                , fuzzRuns = fuzzRuns
                , initialSeed = initialSeed
                }
            , processes = processes
            , nextTestToRun = 0
            , results = []
            , testReporter = testReporter
            , autoFail = autoFail
            , metadata = metadata
            }
    in
    ( model, Cmd.none )


failInit : String -> Report -> Int -> ( Model, Cmd Msg )
failInit message report _ =
    let
        model : Model
        model =
            { available = Dict.empty
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
            , metadata = Dict.empty
            }

        cmd =
            Encode.object
                [ ( "type", Encode.string "SUMMARY" )
                , ( "exitCode", Encode.int 1 )
                , ( "message", Encode.string message )
                ]
                |> Encode.encode 0
                |> elmTestPort__send
    in
    ( model, cmd )


type alias TestWithMetadata =
    { test : Test
    , jsDefinitionName : String
    , hash : String
    , label : String
    }


{-| The implementation of this function will be replaced in the generated JS
with a version that returns `Just value` if `value` is a `Test`, otherwise `Nothing`.

If you rename or change this function you also need to update the regex that looks for it.

-}
check : a -> String -> String -> Maybe TestWithMetadata
check =
    checkHelperReplaceMe___


checkHelperReplaceMe___ : a -> String -> String -> b
checkHelperReplaceMe___ _ _ _ =
    Debug.todo "The regex for replacing this Debug.todo with some real code must have failed since you see this message!\n\nPlease report this bug: https://github.com/rtfeldman/node-test-runner/issues/new\n"


{-| Run the tests.
-}
run : RunnerOptions -> List ( String, List (Maybe TestWithMetadata) ) -> Program Int Model Msg
run { runs, seed, report, globs, paths, processes } possiblyTests =
    let
        ( tests, metadata ) =
            possiblyTests
                |> List.filterMap
                    (\( moduleName, maybeModuleTests ) ->
                        let
                            moduleTestsWithMetadata =
                                List.filterMap identity maybeModuleTests

                            moduleTests =
                                List.map .test moduleTestsWithMetadata
                        in
                        if List.isEmpty moduleTests then
                            Nothing

                        else
                            Just
                                ( Test.describe moduleName moduleTests
                                , moduleTestsWithMetadata
                                    |> List.map
                                        (\data ->
                                            ( ( moduleName, data.label )
                                            , { jsDefinitionName = data.jsDefinitionName, hash = data.hash }
                                            )
                                        )
                                )
                    )
                |> List.unzip
                |> Tuple.mapSecond (List.concat >> Dict.fromList)
    in
    if List.isEmpty tests then
        Platform.worker
            { init = failInit (noTestsFoundError globs) report
            , update = \_ model -> ( model, Cmd.none )
            , subscriptions = \_ -> Sub.none
            }

    else
        let
            runners =
                Test.Runner.fromTest runs (Random.initialSeed seed) (Test.concat tests)

            wrappedInit =
                init
                    { initialSeed = seed
                    , processes = processes
                    , globs = globs
                    , paths = paths
                    , fuzzRuns = runs
                    , runners = runners
                    , report = report
                    , metadata = metadata
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
