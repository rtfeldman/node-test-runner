module InvalidXMLCharacter.Test exposing (invalidCharacter)

import Expect
import Test exposing (..)


invalidCharacter : Test
invalidCharacter =
    describe "The junit reporter should not crash due to invalid (for XML) characters in the output"
        [ test "backspace: \u{0008}" <|
            \() -> Expect.pass
        , test "escape: \u{001B}" <|
            \() -> Expect.pass
        ]
