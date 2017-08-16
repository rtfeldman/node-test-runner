# node-test-runner [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test) [![Travis build Status](https://travis-ci.org/rtfeldman/node-test-runner.svg?branch=master)](http://travis-ci.org/rtfeldman/node-test-runner) [![AppVeyor Build status](https://ci.appveyor.com/api/projects/status/f2qymrpgdfsad62w/branch/master?svg=true)](https://ci.appveyor.com/project/rtfeldman/node-test-runner/branch/master)


Runs [elm-test](https://github.com/elm-community/elm-test) suites from Node.js

## Installation

```bash
npm install -g elm-test
```

## Usage

```bash
elm-test init    # Adds the elm-test dependency and creates a suitable folder structure
elm-test         # Runs all exposed Test values in *.elm files in the test/ and tests/ directories
elm-test Foo.elm # Runs all exposed Test values in Foo.elm
```

### Configuration

#### `init`

Initializes the recommended project setup for testable Elm. It will create a `tests` folder with an `elm-package.json` based on your project's main `elm-package.json` with `elm-test` dependencies added, add `elm-stuff` to a `.gitignore` file and make your `elm-package.json` point to the `src/` folder.

#### `--compiler`

The `--compiler` flag can be used to use a version of the Elm compiler that
has not been installed globally.

```
npm install elm
elm-test --compiler ./node_modules/.bin/elm-make
```

#### `--seed`

Allow running the tests with a predefined seed, rather than a randomly generated seed. This is especially helpful when trying to reproduce a failing fuzz-test.

```
elm-test --seed=12345
```

#### `--fuzz`

Define how many times a fuzzer should run. Defaults to `100`

```
elm-test --fuzz=500
```

#### `--add-dependencies`

Utility to add missing dependencies from the `elm-package.json` in the current directory to a target `elm-package.json` file. Helpful after adding a dependency to your application.

```
elm-test --add-dependencies tests/elm-package.json
```

#### `--report`

Specify which reporter to use for reporting your test results. Valid options are:

- `console` (default): pretty, human readable formatted output
- `json`: every event will be written to stdout as a json-encoded object
- `junit`: junit-compatible xml will be written to stdout

```
elm-test --report=json
```

#### `--version`

Displays the version of the current elm-test.

```
$ elm-test --version
0.18.4
```

#### `--watch`

Starts the runner in watch mode. Upon changing any currently watched source
files (either in your your source-directories or in your tests'
source-directories), your tests will get rerun.

```
elm-test --watch
```

#### `--help`

Displays all the available options and commands.

### Travis CI

If you want to run your tests on Travis CI, here's a good starter `.travis.yml`:

```yml
sudo: false

language: node_js
node_js: node

cache:
  directories:
    - elm-stuff/build-artifacts
    - elm-stuff/packages
    - sysconfcpus
os:
  - linux

env: ELM_VERSION=0.18.0

before_install:
  - echo -e "Host github.com\n\tStrictHostKeyChecking no\n" >> ~/.ssh/config

install:
  - node --version
  - npm --version
  - npm install -g elm@$ELM_VERSION elm-test
  - git clone https://github.com/NoRedInk/elm-ops-tooling
  - elm-ops-tooling/with_retry.rb elm package install --yes
  # Faster compile on Travis.
  - |
    if [ ! -d sysconfcpus/bin ];
    then
      git clone https://github.com/obmarg/libsysconfcpus.git;
      cd libsysconfcpus;
      ./configure --prefix=$TRAVIS_BUILD_DIR/sysconfcpus;
      make && make install;
      cd ..;
    fi

before_script:
  - cd tests && $TRAVIS_BUILD_DIR/sysconfcpus/bin/sysconfcpus -n 2 elm-make --yes Tests.elm && cd ..

script:
  - $TRAVIS_BUILD_DIR/sysconfcpus/bin/sysconfcpus -n 2 elm-test

```
