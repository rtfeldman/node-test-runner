module Elm.Version exposing
  ( Version
  , one
  , compare
  , toString
  , fromString
  , encode
  , decoder
  , toTuple
  , fromTuple
  )


{-| Helpers for working with version strings in `elm.json` files.

# Versions
@docs Version, one, compare

# String Conversions
@docs toString, fromString

# JSON Conversions
@docs encode, decoder

# Tuple Conversions
@docs toTuple, fromTuple

-}


import Json.Decode as D
import Json.Encode as E



-- VERSION


{-| A guaranteed valid Elm version. All versions are `1.0.0` or greater.
-}
type Version =
  Version Int Int Int


{-| Version `1.0.0` for easy access.
-}
one : Version
one =
  Version 1 0 0


{-| Compare two versions:

    v1 = fromString "1.0.0"
    v2 = fromString "2.0.0"
    v3 = fromString "3.0.0"

    -- Maybe.map2 compare v1 v2 == Just LT
    -- Maybe.map2 compare v2 v2 == Just EQ
    -- Maybe.map2 compare v2 v1 == Just GT

-}
compare : Version -> Version -> Order
compare (Version major1 minor1 patch1) (Version major2 minor2 patch2) =
  case Basics.compare major1 major2 of
    LT -> LT
    GT -> GT
    EQ ->
      case Basics.compare minor1 minor2 of
        LT -> LT
        EQ -> Basics.compare patch1 patch2
        GT -> GT



-- STRINGS


{-| Convert a `Version` to a `String` that works in `elm.json`

    toString one == "1.0.0"
-}
toString : Version -> String
toString (Version major minor patch) =
  String.fromInt major ++ "." ++ String.fromInt minor ++ "." ++ String.fromInt patch


{-| Try to convert a `String` into a `Version`. The major, minor, and patch
numbers must all appear separated by dots:

    fromString "1.0.0" == Just one
    fromString "2.0.0" == Just ...
    fromString "3-0-0" == Nothing
    fromString "3.0"   == Nothing
-}
fromString : String -> Maybe Version
fromString string =
  case List.map String.toInt (String.split "." string) of
    [Just major, Just minor, Just patch] ->
      checkNumbers major minor patch

    _ ->
      Nothing


checkNumbers : Int -> Int -> Int -> Maybe Version
checkNumbers major minor patch =
  if major >= 0 && minor >= 0 && patch >= 0 then
    Just (Version major minor patch)
  else
    Nothing



-- TUPLES


{-| Turn a `Version` into a tuple to extract the numbers as integers.

    toTuple one == (1, 0, 0)

    Maybe.map toTuple (fromString "2.0.4" ) == Just (2, 0, 4)
    Maybe.map toTuple (fromString "7.3.10") == Just (7, 3, 10)
-}
toTuple : Version -> (Int, Int, Int)
toTuple (Version major minor patch) =
  (major, minor, patch)


{-| Try to make a `Version` from given numbers. This way you do not need
to turn things into strings for no reason. It can still fail if you give
negative numbers or versions below `1.0.0`:

    fromTuple (1, 0, 0) == Just one
    fromTuple (2, 0, 1) == Just ...
    fromTuple (0, 0, 1) == Nothing
-}
fromTuple : (Int, Int, Int) -> Maybe Version
fromTuple (major, minor, patch) =
  checkNumbers major minor patch



-- JSON


{-| Turn a `Version` into a string for use in `elm.json`
-}
encode : Version -> E.Value
encode version =
  E.string (toString version)


{-| Decode the version strings that appear in `elm.json`
-}
decoder : D.Decoder Version
decoder =
  D.andThen decoderHelp D.string


decoderHelp : String -> D.Decoder Version
decoderHelp string =
  case fromString string of
    Just version ->
      D.succeed version

    Nothing ->
      D.fail "I need a valid version like \"2.0.1\""
