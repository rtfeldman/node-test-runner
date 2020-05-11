module Elm.Module exposing
  ( Name
  , toString
  , fromString
  , encode
  , decoder
  )


{-| Helpers for working with module name strings in `elm.json` files.

# Modules
@docs Name

# String Conversions
@docs toString, fromString

# JSON Conversions
@docs encode, decoder

-}


import Char
import Json.Decode as D
import Json.Encode as E



-- MODULE


{-| A guaranteed valid Elm module name.
-}
type Name =
  Name String



-- STRINGS


{-| Convert a `Name` to a `String` that works in `elm.json`
-}
toString : Name -> String
toString (Name name) =
  name


{-| Try to convert a `String` into a `Name`:

    fromString "Maybe"       == Just ...
    fromString "Elm.Name"  == Just ...
    fromString "Json.Decode" == Just ...
    fromString "json.decode" == Nothing
    fromString "Json_Decode" == Nothing
-}
fromString : String -> Maybe Name
fromString string =
  if List.all isGoodChunk (String.split "." string) then
    Just (Name string)
  else
    Nothing


isGoodChunk : String -> Bool
isGoodChunk chunk =
  case String.uncons chunk of
    Nothing ->
      False

    Just (char, rest) ->
      Char.isUpper char && String.all Char.isAlphaNum rest



-- JSON


{-| Turn a `Name` into a string for use in `elm.json`
-}
encode : Name -> E.Value
encode (Name name) =
  E.string name


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
      D.fail "I need a valid module name like \"Json.Decode\""
