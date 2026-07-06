module Test.Reporter.Highlightable exposing (Highlightable, diffLists, map, resolve)

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
    let
        ( prefix, restExpected, restActual ) =
            trimPrefix [] expected actual

        ( suffixRev, midExpectedRev, midActualRev ) =
            trimPrefix [] (List.reverse restExpected) (List.reverse restActual)

        middle =
            Diff.diff (List.reverse midExpectedRev) (List.reverse midActualRev)
                |> List.concatMap fromDiff
    in
    List.map Plain prefix ++ middle ++ List.map Plain (List.reverse suffixRev)


trimPrefix : List a -> List a -> List a -> ( List a, List a, List a )
trimPrefix acc a b =
    case ( a, b ) of
        ( x :: restA, y :: restB ) ->
            if x == y then
                trimPrefix (x :: acc) restA restB

            else
                ( List.reverse acc, a, b )

        _ ->
            ( List.reverse acc, a, b )


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
        Added _ ->
            []

        Removed char ->
            [ Highlighted char ]

        NoChange char ->
            [ Plain char ]
