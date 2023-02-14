module InvalidXMLCharacter.Test exposing (invalidCharacter)

import Expect
import Test exposing (..)


invalidCharacter : Test
invalidCharacter =
    describe "The junit reporter should not crash due to invalid control characters"
        [ test "backspace: \u{0008}" <|
            \() -> Expect.pass
        ]
