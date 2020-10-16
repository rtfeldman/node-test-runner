port module Main exposing (..)

import Basics exposing (..)
import Json.Decode exposing (Value)
import Platform.Cmd exposing (Cmd)
import Task exposing (..)
import Test exposing (..)
import Test.Array as Array
import Test.Basics as Basics
import Test.Bitwise as Bitwise
import Test.Char as Char
import Test.CodeGen as CodeGen
import Test.Dict as Dict
import Test.Equality as Equality
import Test.Json as Json
import Test.List as List
import Test.Maybe as Maybe
import Test.Result as Result
import Test.Runner.Node exposing (TestProgram, run)
import Test.Set as Set
import Test.String as String
import Test.Tuple as Tuple


tests : Test
tests =
    describe "Elm Standard Library Tests"
        [ Array.tests
        , Basics.tests
        , Bitwise.tests
        , Char.tests
        , CodeGen.tests
        , Dict.tests
        , Equality.tests
        , List.tests
        , Result.tests
        , Set.tests
        , String.tests
        , Maybe.tests
        , Tuple.tests
        ]


main : TestProgram
main =
    run emit tests


port emit : ( String, Value ) -> Cmd msg
