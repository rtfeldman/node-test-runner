module Test.Runner.Node.App exposing (run, Model, Msg, RunnerOptions)

{-| Test runner for a Node app

@docs run

-}

import Test.Reporter.Reporter as Reporter exposing (Report(ChalkReport))
import Test exposing (Test)
import Test.Runner exposing (Runner, SeededRunners)
import Task
import Random.Pcg
import Time exposing (Time)
import Json.Decode as Decode exposing (Value, Decoder)
import String
import Tuple
import Platform


type Msg subMsg
    = Init Time
    | SubMsg subMsg


type alias InitArgs =
    { initialSeed : Int
    , fuzzRuns : Int
    , startTime : Time
    , paths : List String
    , runners : SeededRunners
    , report : Reporter.Report
    }


type Model subMsg subModel
    = Initialized (SubUpdate subMsg subModel) subModel
    | Uninitialized
        (SubUpdate subMsg subModel)
        { maybeInitialSeed : Maybe Int
        , report : Reporter.Report
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
        Uninitialized update { maybeInitialSeed, report, paths, runs, test, init } ->
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
    , reporter : Maybe String
    , paths : List String
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


intFromString : Decoder Int
intFromString =
    Decode.string
        |> Decode.andThen
            (\str ->
                case String.toInt str of
                    Ok num ->
                        Decode.succeed num

                    Err err ->
                        Decode.fail err
            )


decodeReport : Decoder String -> Decoder Reporter.Report
decodeReport decoder =
    decoder
        |> Decode.andThen
            (\str ->
                case str of
                    "json" ->
                        Decode.succeed Reporter.JsonReport

                    "chalk" ->
                        Decode.succeed Reporter.ChalkReport

                    "junit" ->
                        Decode.succeed Reporter.JUnitReport

                    _ ->
                        Decode.fail <| "Invalid --report argument: " ++ str
            )


decodeInitArgs : Value -> Result String ( Maybe Int, List String, Reporter.Report )
decodeInitArgs args =
    args
        |> Decode.decodeValue
            (Decode.oneOf
                [ Decode.null ( Nothing, [], ChalkReport )
                , Decode.map3 (,,)
                    (Decode.field "seed" (Decode.nullable intFromString))
                    (Decode.field "paths" (Decode.list Decode.string))
                    (Decode.field "report" (decodeReport Decode.string))
                ]
            )


defaultRunCount : Int
defaultRunCount =
    100


{-| Run the tests and render the results as a Web page.
-}
run : RunnerOptions -> AppOptions msg model -> Test -> Program Value (Model msg model) (Msg msg)
run { runs, seed, reporter, paths } appOpts test =
    let
        init args =
            let
                cmd =
                    Task.perform Init Time.now

                report =
                    case reporter of
                        Nothing ->
                            ChalkReport

                        Just someReport ->
                            case Reporter.fromString someReport of
                                Ok validReport ->
                                    validReport

                                Err err ->
                                    Debug.crash err
            in
                ( Uninitialized appOpts.update
                    { maybeInitialSeed = seed
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
