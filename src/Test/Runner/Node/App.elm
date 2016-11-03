module Test.Runner.Node.App exposing (run, Model, Msg)

{-| Test runner for a Node app

@docs run

-}

import Test.Reporter.Reporter as Reporter exposing (Report(ChalkReport))
import Test exposing (Test)
import Test.Runner exposing (Runner(..))
import Expect exposing (Expectation)
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
    , startTime : Time
    , thunks : List (() -> ( List String, List Expectation ))
    , report : Reporter.Report
    }


type Model subMsg subModel
    = Initialized (SubUpdate subMsg subModel) subModel
    | Uninitialized
        (SubUpdate subMsg subModel)
        { maybeInitialSeed : Maybe Int
        , report : Reporter.Report
        , runs : Int
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


fromNever : Never -> a
fromNever a =
    fromNever a


initOrUpdate : Msg subMsg -> Model subMsg subModel -> ( Model subMsg subModel, Cmd (Msg subMsg) )
initOrUpdate msg maybeModel =
    case maybeModel of
        Uninitialized update { maybeInitialSeed, report, runs, test, init } ->
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

                        thunks =
                            test
                                |> Test.Runner.fromTest runs seed
                                |> toThunks

                        ( subModel, subCmd ) =
                            init
                                { initialSeed = numericSeed
                                , startTime = time
                                , thunks = thunks
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
    , runs : Int
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


toThunks : Runner -> List (() -> ( List String, List Expectation ))
toThunks =
    toThunksHelp []


toThunksHelp : List String -> Runner -> List (() -> ( List String, List Expectation ))
toThunksHelp labels runner =
    case runner of
        Runnable runnable ->
            [ \() -> ( labels, Test.Runner.run runnable ) ]

        Labeled label subRunner ->
            toThunksHelp (label :: labels) subRunner

        Batch runners ->
            List.concatMap (toThunksHelp labels) runners


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

                    _ ->
                        Decode.fail <| "Invalid --report argument: " ++ str
            )


decodeInitArgs : Value -> Result String ( Maybe Int, Reporter.Report )
decodeInitArgs args =
    args
        |> Decode.decodeValue
            (Decode.oneOf
                [ Decode.null ( Nothing, ChalkReport )
                , (Decode.map2 (,)
                    (Decode.field "seed" (Decode.nullable intFromString))
                    (Decode.field "report" (decodeReport Decode.string))
                  )
                ]
            )


{-| Run the tests and render the results as a Web page.
-}
run : RunnerOptions -> AppOptions msg model -> Test -> Program Value (Model msg model) (Msg msg)
run { runs, seed } appOpts test =
    let
        init args =
            let
                cmd =
                    Task.perform Init Time.now

                initArgs : ( Maybe Int, Reporter.Report )
                initArgs =
                    case ( decodeInitArgs args, seed ) of
                        -- ( decodeValue (nullable intFromString) maybeInitialSeed, seed ) of
                        -- The --seed argument didn't decode
                        ( Err str, _ ) ->
                            Debug.crash ("Invalid --seed argument: " ++ str)

                        -- The user provided both a --seed flag and a seed from Elm
                        ( Ok ( Just fromCli, report ), Just fromElm ) ->
                            if fromCli == fromElm then
                                -- If they were the same, then that's no problem.
                                ( seed, report )
                            else
                                -- If they were different, crash. We don't know which to use.
                                Debug.crash ("Received both a --seed flag (" ++ toString fromCli ++ ") and a runner option seed (" ++ toString fromElm ++ "). Which initial seed did you mean to use?")

                        -- User passed --seed but not an Elm arg
                        ( Ok ( Just fromCli, report ), Nothing ) ->
                            ( Just fromCli, report )

                        -- User passed an Elm arg but not --seed
                        ( Ok ( Nothing, report ), Just fromElm ) ->
                            ( seed, report )

                        -- User passed neither --seed nor an Elm arg
                        ( Ok ( Nothing, report ), Nothing ) ->
                            ( Nothing, report )
            in
                ( Uninitialized appOpts.update
                    { maybeInitialSeed = Tuple.first initArgs
                    , report = Tuple.second initArgs
                    , runs = runs
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
