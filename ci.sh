#!/bin/bash

set -e

echo "$0: Installing elm-test..."
npm install --global

echo "$0: Testing elm-test init..."
mkdir -p tmp
cd tmp
elm-test init --yes
elm-test TestRunner.elm | tee test.log
if test ${PIPESTATUS[0]} -ne 1; then
  echo "$0: ERROR: Expected example tests to fail" >&2
  exit 1
fi
cd ..
rm -Rf tmp

echo "$0: Testing examples..."
cd examples
elm-package install --yes
elm-test Test.elm | tee test.log
if test ${PIPESTATUS[0]} -ne 1; then
  echo "$0: ERROR: Expected example tests to fail" >&2
  exit 1
fi
cd ..

echo ""
echo "$0: Everything looks good!"
echo "                                                            "
echo "  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  "
echo "_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_"
echo " _/_                                                        "
echo "(/                                                          "
echo "                                                            "
