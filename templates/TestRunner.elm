module Main where

import Signal exposing (Signal)

import ElmTest.Runner.Console exposing (runDisplay)
import Console exposing (IO)
import Task

import Tests

console : IO ()
console = runDisplay Tests.all

port runner : Signal (Task.Task x ())
port runner = Console.run console
