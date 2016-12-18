module DocTestExample exposing (..)

{-| An example using doctests
-}


{-|
    >>> add 1 2
    3

    >>> add 99 3
    102
-}
add : Int -> Int -> Int
add =
    (+)
