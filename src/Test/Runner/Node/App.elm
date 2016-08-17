module Test.Runner.Node.App exposing (run)

{-| Test runner for a Node app

@docs run

-}

import Test exposing (Test)
import Test.Runner exposing (Runner(..))
import Expect exposing (Expectation)
import Html exposing (Html, text)
import Html.App
import Task
import Random.Pcg
import Time exposing (Time)
import Json.Decode exposing (Value, Decoder, string, decodeValue, customDecoder)
import Json.Decode.Extra exposing (maybeNull)
import String


type Msg subMsg
    = Init Time
    | SubMsg subMsg


type alias InitArgs =
    { initialSeed : Int
    , startTime : Time
    , thunks : List (() -> ( List String, List Expectation ))
    }


type Model subMsg subModel
    = Initialized (SubUpdate subMsg subModel) subModel
    | Uninitialized
        (SubUpdate subMsg subModel)
        { maybeNumericSeed : Maybe Int
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
        |> fst


fromNever : Never -> a
fromNever a =
    fromNever a


initOrUpdate : Msg subMsg -> Model subMsg subModel -> ( Model subMsg subModel, Cmd (Msg subMsg) )
initOrUpdate msg maybeModel =
    case maybeModel of
        Uninitialized update { maybeNumericSeed, runs, test, init } ->
            case msg of
                Init time ->
                    let
                        numericSeed =
                            case maybeNumericSeed of
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
    customDecoder string String.toInt


{-| Run the tests and render the results as a Web page.
-}
run : RunnerOptions -> AppOptions msg model -> Test -> Program Value
run { runs, seed } appOpts test =
    let
        init maybeInitialSeed =
            let
                cmd =
                    Task.perform fromNever Init Time.now

                initialSeed : Maybe Int
                initialSeed =
                    case ( decodeValue (maybeNull intFromString) maybeInitialSeed, seed ) of
                        -- The --seed argument didn't decode
                        ( Err str, _ ) ->
                            Debug.crash ("Invalid --seed argument: " ++ str)

                        -- The user provided both a --seed flag and a seed from Elm
                        ( Ok (Just fromCli), Just fromElm ) ->
                            if fromCli == fromElm then
                                -- If they were the same, then that's no problem.
                                seed
                            else
                                -- If they were different, crash. We don't know which to use.
                                Debug.crash ("Received both a --seed flag (" ++ toString fromCli ++ ") and a runner option seed (" ++ toString fromElm ++ "). Which initial seed did you mean to use?")

                        -- User passed --seed but not an Elm arg
                        ( Ok (Just fromCli), Nothing ) ->
                            Just fromCli

                        -- User passed an Elm arg but not --seed
                        ( Ok Nothing, Just fromElm ) ->
                            seed

                        -- User passed neither --seed nor an Elm arg
                        ( Ok Nothing, Nothing ) ->
                            Nothing
            in
                ( Uninitialized appOpts.update
                    { maybeNumericSeed = initialSeed
                    , runs = runs
                    , test = test
                    , init = appOpts.init
                    }
                , cmd
                )
    in
        Html.App.programWithFlags
            { init = init
            , update = initOrUpdate
            , view = \_ -> Html.text "This should be run in Node, not in a browser!"
            , subscriptions = subscriptions appOpts.subscriptions
            }
