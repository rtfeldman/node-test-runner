#! /bin/bash

set -euxo pipefail

TEMPLATE=$(cat <<-EOS

import Expect
import Something
import Test exposing (Test, test)


testEqual : Test
testEqual =
    test "Expect.equal works" <|
        \\() ->
            Something.ultimateAnswer
                |> Expect.equal 42
EOS
)

rm -rf tests

mkdir tests

cd tests

for x in `seq 1 2000`; do
  echo "module TestsPassing${x} exposing (testEqual)" > "TestsPassing${x}.elm"
  echo "$TEMPLATE" >> "TestsPassing${x}.elm"
done
