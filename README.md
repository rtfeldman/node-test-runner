[![npm version](https://badge.fury.io/js/elm-test.svg)](http://badge.fury.io/js/elm-test)
[![Build Status](https://travis-ci.org/rtfeldman/node-elm-test.svg?branch=master)](https://travis-ci.org/rtfeldman/node-elm-test)

# node-elm-test
Runs [elm-test](https://github.com/deadfoxygrandpa/Elm-Test) suites from Node.js

## Installation

```bash
npm install -g elm-test
```

## Usage

```bash
elm-test init  # Adds the Elm-Test dependency and creates TestRunner.elm and Tests.elm
elm-test TestRunner.elm  # Runs the tests
```

Then add your tests to Tests.elm.

Also check out [`elm-check`](https://github.com/TheSeamau5/elm-check) for property-based testing via `elm-test`!
