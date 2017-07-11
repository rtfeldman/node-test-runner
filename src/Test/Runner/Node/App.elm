module Test.Runner.Node.App exposing (InitArgs, Model, Msg, RunnerOptions, run)

{-| Test runner for a Node app

@docs run

-}

import Json.Decode as Decode exposing (Value)
import Platform
import Random.Pcg
import Task
import Test exposing (Test)
import Test.Reporter.Reporter as Reporter exposing (Report(ConsoleReport))
import Test.Runner exposing (Runner, SeededRunners)
import Time exposing (Time)


type Msg subMsg
    = Init Time
    | SubMsg subMsg


type alias InitArgs =
    { initialSeed : Int
    , processes : Int
    , paths : List String
    , fuzzRuns : Int
    , startTime : Time
    , runners : SeededRunners
    , report : Report
    }


type Model subMsg subModel
    = Initialized (SubUpdate subMsg subModel) subModel
    | Uninitialized
        (SubUpdate subMsg subModel)
        { maybeInitialSeed : Maybe Int
        , report : Report
        , processes : Int
        , runs : Int
        , paths : List String
        , test : Test
        , init : InitArgs -> ( subModel, Cmd subMsg )
        }


timeToNumericSeed : Time -> Int
timeToNumericSeed time =
    time
        |> floor
        |> Random.Pcg.initialSeed
        |> Random.Pcg.step (Random.Pcg.int 100 Random.Pcg.maxInt)
        |> Tuple.first


initOrUpdate : Msg subMsg -> Model subMsg subModel -> ( Model subMsg subModel, Cmd (Msg subMsg) )
initOrUpdate msg maybeModel =
    case maybeModel of
        Uninitialized update { maybeInitialSeed, processes, report, paths, runs, test, init } ->
            case msg of
                Init time ->
                    let
                        numericSeed =
                            case maybeInitialSeed of
                                Just givenNumericSeed ->
                                    givenNumericSeed

                                Nothing ->
                                    timeToNumericSeed time

                        seed =
                            Random.Pcg.initialSeed numericSeed

                        runners =
                            Test.Runner.fromTest runs seed test

                        ( subModel, subCmd ) =
                            init
                                { initialSeed = numericSeed
                                , processes = processes
                                , fuzzRuns = runs
                                , paths = paths
                                , startTime = time
                                , runners = runners
                                , report = report
                                }
                    in
                    ( Initialized update subModel, Cmd.map SubMsg subCmd )

                SubMsg _ ->
                    Debug.crash "Attempted to run a SubMsg pre-Init!"

        Initialized update model ->
            case msg of
                SubMsg subMsg ->
                    let
                        ( newModel, cmd ) =
                            update subMsg model
                    in
                    ( Initialized update newModel, Cmd.map SubMsg cmd )

                Init _ ->
                    Debug.crash "Attempted to init twice!"


type alias SubUpdate msg model =
    msg -> model -> ( model, Cmd msg )


type alias RunnerOptions =
    { seed : Maybe Int
    , runs : Maybe Int
    , report : Report
    , paths : List String
    , processes : Int
    }


type alias AppOptions msg model =
    { init : InitArgs -> ( model, Cmd msg )
    , update : SubUpdate msg model
    , subscriptions : model -> Sub msg
    }


subscriptions : (subModel -> Sub subMsg) -> Model subMsg subModel -> Sub (Msg subMsg)
subscriptions subs model =
    case model of
        Uninitialized _ _ ->
            Sub.none

        Initialized _ subModel ->
            Sub.map SubMsg (subs subModel)


defaultRunCount : Int
defaultRunCount =
    100


{-| Run the tests and render the results as a Web page.
-}
run : RunnerOptions -> AppOptions msg model -> Test -> Program Value (Model msg model) (Msg msg)
run { runs, seed, report, paths, processes } appOpts test =
    let
        init args =
            let
                cmd =
                    Task.perform Init Time.now
            in
            ( Uninitialized appOpts.update
                { maybeInitialSeed = seed
                , processes = processes
                , report = report
                , runs = Maybe.withDefault defaultRunCount runs
                , paths = paths
                , test = test
                , init = appOpts.init
                }
            , cmd
            )
    in
    Platform.programWithFlags
        { init = init
        , update = initOrUpdate
        , subscriptions = subscriptions appOpts.subscriptions
        }
