module Main where

import Basics exposing (..)
import Signal exposing (..)

import ElmTest.Assertion as A exposing (assertEqual, assert)
import ElmTest.Run as R
import ElmTest.Runner.Console exposing (runDisplay)
import ElmTest.Test exposing (..)
import IO.IO exposing (..)
import IO.Runner exposing (Request, Response)
import IO.Runner as Run

import String

tests : Test
tests = suite "A Test Suite"
        [ test "Addition" (assertEqual (3 + 7) 10)
        , test "String.left" (assertEqual "a" (String.left 1 "abcdefg"))
        , test "This test should fail" (assert False)
        ]

console : IO ()
console = runDisplay tests

port requests : Signal Request
port requests = Run.run responses console

port responses : Signal Response
