module Elm.Error exposing
  ( decoder
  , Error(..)
  , BadModule
  , Problem
  , Chunk(..)
  , Style
  , Color(..)
  , Region
  , Position
  )


{-| When `elm make --report=json` fails, this module helps you turn the
resulting JSON into HTML.

# Compile Errors
@docs decoder, Error, BadModule, Problem

# Styled Text
@docs Chunk, Style, Color

# Code Regions
@docs Region, Position

-}


import Json.Decode as D



-- ERROR


{-| When `elm make --report=json` fails, there are two major categories of
error. Usually you have `ModuleProblems` like an unknown variable name or type
mismatch, but you can also get a `GeneralProblem` like cyclic modules or an
invalid `elm.json` file. The latter are much less common, but because they
never have a `Region` they need to be handled separately.
-}
type Error
  = GeneralProblem { path : Maybe String, title : String, message : List Chunk }
  | ModuleProblems (List BadModule)


{-| Decode the JSON produced when `elm make --report=json` fails. The goal is
to get the data in a format that can be presented in HTML.

**Note:** Please follow the design advice in the rest of the docs, like for
[`Chunk`](#Chunk) and [`Color`](#Color). Consistent presentation of errors
means that once you learn how to read errors, you have that ability with any
tool you use in Elm.
-}
decoder : D.Decoder Error
decoder =
  D.andThen toError (D.field "type" D.string)


toError : String -> D.Decoder Error
toError tipe =
  case tipe of
    "error" ->
      D.map3 (\p t m -> GeneralProblem { path = p, title = t, message = m })
        (D.field "path" (D.nullable D.string))
        (D.field "title" D.string)
        (D.field "message" (D.list chunkDecoder))

    "compile-errors" ->
      D.map ModuleProblems
        (D.field "errors" (D.list badModuleDecoder))

    _ ->
      D.fail (tipe ++ " is an unknown error type")



-- BAD MODULE


{-| When I cannot compile a module, I am able to report a bunch of problems at
once. So you may see a bunch of naming errors or type errors.
-}
type alias BadModule =
  { path : String
  , name : String
  , problems : List Problem
  }


badModuleDecoder : D.Decoder BadModule
badModuleDecoder =
  D.map3 BadModule
    (D.field "path" D.string)
    (D.field "name" D.string)
    (D.field "problems" (D.list problemDecoder))



-- PROBLEM


{-| A problem in an Elm module.
-}
type alias Problem =
  { title : String
  , region : Region
  , message : List Chunk
  }


problemDecoder : D.Decoder Problem
problemDecoder =
  D.map3 Problem
    (D.field "title" D.string)
    (D.field "region" regionDecoder)
    (D.field "message" (D.list chunkDecoder))



-- CHUNK


{-| A chunk of text to show. Chunks will contain newlines here and there, so
I recommend using `white-space: pre` to make sure everything looks alright.

The error messages are designed to look nice in 80 columns, and the only way
any line will be longer than that is if a code snippet from the user is longer.
Anyway, please try to get a presentation that matches the terminal pretty well.
It will look alright, and the consistency will be more valuable than any small
changes.
-}
type Chunk
  = Unstyled String
  | Styled Style String


{-| Widely supported styles for ANSI text. Bold and underline are used very
rarely in Elm output. Mainly for a `Note` or a `Hint` about something. Colors
are used relatively infrequently, primarily to draw attention to the most
important information. Red is the problem, yellow is distilled advice, etc.
-}
type alias Style =
  { bold : Bool
  , underline : Bool
  , color : Maybe Color
  }


chunkDecoder : D.Decoder Chunk
chunkDecoder =
  D.oneOf
    [ D.map Unstyled D.string
    , D.map2 Styled
        (D.map3 Style
          (D.field "bold" D.bool)
          (D.field "underline" D.bool)
          (D.field "color" (D.nullable colorDecoder))
        )
        (D.field "string" D.string)
    ]



-- COLOR


{-| Error messages use colors to emphasize the most useful information. This
helps people resolve their problems quicker! Because the errors need to work
on the terminal as well, the colors are limited to ANSI colors that are
widely supported by different terminal softwark.

So there are eight colors, each with a `Dull` and `VIVID` version.

**Note:** I have tried to make the _meaning_ of each color consistent across
all error messages (red is problem, yellow is decent advice, green is great
advice, cyan is helpful information, etc.) so please use colors that actually
match the color names! I think consistency is worth a lot within the ecosystem.
-}
type Color
  = Red
  | RED
  | Magenta
  | MAGENTA
  | Yellow
  | YELLOW
  | Green
  | GREEN
  | Cyan
  | CYAN
  | Blue
  | BLUE
  | White
  | WHITE
  | Black
  | BLACK


colorDecoder : D.Decoder Color
colorDecoder =
  D.andThen toColor D.string


toColor : String -> D.Decoder Color
toColor str =
  case str of
    "red"     -> D.succeed Red
    "RED"     -> D.succeed RED
    "magenta" -> D.succeed Magenta
    "MAGENTA" -> D.succeed MAGENTA
    "yellow"  -> D.succeed Yellow
    "YELLOW"  -> D.succeed YELLOW
    "green"   -> D.succeed Green
    "GREEN"   -> D.succeed GREEN
    "cyan"    -> D.succeed Cyan
    "CYAN"    -> D.succeed CYAN
    "blue"    -> D.succeed Blue
    "BLUE"    -> D.succeed BLUE
    "white"   -> D.succeed White
    "WHITE"   -> D.succeed WHITE
    "black"   -> D.succeed Black
    "BLACK"   -> D.succeed BLACK
    _         -> D.fail (str ++ " is not a known color")



-- REGION


{-| Every `Problem` is caused by code in a specific `Region`.
-}
type alias Region =
  { start : Position
  , end : Position
  }


{-| A line and column in the source file. Both are one-indexed, so every file
starts at `{ line = 1, column = 1 }` and increases from there.
-}
type alias Position =
  { line : Int
  , column : Int
  }


regionDecoder : D.Decoder Region
regionDecoder =
  D.map2 Region
    (D.field "start" positionDecoder)
    (D.field "end" positionDecoder)


positionDecoder : D.Decoder Position
positionDecoder =
  D.map2 Position
    (D.field "line" D.int)
    (D.field "column" D.int)
