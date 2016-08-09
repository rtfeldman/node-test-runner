module Chalk exposing (Chalk, encode, withColorChar)

import Json.Encode as Encode exposing (Value)


type alias Chalk =
    { styles : List String, text : String }


encode : Chalk -> Value
encode { styles, text } =
    Encode.object
        [ ( "styles", Encode.list (List.map Encode.string styles) )
        , ( "text", Encode.string text )
        ]


withColorChar : Char -> String -> String -> Chalk
withColorChar char textColor str =
    { styles = [ textColor ], text = "✗ " ++ str ++ "\n" }
