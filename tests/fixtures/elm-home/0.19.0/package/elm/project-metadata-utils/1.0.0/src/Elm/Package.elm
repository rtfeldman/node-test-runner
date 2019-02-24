module Elm.Package exposing
  ( Name
  , toString
  , fromString
  , encode
  , decoder
  )


{-| Helpers for working with package name strings in `elm.json` files.

# Packages
@docs Name

# String Conversions
@docs toString, fromString

# JSON Conversions
@docs encode, decoder

-}


import Json.Decode as D
import Json.Encode as E



-- MODULE


{-| A guaranteed valid Elm package name.
-}
type Name =
  Name String String



-- STRINGS


{-| Convert a `Name` to a `String` that works in `elm.json`
-}
toString : Name -> String
toString (Name user project) =
  user ++ "/" ++ project


{-| Try to convert a `String` into a `Name`:

    fromString "elm/core"    == Just ...
    fromString "elm/html"    == Just ...
    fromString "tom/elm-css" == Just ...
    fromString "tom/elm_css" == Nothing
    fromString "tom/x.js"    == Nothing
    fromString "elm"         == Nothing
    fromString "html"        == Nothing
-}
fromString : String -> Maybe Name
fromString string =
  case String.split "/" string of
    [author, project] ->
      if isBadProjectName project then
        Nothing
      else
        Just (Name author project)

    _ ->
      Nothing


isBadProjectName : String -> Bool
isBadProjectName project =
  case String.uncons project of
    Nothing ->
      True

    Just (c,_) ->
      String.contains "--" project
      || String.any isBadChar project
      || String.startsWith "-" project
      || not (Char.isLower c)


isBadChar : Char -> Bool
isBadChar char =
  Char.isUpper char || char == '.' || char == '_'



-- JSON


{-| Turn a `Name` into a string for use in `elm.json`
-}
encode : Name -> E.Value
encode name =
  E.string (toString name)


{-| Decode the module name strings that appear in `elm.json`
-}
decoder : D.Decoder Name
decoder =
  D.andThen decoderHelp D.string


decoderHelp : String -> D.Decoder Name
decoderHelp string =
  case fromString string of
    Just name ->
      D.succeed name

    Nothing ->
      D.fail "I need a valid package name like \"elm/core\""
