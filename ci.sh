#!/bin/bash

set -e

function assertTestFailure() {
  elm-package install --yes
  elm-test "$1" | tee "$1".test.log
  if test ${PIPESTATUS[0]} -ne 1; then
    echo "$0: ERROR: $1: Expected tests to fail" >&2
    exit 1
  fi
}

function assertTestSuccess() {
  elm-package install --yes
  elm-test "$1" | tee "$1".test.log
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
cd examples
assertTestSuccess PassingTests.elm
assertTestFailure FailingTests.elm
cd ..

echo "$0: Testing elm-test init..."
mkdir -p tmp
cd tmp
elm-test init --yes
assertTestFailure TestRunner.elm
# delete the failing tests and the comma on the preceding line
ex -c 'g/should fail/' -c 'd' -c 'g-1' -c 's/,$//' -c 'wq' Tests.elm
rm -Rf elm-stuff
assertTestSuccess TestRunner.elm
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
