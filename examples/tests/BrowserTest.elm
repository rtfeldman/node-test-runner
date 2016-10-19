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
            [ Visit "http://bites.goodeggs.com/posts/selenium-webdriver-nodejs-tutorial/"
            , Title (\_ -> Expect.pass)
              -- TODO Expect.contains "Getting started with Selenium Webdriver for node.js"
            , Text ".post .meta time" (Expect.equal "December 30th, 2014")
            , ClickLink "Bites"
            , Url (Expect.equal "http://bites.goodeggs.com/")
            ]
