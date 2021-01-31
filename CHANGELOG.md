# Changelog

Notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/). This project mirrors major Elm versions. So version 0.18.\* of this project will be compatible with Elm 0.18.\*.

## 0.19.1-revision6 - not released yet

### Fixed

- The `--no-color` and `--color` flags (to disable and force colors) now work again (regression in 0.19.1-revision5).

## 0.19.1-revision5 - 2020-01-28

### Breaking

- Removed support for Node.js 8 (which reached end of life 2019-12-31). Node.js 10.13.0 is now the minium supported Node.js version.
- Removed the undocumented `--verbose` flag. It didn’t do much at all in its current state.

### Fixed

- Now works on Apple Silicon/M1/ARM MacBooks. Installation used to fail with “Error: No binaries are available for your platform: darwin-arm64.”
- You can now run your test from a subdirectory. `elm-test` finds your `elm.json` up the directory tree instead of printing an error.
- If you had a port named `send` or `receive` and they were reached via test cases, `elm-test` used to fail with a duplicate port error. `elm-test` has renamed its internal ports so that conflicts are very unlikely.
- The JUnit reporter now says `@failures` instead of `@failed` which makes Jenkins happier.
- `elm-test` now errors on unknown (misspelled) flags instead of silently ignoring them.
- `elm-test` now errors on bad `--fuzz` and `--seed` values instead of silently ignoring them.
- A whole host of Elm package dependencies errors, by using `elm-json` to calculate the set of dependencies needed to run your tests.
- `elm-test --watch` no longer crashes if for packages if there are compilation errors in `src/` at startup.
- `elm-test --watch` now detects changes in your `elm.json`.
- `elm-test --watch` now works better when lots of files change at once. If 10 files changed, your tests used to run 10 times in sequence (more or less). Now, they only run once or twice. Changes within 100 ms are batched together. Changes happening while the tests are running no longer queue up – they instead trigger one single test once the current run is done.
- Compilation errors are no longer hidden by a super long “Compilation failed while attempting to build [absolute paths to every single test Elm file]” message.
- A bunch of checks and validations have been added to help in edge cases.

## Performance

- `elm-test` is now faster to install (by having fewer dependencies). It used to be around 18 MB, now it’s just 2 MB.
- `elm-test` now runs about half a second faster, by no longer using `elmi-to-json`. (As a bonus, if you ever encountered errors mentioning `elmi-to-json`, that won’t happen anymore.)
- `elm-test --watch` now reruns your tests sooner after file changes (about 100 ms after the changes, instead of about 500 ms).

## Changed

- The `--help` output is now more conventional and hopefully easier to read.

## 0.19.1-revision4 - 2020-09-21

### Fixed

- The `--compiler` command line flag now correctly finds elm executables on your PATH (see [#438](https://github.com/rtfeldman/node-test-runner/pull/438)).
- We have hugely slimmed down the reproduction instructions so that the test runner no longer prints hundreds of test file paths to the console (see issue [#431](https://github.com/rtfeldman/node-test-runner/issues/431) and fix [#432](https://github.com/rtfeldman/node-test-runner/pull/432)).

### Performance

- A whole host of spring cleaning that streamlines the test runner. (see [#425](https://github.com/rtfeldman/node-test-runner/pull/425)).

## 0.19.1-revision3 - 2020-01-10

### Fixed

- Pointing to specific test files sometimes failed (see issue [#391](https://github.com/rtfeldman/node-test-runner/issues/391) and fix [#404](https://github.com/rtfeldman/node-test-runner/pull/404)).

## 0.19.1-revision2 - 2019-10-22

### Performance

- Update elmi-to-json and use `--for-elm-test` to optimise collection of tests (#396).

## 0.19.1 - 2019-12-04

### Breaking

- drop support for elm 0.19.0
- `elm-test --help` now exits with code `0`.

### Added

- `elm-test` supports [elm 0.19.1](https://elm-lang.org/news/the-syntax-cliff).
- Node 12.

## 0.19.0-rev6 - 2019-03-10

### Fixed

- `npm audit` complaints on versions of chokidar and node-elm-compiler

## 0.19.0-rev5 - 2019-02-22

### Fixed

- Excessive small highlights in some diffs (#263)
- Upgraded to a version of lodash with a vulnerability fixed.

## 0.19.0 - 2018-08-19

### Added

- `elm-test install PACKAGE` - works like `elm install` but installs into `test-dependencies`

### Removed

- `--add-dependencies` (replaced by `elm-test install`)
- CLI aliases (e.g. `-f` as a shorthand for `--fuzz`).

## 0.18.11 - 2017-08-07

### Fixed

- Low-contrast diff color (#229)
- Socket write edge case (#228)
- Invalid JUnit XML (#218)

## 0.18.10 - 2017-11-16

### Fixed

- Potentially fixed: elm-test hanging

## 0.18.8 - 2017-08-07

### Added

- Run tests in parallel (#45)

### Fixed

- `--watch` error reporting (#192)
- `--watch` potential extra compile processes (#194)

### Internal

- More accurate timetracking
- Use symlinks to improve generated code performance
- Use Elm instead of Chalk for colored console output
- Use Prettier

## 0.18.7 - 2017-06-30

### Fixed

- All reporters were considered "machine readable", resulting in the error stream being ignored (#161)

### Added

- We have a changelog! (#151)
- Proper error messages when username or repository name contains dots (#166)

### Internal

- Add flow type annotations to prevent silly JS mistakes! (#162)

## 0.18.6 - 2017-06-12

### Changed

- Imports in the `Example.elm` file are now sorted for compatibility with `elm-format@exp`

## 0.18.5 - 2017-06-11

### Fixed

- `--report` flag broken (#155)

### Added

- If your project depends on `elm-lang/html`, `elm-test init` will add a dependency to `eeue56/elm-html-test` so you can test your HTML. (#154)

## 0.18.4 - 2017-05-30

### Fixed

- Runner no longer fails when CWD has spaces in it (#147)
- Tests that are `port modules` or `effect modules` are no longer rejected (#143)

## 0.18.3 - 2017-05-25

### Added

- `--add-dependencies target/elm-package.json` flag to add any missing dependencies _from_ the `elm-package.json` file in the current director _to_ the `target/elm-package.json` file. (#28)
- `Test.todo` to mark tests as _not yet implemented_. (#104)
- `--fuzz` flag to override the default fuzz count. (#77)
- `Test.only` and `Test.skip` to limit which tests will be executed.

### Changed

- `elm-test init` now adds all dependencies from the package `elm-package.json` to the generated `tests/elm-package.json` file. (#68)
- You no longer write a `tests/Main.elm` file. Rather, you pass the paths to your tests to the `elm-test` executable to run just those files, or you run `elm-test` without arguments which will look for all elm files under `tests/` and `test/`. (#72)
- All exposed values of type `Test` are executed by the test-runner.
- Duplicate titles/descriptions fail the test run. (#115)
- Empty describes are no longer allowed. (#95)

### Fixed

- Ignores `elm-stuff` (#100)
- Tests that throw a runtime exception fail with the exception message as failure, rather than crashing the runner. (#69)

#### Migrating from `0.18.2`

- Upgrade the runner `npm i -g elm-test`
- Remove `tests/Main.elm`
- Remove the dependency on `rtfeldman/node-test-runner` from `tests/elm-package.json`
- Bump the dependency on `elm-community/elm-test` to `4.2.0 <= v < 5.0.0` in `tests/elm-package.json`
- Ensure your test files expose each test you want to run, and that those values are of type `Test`
- Make sure those tests aren't defined twice (for example: once as a top-level value, and again in a `describe` block) or they will be executed twice.
- run `elm-test` to execute your tests.
