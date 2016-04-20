# node-elm-test [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test) [![Travis build Status](https://travis-ci.org/rtfeldman/node-elm-test.svg?branch=master)](http://travis-ci.org/rtfeldman/node-elm-test) [![AppVeyor build status](https://ci.appveyor.com/api/projects/status/fixcy4ko78di0l31/branch/master?svg=true)](https://ci.appveyor.com/project/rtfeldman/node-elm-test/branch/master)

Runs [elm-test](https://github.com/deadfoxygrandpa/Elm-Test) suites from Node.js

## Installation

```bash
npm install -g elm-test
```

## Usage

```bash
elm-test init  # Adds the Elm-Test dependency and creates TestRunner.elm and Tests.elm
elm-test tests/TestRunner.elm  # Runs the tests
```

Then add your tests to Tests.elm.

Also check out [`elm-check`](https://github.com/NoRedInk/elm-check) for property-based testing via `elm-test`!

### Travis CI

If you want to run your tests on Travis CI, here's a good starter `.travis.yml`:

```yml
language: node_js
node_js:
  - "5"
install:
  - npm install -g elm
  - npm install -g elm-test
  - elm-package install -y
  - pushd tests && elm-package install -y && popd
script:
  - cd tests && elm-test TestRunner.elm
```
