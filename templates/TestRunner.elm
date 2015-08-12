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
import Tests

console : IO ()
console = runDisplay Tests.all

port requests : Signal Request
port requests = Run.run responses console

port responses : Signal Response
