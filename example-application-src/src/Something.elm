module Something exposing (..)

import Expect
import Test


ultimateAnswer : Int
ultimateAnswer =
    42


test =
    Test.test "ultimateAnswer" <|
        \_ ->
            ultimateAnswer |> Expect.equal 42
