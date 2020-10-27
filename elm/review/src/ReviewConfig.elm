module ReviewConfig exposing (config)

{-| Do not rename the ReviewConfig module or the config function, because
`elm-review` will look for these.

To add packages that contain rules, add them to this review project using

    `elm install author/packagename`

when inside the directory containing this file.

-}

import NoUnused.CustomTypeConstructorArgs
import NoUnused.CustomTypeConstructors
import NoUnused.Dependencies
import NoUnused.Exports
import NoUnused.Modules
import NoUnused.Parameters
import NoUnused.Patterns
import NoUnused.Variables
import Review.Rule exposing (Rule)


config : List Rule
config =
    [ NoUnused.CustomTypeConstructors.rule []
        |> Review.Rule.ignoreErrorsForFiles
            [ "src/Test/Reporter/Reporter.elm" --ConsoleReport, JsonReport, JunitReport are used externally
            , "src/Console/Text.elm" -- Monochrome, UseColor are used externally
            ]

    , NoUnused.Exports.rule  
        |> Review.Rule.ignoreErrorsForFiles
            [ "src/Test/Runner/Node/Vendor/Diff.elm"
            , "src/Test/Runner/Node.elm"
            , "src/Test/Runner/Node/Vendor/Console.elm" 
            --, "src/Test/Reporter/TestResults.elm" -- isTodo
            ]
    , NoUnused.Modules.rule
    , NoUnused.CustomTypeConstructorArgs.rule
        |> Review.Rule.ignoreErrorsForFiles
            [ "src/Test/Runner/Node/Vendor/Diff.elm" -- UnexpectedPath is used for reporting errors
            , "src/Test/Runner/JsMessage.elm" -- Test is used for JSON decoding
            ]
    , NoUnused.Dependencies.rule
    , NoUnused.Parameters.rule
    , NoUnused.Patterns.rule
    , NoUnused.Variables.rule
    ]
