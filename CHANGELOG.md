# Changelog

Notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
This project mirrors major Elm versions. So version 0.18.* of this project will
be compatible with Elm 0.18.*.

## 0.19.0-rev6

### Fixed

- `npm audit` complaints on versions of chokidar and node-elm-compiler

## 0.19.0-rev5

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

- All reporters were considered "machine readable", resulting in the error
stream being ignored (#161)

### Added

- We have a changelog! (#151)
- Proper error messages when username or repository name contains dots (#166)

### Internal

- Add flow type annotations to prevent silly JS mistakes! (#162)

## 0.18.6 - 2017-06-12

### Changed

- Imports in the `Example.elm` file are now sorted for compatibility with
`elm-format@exp`

## 0.18.5 - 2017-06-11

### Fixed

- `--report` flag broken (#155)

### Added

- If your project depends on `elm-lang/html`, `elm-test init` will add a
dependency to `eeue56/elm-html-test` so you can test your HTML. (#154)

## 0.18.4 - 2017-05-30

### Fixed

- Runner no longer fails when CWD has spaces in it (#147)
- Tests that are `port modules` or `effect modules` are no longer rejected (#143)

## 0.18.3 - 2017-05-25

### Added

- `--add-dependencies target/elm-package.json` flag to add any missing
dependencies _from_ the `elm-package.json` file in the current director _to_ the
`target/elm-package.json` file. (#28)
- `Test.todo` to mark tests as _not yet implemented_. (#104)
- `--fuzz` flag to override the default fuzz count. (#77)
- `Test.only` and `Test.skip` to limit which tests will be executed.

### Changed

- `elm-test init` now adds all dependencies from the package `elm-package.json`
to the generated `tests/elm-package.json` file. (#68)
- You no longer write a `tests/Main.elm` file. Rather, you pass the paths to
your tests to the `elm-test` executable to run just those files, or you run
`elm-test` without arguments which will look for all elm files under `tests/`
and `test/`. (#72)
- All exposed values of type `Test` are executed by the test-runner.
- Duplicate titles/descriptions fail the test run. (#115)
- Empty describes are no longer allowed. (#95)


### Fixed

- Ignores `elm-stuff` (#100)
- Tests that throw a runtime exception fail with the exception message as
failure, rather than crashing the runner. (#69)

#### Migrating from `0.18.2`

- Upgrade the runner `npm i -g elm-test`
- Remove `tests/Main.elm`
- Remove the dependency on `rtfeldman/node-test-runner` from
`tests/elm-package.json`
- Bump the dependency on `elm-community/elm-test` to `4.2.0 <= v < 5.0.0` in
`tests/elm-package.json`
- Ensure your test files expose each test you want to run, and that those values
are of type `Test`
- Make sure those tests aren't defined twice (for example: once as a top-level
value, and again in a `describe` block) or they will be executed twice.
- run `elm-test` to execute your tests.
