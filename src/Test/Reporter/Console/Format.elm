module Test.Reporter.Console.Format exposing (verticalBar)


verticalBar : String -> String -> String -> String
verticalBar comparison expected actual =
    [ actual
    , "╵"
    , "│ " ++ comparison
    , "╷"
    , expected
    ]
        |> String.join "\n"
