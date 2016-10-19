port module Main exposing (..)

import Test.Runner.Node exposing (runWithBrowserOptions)
import Test.Browser exposing (..)
import Test
import Json.Encode exposing (Value)


main : Program Value
main =
    runWithBrowserOptions Test.Runner.Node.defaultOptions emit receive visitExample (Test.concat [])


port emit : ( String, Value ) -> Cmd msg


port receive : (Value -> msg) -> Sub msg


visitExample : BrowserTest
visitExample =
    test "steps work" <|
        \() ->
            [ Visit "http://bites.goodeggs.com/posts/selenium-webdriver-nodejs-tutorial/"
            , Title
            , Text ".post .meta time"
            , ClickLink "Bites"
            , Url
            ]
