# node-test-runner [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test) [![Travis build Status](https://travis-ci.org/rtfeldman/node-test-runner.svg?branch=master)](http://travis-ci.org/rtfeldman/node-test-runner) [![AppVeyor Build status](https://ci.appveyor.com/api/projects/status/f2qymrpgdfsad62w/branch/master?svg=true)](https://ci.appveyor.com/project/rtfeldman/node-test-runner/branch/master)


Runs [elm-test](https://package.elm-lang.org/packages/elm-explorations/test/latest) suites from Node.js

## Installation

```shell
npm install -g elm-test
```

## Usage

```shell
elm-test install foo/bar # Install the foo/bar package to "test-dependencies"
elm-test init            # `elm-test install elm-explorations/test` and create tests/Example.elm
elm-test                 # Run all exposed Test values in *.elm files in tests/
elm-test Foo.elm         # Run all exposed Test values in Foo.elm
```

### Command Line Arguments

#### `install`

Like `elm install`, except it installs to the `test-dependencies` field of your project's `elm.json` file instead of `dependencies`.

```shell
elm-test install elm/regex
```

#### `init`

Runs `elm-test install elm-explorations/test` and then creates a `tests/Example.elm`
example test to get you started.

Afterwards, you can run `elm-test` with no arguments to try out the example.

#### `--compiler`

The `--compiler` flag can be used to use a version of the Elm compiler that
has not been installed globally.

```shell
npm install elm
elm-test --compiler ./node_modules/.bin/elm
```

#### `--seed`

Allow running the tests with a predefined seed, rather than a randomly generated seed. This is especially helpful when trying to reproduce a failing fuzz-test.

```shell
elm-test --seed=12345
```

#### `--fuzz`

Define how many times a fuzzer should run. Defaults to `100`

```shell
elm-test --fuzz=500
```

#### `--report`

Specify which reporter to use for reporting your test results. Valid options are:

- `console` (default): pretty, human readable formatted output
- `json`: every event will be written to stdout as a json-encoded object
- `junit`: junit-compatible xml will be written to stdout

```shell
elm-test --report=json
```

#### `--version`

Displays the version of the current elm-test.

```shell
$ elm-test --version
0.19.1
```

#### `--watch`

Starts the runner in watch mode. Upon changing any currently watched source
files (either in your your source-directories or in your tests'
source-directories), your tests will get rerun.

```shell
elm-test --watch
```

#### `--help`

Displays all the available options and commands.

### Travis CI

If you want to run your tests on Travis CI, [here's a good starter `.travis.yml`](https://docs.travis-ci.com/user/languages/elm/):

```yml
language: elm
elm:
  - 0.19.1
```
