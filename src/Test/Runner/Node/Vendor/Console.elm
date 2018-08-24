module Test.Runner.Node.Vendor.Console exposing (..)

{-| -}

-- NOTE: This is copy/pasted from https://github.com/rtfeldman/console-print
-- It's inlined to avoid having to call elm-package install on the end user's
-- system - the approach this library took prior to
-- commit 19047f01d460739bfe7f16466bc60b41430a8f09 - because it assumes
-- the end user has the correct elm-package on their PATH, which is not a
-- safe assumption.
--
-- License:
{-
   BSD 3-Clause License

   Copyright (c) 2017, Richard Feldman
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are met:

   * Redistributions of source code must retain the above copyright notice, this
     list of conditions and the following disclaimer.

   * Redistributions in binary form must reproduce the above copyright notice,
     this list of conditions and the following disclaimer in the documentation
     and/or other materials provided with the distribution.

   * Neither the name of the copyright holder nor the names of its
     contributors may be used to endorse or promote products derived from
     this software without specific prior written permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
-}


{-| Display the text in the console's default style.
-}
plain : String -> String
plain str =
    String.join "" [ "\u{001B}[0m", str, "\u{001B}[0m" ]


{-| Make the text darker.

This can be used with other text modifiers, such as color.

    import Console exposing (dark, green)

    -- "Hello, dark green world!" with "dark green" in dark green

    greeting : String
    greeting =
        "Hello, " ++ (dark << green) "dark green" ++ " world!"

Not all terminals support this.

-}
dark : String -> String
dark str =
    String.join "" [ "\u{001B}[2m", str, "\u{001B}[22m" ]


{-| Make the text bold.

This can be used with other text modifiers, such as color.

    import Console exposing (blue, bold)

    -- "Hello, bold blue world!" with "bold blue" in bold and blue

    greeting : String
    greeting =
        "Hello, " ++ (bold << blue) "bold blue" ++ " world!"

Some terminals implement this as a color change rather than a boldness change.

-}
bold : String -> String
bold str =
    String.join "" [ "\u{001B}[1m", str, "\u{001B}[22m" ]


{-| Make the text underlined.

This can be used with other text modifiers, such as color.

    import Console exposing (underline)

    -- "This will look like a hyperlink" with "hyperlink" underlined

    example : String
    example =
        "This will look like a " ++ underline "hyperlink"

Not all terminals support this.

-}
underline : String -> String
underline str =
    String.join "" [ "\u{001B}[4m", str, "\u{001B}[24m" ]


{-| Invert the foreground and background colors from what they would otherwise be.
-}
colorsInverted : String -> String
colorsInverted str =
    String.join "" [ "\u{001B}[7m", str, "\u{001B}[27m" ]



-- Foreground Colors


{-| Make the foreground text black.
-}
black : String -> String
black str =
    String.join "" [ "\u{001B}[30m", str, "\u{001B}[39m" ]


{-| Make the foreground text red.
-}
red : String -> String
red str =
    String.join "" [ "\u{001B}[31m", str, "\u{001B}[39m" ]


{-| Make the foreground text green.
-}
green : String -> String
green str =
    String.join "" [ "\u{001B}[32m", str, "\u{001B}[39m" ]


{-| Make the foreground text yellow.
-}
yellow : String -> String
yellow str =
    String.join "" [ "\u{001B}[33m", str, "\u{001B}[39m" ]


{-| Make the foreground text blue.
-}
blue : String -> String
blue str =
    String.join "" [ "\u{001B}[34m", str, "\u{001B}[39m" ]


{-| Make the foreground text magenta.
-}
magenta : String -> String
magenta str =
    String.join "" [ "\u{001B}[35m", str, "\u{001B}[39m" ]


{-| Make the foreground text cyan.
-}
cyan : String -> String
cyan str =
    String.join "" [ "\u{001B}[36m", str, "\u{001B}[39m" ]


{-| Make the foreground text white.
-}
white : String -> String
white str =
    String.join "" [ "\u{001B}[37m", str, "\u{001B}[39m" ]



-- Background Colors


{-| Make the background black.
-}
bgBlack : String -> String
bgBlack str =
    String.join "" [ "\u{001B}[40m", str, "\u{001B}[49m" ]


{-| Make the background red.
-}
bgRed : String -> String
bgRed str =
    String.join "" [ "\u{001B}[41m", str, "\u{001B}[49m" ]


{-| Make the background green.
-}
bgGreen : String -> String
bgGreen str =
    String.join "" [ "\u{001B}[42m", str, "\u{001B}[49m" ]


{-| Make the background yellow.
-}
bgYellow : String -> String
bgYellow str =
    String.join "" [ "\u{001B}[43m", str, "\u{001B}[49m" ]


{-| Make the background blue.
-}
bgBlue : String -> String
bgBlue str =
    String.join "" [ "\u{001B}[44m", str, "\u{001B}[49m" ]


{-| Make the background magenta.
-}
bgMagenta : String -> String
bgMagenta str =
    String.join "" [ "\u{001B}[45m", str, "\u{001B}[49m" ]


{-| Make the background cyan.
-}
bgCyan : String -> String
bgCyan str =
    String.join "" [ "\u{001B}[46m", str, "\u{001B}[49m" ]


{-| Make the background white.
-}
bgWhite : String -> String
bgWhite str =
    String.join "" [ "\u{001B}[47m", str, "\u{001B}[49m" ]
