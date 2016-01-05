#!/bin/bash

set -e

function assertTestFailure() {
  if [ -z "$1" ]; then
    elm-test | tee "elm-test.test.log"
  else
    elm-test "$1" | tee "$1".test.log
  fi
  if test ${PIPESTATUS[0]} -ne 1; then
    echo "$0: ERROR: $1: Expected tests to fail" >&2
    exit 1
  fi
}

function assertTestSuccess() {
  if [ -z "$1" ]; then
    elm-test | tee "elm-test.test.log"
  else
    elm-test "$1" | tee "$1".test.log
  fi
  if test ${PIPESTATUS[0]} -ne 0; then
    echo "$0: ERROR: $1: Expected tests to pass" >&2
    exit 1
  fi
}

echo "$0: Installing elm-test..."
npm install --global

echo "$0: Verifying installed elm-test version..."
elm-test --version

echo "$0: Testing examples..."
cd examples/tests
elm-package install --yes
assertTestSuccess PassingTests.elm
assertTestFailure FailingTests.elm
cd ../..

echo "$0: Testing elm-test init..."
mkdir -p tmp
cd tmp
elm-test init --yes
(cd tests && elm-package install --yes)
assertTestFailure
# delete the failing tests and the comma on the preceding line
ex -c 'g/should fail/' -c 'd' -c 'g-1' -c 's/,$//' -c 'wq' tests/Tests.elm
rm -Rf tests/elm-stuff
(cd tests && elm-package install --yes)
assertTestSuccess
cd ..
rm -Rf tmp

echo ""
echo "$0: Everything looks good!"
echo "                                                            "
echo "  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  "
echo "_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_"
echo " _/_                                                        "
echo "(/                                                          "
echo "                                                            "
