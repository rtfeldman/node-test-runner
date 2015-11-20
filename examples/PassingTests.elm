module Main where

import Basics exposing (..)
import Signal exposing (..)

import ElmTest exposing (..)
import Console exposing (IO, run)
import Task
import String

tests : Test
tests = suite "A Test Suite"
        [ test "Addition" (assertEqual (3 + 7) 10)
        , test "String.left" (assertEqual "a" (String.left 1 "abcdefg"))
        ]

console : IO ()
console = consoleRunner tests

port runner : Signal (Task.Task x ())
port runner = run console
