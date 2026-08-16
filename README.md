# node-test-runner [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test)

Runs [elm-explorations/test] suites in Node.js.

When people say “elm-test” they usually refer to either:

- This CLI tool for running tests.
- [elm-explorations/test] – an Elm package for defining tests that this CLI tool can run.

[elm-explorations/test]: https://package.elm-lang.org/packages/elm-explorations/test/latest

## Versions

You need to keep the versions of these three things in sync:

- This CLI tool.
- The Elm compiler.
- The [elm-explorations/test] package.

When it comes to the first two it’s easy: Use the same version for both. If you use Elm 0.19.2, use version 0.19.2 of this CLI tool as well. Note that the npm packages for both `elm` and `elm-test` might have suffixes such as `-0` and `-1` etc. It’s totally OK to use `elm@0.19.2-0` with `elm-test@0.19.2-1`! The suffixes don’t need to match. The suffixes are all about bug fixes or features in the respective npm packages, while the base version says which compiler version we’re working with.

When it comes to [elm-explorations/test]: Use at least version 2.0.0 with elm-test 0.19.2. If you’re on 0.19.1, see the following table:

| elm-explorations/test | elm-test CLI         |
| --------------------- | -------------------- |
| >= 2.0.0              | >= 0.19.1-revision10 |
| <= 1.2.2              | <= 0.19.1-revision9  |

(For 0.19.1, the suffix used was for example `-revision9` instead of just `-9`. This was changed in 0.19.2 to match the `elm` npm package.)

> **Unfortunate behavior of 0.19.1-revision9 and older**
>
> - `elm-test init` always installs the latest [elm-explorations/test]. This means that if you run `elm-test init` on version 0.19.1-revision9 or older, you will get elm-explorations/test 2.0.0 or later, which don’t work 100 % together (see the next point).
> - elm-test 0.19.1-revision9 or older do _not_ validate that [elm-explorations/test] in your elm.json has a compatible version. If you upgrade to elm-explorations/test 2.0.0 or later but forget to upgrade the elm-test CLI, most things will still work, but test distribution diagrams (new in elm-explorations/test 2.0.0) won’t show up. So if you use `Test.fuzzWith` and wonder why distribution diagrams never show up – check your elm-test CLI version!
> - There exists an elm-test CLI version called just "0.19.1". It should have been called "0.19.1-revision1", but unfortunately isn’t. Don’t make the mistake thinking it’s the latest version! You always want "0.19.1-revisionX". (This is also why there is a version called "0.19.2-0" but no "0.19.2".)

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

### --no-clear-console

By default, the console is cleared before each run in watch mode, so you only see the latest information. If you don’t like this, turn it off with `--no-clear-console`.

    elm-test --watch --no-clear-console

### --unbuffered-logs

elm-test collects all `Debug.log` output while executing a test, and displays it all once the test in question is finished. This way elm-test can print _which_ test the logs came from.

If the function your are testing gets into an infinite loop, it means that your debug logs will never show up. Then it can be useful to have the logs print _immediately_ instead (at the loss of no longer being able to label which tests the logs came from). To avoid confusion, use [Test.only](https://package.elm-lang.org/packages/elm-explorations/test/latest/Test#only) to isolate your test, or pass `--workers 1` to run in single-threaded mode to avoid oddly mixed output:

    elm-test --unbuffered-logs --workers 1

For _failing_ fuzz tests, elm-test only prints `Debug.log` output from the run of the fuzz test that produced the failure, which is usually what you want to debug. (Earlier, passing runs of the function with different input is just noise). For _passing_ fuzz tests, elm-test _ignores_ your `Debug.log` calls (and instead displays a note about this). Let’s imagine you are debugging a failing fuzz test. After a while it finally passes. There is no longer a failing run, so which one should we pick logs from? All of them? But would you really like to see the screen fill with 100+ repetitions of your logs at that point? Probably not. But if you actually _do_ want to show logs from all runs, you can use `--unbuffered-logs` for this use case, too. Also remember that you can make the test fail from anywhere using `Debug.todo` – that’s also a way to make logs appear!

### --seed

Run with a specific fuzzer seed, rather than a randomly generated seed. This allows reproducing a failing fuzz-test. The command needed to reproduce (including the `--seed` flag) is printed after each test run. Copy, paste and run it!

    elm-test --seed 336948560956134

On top of that, if you run elm-test without the `--seed` flag, elm-test will automatically use the same seed as the last run if there was a fuzz test failure, letting you reproduce errors without doing anything. It even tries to fast-forward you through the fuzzing. So if it took some time for the fuzzer to find the problem the first time, the next run should be instant.

### --fuzz

Define how many times each fuzz-test should run. Defaults to `100`.

    elm-test --fuzz 500

> [!NOTE]  
> 100 iterations is pretty low for most fuzz tests – it might not be enough to find edge cases. It’s recommended to use [fuzzWith](https://package.elm-lang.org/packages/elm-explorations/test/latest/Test#fuzzWith) to choose an appropriate number of runs per fuzz test. When developing, increase the number until you don’t get any failures anymore and the test takes a long time. Then lower the number so the test covers enough and runs fast enough to make those who wait not go insane.

### --workers

Choose how many workers elm-test should use to run fuzz tests in parallel. Defaults to the number of “logical CPU cores” of the machine you run the tests on.

    elm-test --workers 4

Your computer might say that it has 12 logical CPU cores. Then dividing up the fuzz tests between 12 parallel workers is the theoretical optimum for running the tests as quickly as possible. But in practice your tests might run faster with just 4 workers in parallel due to overhead. Play around with it and see what is the fastest for your test suite on your computer!

To see the number of logical CPU cores on your machine, run `node -p "os.cpus().length"` (it’s also shown in `elm-test --help`).

If you pass `--workers 1`, elm-test won’t even start a new thread for running the tests in – it’ll do everything in the main thread (single-threaded mode).

Currently, elm-test always executes unit tests on the main thread, and only uses separate threads for fuzz tests. Unit tests tend to execute so fast that the overhead of threads isn’t worth it. But fuzz tests often run long enough to benefit from parallelization.

### --report

Specify which format to use for reporting test results. Valid options are:

- `console` (default): pretty, human readable formatted output.
- `json`: newline-delimited json with an object for each event.
- `junit`: junit-compatible xml.

```
elm-test --report json
```

> [!NOTE]  
> With `--report json` you’ll see `"failures"` and `"distributionReports"` fields, which are arrays. `"failures"` is always the empty array for passing tests, and contains one single failure for failing tests. `"distributionReports"` always contains exactly one report. They are arrays for backwards compatibility reasons.

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

### --dependencies

This is useful when developing an Elm Package (`"type": "package"` in elm.json).

    elm-test --dependencies oldest

Let’s say your package has the dependency `"elm/json": "1.0.0 <= v < 2.0.0"`. That allows a whole range of `elm/json` versions to be used with your package. Exactly which version of `elm/json` is going to be used in tests? Does it matter?

Turns it it _does_ matter sometimes. For example, `elm/json` 1.1.0 added the `Json.Decode.oneOrMore` function. Let’s say you start using `oneOrMore` in your package. If the tests run with 1.1.0 or later, they are going to pass. But if they run with 1.0.0 (also allowed by the range), the tests are not even going to compile, because `oneOrMore` does not exist. Oops!

When running `elm make` in a package project, the Elm compiler uses the _latest_ version permitted by the dependency ranges and makes sure that your project compiles. But it does not stop you from publishing a package with a too low version boundary.

Tests to the rescue! By using `elm-test --dependencies oldest` your tests are going to be compiled and run with the _oldest_ permitted versions of your dependencies. If your use of the `oneOrMore` function has test coverage, the tests are going to fail (not compile)! The solution is to bump the lower bound: `"elm-test": "1.1.0 <= v < 2.0.0"`.

`--dependencies` defaults to `newest`, because that was the behavior before the flag was added, and it is less surprising since it does the same thing as a plain `elm make`. But not now that you know about this little gotcha, go ahead and start using `--dependencies oldest` for your package!

If you do start using `--dependencies oldest`, remember that your tests could fail due to bugs in a dependency that have been fixed in a later version. If that turns out to be the case, bump the lower bound.

Note: Even with `--dependencies oldest` there are still edge cases. In the example above, let’s say your package also has another dependency, and that dependency in turn also depends on `elm/json`. But it has already specified that it wants at least 1.1.0. Then `--dependencies oldest` has no choice but installing 1.1.0, even if _your_ range allows 1.0.0. So `--dependencies oldest` is no guarantee that your lower version bounds are correct, but it does make it more likely.

The flag is ignored for applications (`"type": "application"` in elm.json), because for applications all dependency versions are specified exactly (no ranges). (In rare edge cases, there _can_ be situations where your pinned _indirect_ dependencies can’t be honored perfectly, due to the merge between regular dependencies, test dependencies and the test runner dependencies that elm-test has to perform. But then we let the solver pick a working version and don’t consider the `--dependencies` flag.)

If you use this together with `--offline`, beware that “oldest” and “newest” refer to what you packages you have on disk on your computer, not what the actually oldest and newest versions available on the package site are. Going back to the example with `"elm-json": "1.0.0 <= v < 2.0.0"`, if the only `elm/json` version you have on your computer is 1.1.0 then that’s what you’re gonna get with `--dependencies oldest --offline`. Even though 1.0.0 exists on the Internet, the tests are going to use 1.1.0 and therefore _not_ fail (as they would have with 1.0.0).

### --offline

Tell elm-test to fail instead of making HTTP request when “solving dependencies:”

    elm-test --offline

Before running tests, elm-test needs to merge your regular dependencies, test dependencies and dependencies of the test runner, and find a working set of versions. When doing so, elm-test needs to ask the package server for available versions of packages. The results are cached in `~/.elm` (`$ELM_HOME`). If you already have a cache that is supposed to be up-to-date cache, and want elm-test to fail instead of making HTTP requests to the package server if it isn’t, pass `--offline`.

Note: `--offline` only controls HTTP requests that elm-test makes directly. The Elm compiler might still make HTTP requests.
