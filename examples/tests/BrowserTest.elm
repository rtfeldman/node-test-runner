port module Main exposing (..)

import Test.Runner.Node exposing (runWithBrowserOptions)
import Test.Browser exposing (..)
import Test
import Json.Encode exposing (Value)
import Expect


main : Program Value
main =
    runWithBrowserOptions Test.Runner.Node.defaultOptions emit receive visitExample (Test.concat [])


port emit : ( String, Value ) -> Cmd msg


port receive : (Value -> msg) -> Sub msg


visitExample : BrowserTest
visitExample =
    test "steps work" <|
        \() ->
            [ Visit "http://elm-lang.org/"
            , Title (Expect.equal "home")
            , Text ".splash div:nth-child(2)" (Expect.equal "A delightful language for reliable webapps.")
            , ClickLink "Get Started"
            , Url (Expect.equal "https://guide.elm-lang.org/get_started.html")
            ]
