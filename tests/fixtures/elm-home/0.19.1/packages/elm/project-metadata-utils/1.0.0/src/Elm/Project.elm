module Elm.Project exposing
  ( Project(..)
  , ApplicationInfo
  , PackageInfo
  , Deps
  , Exposed(..)
  , encode
  , decoder
  )


{-| Turn `elm.json` files into data that is nice to use in Elm.

# Projects
@docs Project, ApplicationInfo, Deps, PackageInfo, Exposed

# JSON Conversions
@docs encode, decoder

-}


import Dict
import Elm.Constraint as Constraint exposing (Constraint)
import Elm.License as License exposing (License)
import Elm.Module as Module
import Elm.Package as Package
import Elm.Version as Version exposing (Version)
import Json.Decode as D
import Json.Encode as E



-- PROJECT


{-| There are two types of Elm projects, one for applications and another one
for packages. The `elm.json` is different in each case, so we they are modeled
as [`ApplicationInfo`](#ApplicationInfo) and [`PackageInfo`](#PackageInfo) types.
-}
type Project
  = Application ApplicationInfo
  | Package PackageInfo


{-| The contents of an `elm.json` with `"type": "application"`.
-}
type alias ApplicationInfo =
  { elm : Version
  , dirs : List String
  , depsDirect : Deps Version
  , depsIndirect : Deps Version
  , testDepsDirect : Deps Version
  , testDepsIndirect : Deps Version
  }


{-| The contents of an `elm.json` with `"type": "package"`.
-}
type alias PackageInfo =
  { name : Package.Name
  , summary : String
  , license : License.License
  , version : Version
  , exposed : Exposed
  , deps : Deps Constraint
  , testDeps : Deps Constraint
  , elm : Constraint
  }


{-| There are two ways to specify `"exposed-modules"` field in an `elm.json`
for packages. In one you just list the exposed modules. In the other, you
provide headers for chunks of module names. In either case, the package website
preserves this information to make the presentation nicer.
-}
type Exposed
  = ExposedList (List Module.Name)
  | ExposedDict (List (String, List Module.Name))


{-| The dependencies for a project. The order is preserved from JSON.
-}
type alias Deps constraint =
  List (Package.Name, constraint)



-- ENCODE


{-| Turn a `Project` into the JSON that goes in `elm.json`
-}
encode : Project -> E.Value
encode project =
  case project of
    Application { elm, dirs, depsDirect, depsIndirect, testDepsDirect, testDepsIndirect } ->
      E.object
        [ ("type", E.string "application")
        , ("source-directories", E.list E.string dirs)
        , ("elm-version", Version.encode elm)
        , ("dependencies"
          , E.object
              [ ("direct", encodeDeps Version.encode depsDirect)
              , ("indirect", encodeDeps Version.encode depsIndirect)
              ]
          )
        , ("test-dependencies"
          , E.object
              [ ("direct", encodeDeps Version.encode testDepsDirect)
              , ("indirect", encodeDeps Version.encode testDepsIndirect)
              ]
          )
        ]

    Package { name, summary, license, version, exposed, deps, testDeps, elm } ->
      E.object
        [ ("type", E.string "package")
        , ("name", Package.encode name)
        , ("summary", E.string summary)
        , ("license", License.encode license)
        , ("version", Version.encode version)
        , ("exposed-modules", encodeExposed exposed)
        , ("elm-version", Constraint.encode elm)
        , ("dependencies", encodeDeps Constraint.encode deps)
        , ("test-dependencies", encodeDeps Constraint.encode testDeps)
        ]


encodeExposed : Exposed -> E.Value
encodeExposed exposed =
  case exposed of
    ExposedList modules ->
      E.list Module.encode modules

    ExposedDict chunks ->
      E.object (List.map encodeChunk chunks)


encodeChunk : (String, List Module.Name) -> (String, E.Value)
encodeChunk (header, list) =
  (header, E.list Module.encode list)


encodeDeps : (constraint -> E.Value) -> Deps constraint -> E.Value
encodeDeps encodeConstraint deps =
  E.object <| List.sortBy Tuple.first <|
    List.map (encodeDep encodeConstraint) deps


encodeDep : (constraint -> E.Value) -> (Package.Name, constraint) -> (String, E.Value)
encodeDep encodeConstraint (name, constraint) =
  (Package.toString name, encodeConstraint constraint)



-- DECODE


{-| Decode the contents of `elm.json` into a `Project`.
-}
decoder : D.Decoder Project
decoder =
  D.andThen decoderHelp (D.field "type" D.string)


decoderHelp : String -> D.Decoder Project
decoderHelp tipe =
  case tipe of
    "application" ->
      D.map Application applicationDecoder

    "package" ->
      D.map Package packageDecoder

    other ->
      D.fail <|
        """The "type" field must be either "application" or "package", so """
        ++ "\"" ++ other ++ "\" is not acceptable."


applicationDecoder : D.Decoder ApplicationInfo
applicationDecoder =
  D.map6 ApplicationInfo
    (D.field "elm-version" Version.decoder)
    (D.field "source-directories" (D.list D.string))
    (D.at ["dependencies","direct"] (depsDecoder Version.decoder))
    (D.at ["dependencies","indirect"] (depsDecoder Version.decoder))
    (D.at ["test-dependencies","direct"] (depsDecoder Version.decoder))
    (D.at ["test-dependencies","indirect"] (depsDecoder Version.decoder))


packageDecoder : D.Decoder PackageInfo
packageDecoder =
  D.map8 PackageInfo
    (D.field "name" Package.decoder)
    (D.field "summary" summaryDecoder)
    (D.field "license" License.decoder)
    (D.field "version" Version.decoder)
    (D.field "exposed-modules" exposedDecoder)
    (D.field "dependencies" (depsDecoder Constraint.decoder))
    (D.field "test-dependencies" (depsDecoder Constraint.decoder))
    (D.field "elm-version" Constraint.decoder)


summaryDecoder : D.Decoder String
summaryDecoder =
  D.andThen summaryCheck D.string


summaryCheck : String -> D.Decoder String
summaryCheck summary =
  if String.length summary < 80 then
    D.succeed summary
  else
    D.fail "The \"summary\" field must have fewer than 80 characters."


depsDecoder : D.Decoder a -> D.Decoder (Deps a)
depsDecoder constraintDecoder =
  D.andThen (verifyDepNames []) (D.keyValuePairs constraintDecoder)


verifyDepNames : Deps a -> List (String, a) -> D.Decoder (Deps a)
verifyDepNames revDeps pairs =
  case pairs of
    [] ->
      D.succeed (List.reverse revDeps)

    (key, con) :: otherPairs ->
      case Package.fromString key of
        Just pkg ->
          verifyDepNames ((pkg, con) :: revDeps) otherPairs

        Nothing ->
          D.fail ("\"" ++ key ++ "\" is not a valid package name.")



-- EXPOSED MODULES DECODER


exposedDecoder : D.Decoder Exposed
exposedDecoder =
  D.oneOf
    [ D.map ExposedList (D.list Module.decoder)
    , D.map ExposedDict <|
        D.andThen checkExposedDict (D.keyValuePairs (D.list Module.decoder))
    ]


checkExposedDict : List (String, a) -> D.Decoder (List (String, a))
checkExposedDict dict =
  case checkHeaders dict of
    Nothing ->
      D.succeed dict

    Just badHeader ->
      D.fail ("The \"" ++ badHeader ++ "\" header is too long. Twenty characters max!")


checkHeaders : List (String, a) -> Maybe String
checkHeaders dict =
  case dict of
    [] ->
      Nothing

    (header, _) :: others ->
      if String.length header < 20 then
        checkHeaders others
      else
        Just header
