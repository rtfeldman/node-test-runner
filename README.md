# node-test-runner [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test)

Runs [elm-explorations/test] suites in Node.js.

When people say “elm-test” they usually refer to either:

- This CLI tool for running tests.
- [elm-explorations/test] – an Elm package for defining tests that this CLI tool can run.

[elm-explorations/test]: https://package.elm-lang.org/packages/elm-explorations/test/latest

## Installation

```
npm install --save-dev elm-test
```

## Quick start

Install [elm-explorations/test] and create `tests/Example.elm`:

    npx elm-test init

Run tests in the `tests/` folder:

    npx elm-test

Run tests in one particular file:

    npx elm-test tests/Example.elm

Run tests in files matching a [glob](https://github.com/isaacs/node-glob#glob-primer):

    npx elm-test "src/**/*Tests.elm"

> Note: The double quotes are important! Without quotes, your shell might expand the globs for you. With quotes, elm-test expands the globs. This way the watcher can pick up new tests matching the globs, and it will work cross-platform.

Run in watch mode:

    npx elm-test --watch

## Where to put tests

### Locating files containing tests

There are 3 places you could put your tests:

1.  In the `tests/` folder.

    This is the default and requires no extra setup.

2.  In any source directory (`"source-directories"` in `elm.json` for applications, `src/` for packages) as separate files.

    A convention is to put test files next to the file it tests with a `Tests` suffix. For example, you could have `src/LoginForm.elm` and `src/LoginFormTests.elm`.

    This requires telling elm-test which folders/files to run. Examples:

        npx elm-test "src/**/*Tests.elm"
        npx elm-test test/frontend/elm

    You might also need to configure your editor to understand that the `"test-dependencies"` in your `elm.json` are available in these files.

3.  In already existing source files.

    This allows testing internal functions without exposing them. (Be aware that testing implementation details can sometimes be counter-productive.)

    This requires moving everything in `"test-dependencies"` in your `elm.json` into regular `"dependencies"`, so your project still compiles. This also helps your editor. Note that this approach isn’t suitable for packages, since you don’t want your package to unnecessarily depend on [elm-explorations/test].

You can mix all three variants if you want:

    npx elm-test tests "src/**/*Tests.elm" app

> In this example, `"src"` and `"app"` need to be in `"source-directories"` in `elm.json`.

### Locating tests within files

For elm-test to find tests in your files you need to:

1. Create top-level values of the type [Test](https://package.elm-lang.org/packages/elm-explorations/test/latest/Test#Test). You can name the values anything – the only thing that matters is that their type is `Test`.
2. Expose them.

Example:

```elm
module LoginForm exposing (alreadyLoggedInTests, tests)

import Test exposing (Test)


tests : Test
tests =
    -- ...


alreadyLoggedInTests : Test
alreadyLoggedInTests =
    -- ...
```

Some prefer to expose a single `Test` value and group everything using [describe](https://package.elm-lang.org/packages/elm-explorations/test/latest/Test#describe). Some prefer to expose several `Test` values.

**Also check out the [elm-explorations/test quick-start](https://github.com/elm-explorations/test#quick-start) guide!**

## Command Line Arguments

These are the most common commands and flags. Run `elm-test --help` for an exhaustive list.

**Note:** Throughout this section, the `npx` prefix is omitted for brevity.

### install

Like `elm install`, except elm-test will install to `"test-dependencies"` in your `elm.json` instead of to `"dependencies"`.

    elm-test install elm/regex

### init

Runs `elm-test install elm-explorations/test` and then creates a `tests/Example.elm` example test to get you started.

`elm-test init` requires an `elm.json` file up the directory tree, so you will need to run `elm init` first if you don’t already have one.

After initializing elm-test in your project, try out the example by running `elm-test` with no arguments.

    elm init
    elm-test init
    elm-test

### --watch

Start the runner in watch mode. Your tests will automatically rerun whenever your project changes.

    elm-test --watch

### --seed

Run with a specific fuzzer seed, rather than a randomly generated seed. This allows reproducing a failing fuzz-test. The command needed to reproduce (including the `--seed` flag) is printed after each test run. Copy, paste and run it!

    elm-test --seed 336948560956134

### --fuzz

Define how many times each fuzz-test should run. Defaults to `100`.

    elm-test --fuzz 500

### --report

Specify which format to use for reporting test results. Valid options are:

- `console` (default): pretty, human readable formatted output.
- `json`: newline-delimited json with an object for each event.
- `junit`: junit-compatible xml.

```
elm-test --report json
```

### --no-color

Disable colored console output.

Colors are also disabled when you pipe the output of `elm-test` to another program. You can use `--color` to force the colors back.

Alternatively, you can set the environment variable `FORCE_COLOR` to `0` to disable colors, or to any other value to force them.

See [chalk.supportsColor](https://github.com/chalk/chalk#chalksupportscolor) for more information.

### --compiler

If `elm` is _not_ in your `$PATH` when elm-test runs, or the Elm executable is called something other than `elm`, you can use this flag to point to your installation.

    elm-test --compiler /path/to/elm

To run a tool installed locally using `npm` you can use `npx`:

    npx elm-test

`npx` adds the local `node_modules/.bin/` folder to `$PATH` when it executes the command passed to it. This means that if you have installed `elm` locally, `elm-test` will automatically find that local installation.

As mentioned in [Installation](#installation) we recommend installing elm-test locally in every project. This ensures all contributors and CI use the same version, to avoid nasty “works on my computer” issues.

## Travis CI

If you want to run your tests on Travis CI, [here's a good starter `.travis.yml`](https://docs.travis-ci.com/user/languages/elm/):

```yml
language: elm
elm:
  - 0.19.1
```

Here is an example [`travis.yml`](https://github.com/rtfeldman/elm-css/blob/master/.travis.yml) configuration file for running tests in CI.
