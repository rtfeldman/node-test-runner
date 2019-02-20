module Test.Reporter.Highlightable exposing (Highlightable, fromDiff, diffLists, map, resolve)

import Test.Runner.Node.Vendor.Diff as Diff exposing (Change(..))


type Highlightable a
    = Highlighted a
    | Plain a


resolve : { fromHighlighted : a -> b, fromPlain : a -> b } -> Highlightable a -> b
resolve { fromHighlighted, fromPlain } highlightable =
    case highlightable of
        Highlighted val ->
            fromHighlighted val

        Plain val ->
            fromPlain val


diffLists : List a -> List a -> List (Highlightable a)
diffLists expected actual =
    -- TODO make sure this looks reasonable for multiline strings
    Diff.diff expected actual
        |> List.concatMap fromDiff


map : (a -> b) -> Highlightable a -> Highlightable b
map transform highlightable =
    case highlightable of
        Highlighted val ->
            Highlighted (transform val)

        Plain val ->
            Plain (transform val)


fromDiff : Change a -> List (Highlightable a)
fromDiff diff =
    case diff of
        Added char ->
            []

        Removed char ->
            [ Highlighted char ]

        NoChange char ->
            [ Plain char ]
