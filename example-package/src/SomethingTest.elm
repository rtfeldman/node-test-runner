module SomethingTest exposing (..)

import Expect
import Something
import Test


test =
    Test.test "ultimateAnswer" <|
        \_ -> Something.ultimateAnswer |> Expect.equal 42
