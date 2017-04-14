# node-test-runner [![Version](https://img.shields.io/npm/v/elm-test.svg)](https://www.npmjs.com/package/elm-test) [![Travis build Status](https://travis-ci.org/rtfeldman/node-test-runner.svg?branch=master)](http://travis-ci.org/rtfeldman/node-test-runner) [![AppVeyor build status](https://ci.appveyor.com/api/projects/status/fixcy4ko78di0l31/branch/master?svg=true)](https://ci.appveyor.com/project/rtfeldman/node-test-runner/branch/master)

Runs [elm-test](https://github.com/elm-community/elm-test) suites from Node.js

## Installation

```bash
npm install -g elm-test
```

## Usage

```bash
elm-test init    # Adds the elm-test dependency and creates Main.elm and Tests.elm
elm-test         # Runs all exposed Test values in *.elm files in the test/ and tests/ directories
elm-test Foo.elm # Runs all exposed Test values in Foo.elm
```

### Configuration

The `--compiler` flag can be used to use a version of the Elm compiler that
has not been installed globally.

```
npm install elm
elm-test --compiler ./node_modules/.bin/elm-make
```


### Travis CI

If you want to run your tests on Travis CI, here's a good starter `.travis.yml`:

```yml
sudo: false

cache:
  directories:
    - elm-stuff/build-artifacts
    - elm-stuff/packages
    - sysconfcpus
os:
  - linux

env:
  matrix:
    - ELM_VERSION=0.18.0 TARGET_NODE_VERSION=node

before_install:
  - echo -e "Host github.com\n\tStrictHostKeyChecking no\n" >> ~/.ssh/config

install:
  - nvm install $TARGET_NODE_VERSION
  - nvm use $TARGET_NODE_VERSION
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
  - $TRAVIS_BUILD_DIR/sysconfcpus/bin/sysconfcpus -n 2 elm-make ./tests/Main.elm

script:
  - elm-test

```
