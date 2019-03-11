module Console.Text
    exposing
        ( Color
        , ColorModifier
        , Style
        , Text
        , UseColor(..)
        , black
        , blue
        , bold
        , concat
        , cyan
        , dark
        , default
        , green
        , inverted
        , magenta
        , plain
        , red
        , render
        , underline
        , white
        , yellow
        )

import Test.Runner.Node.Vendor.Console as Console


type Text
    = Text { background : Color, foreground : Color, style : Style, modifiers : List ColorModifier } String
    | Texts (List Text)


type UseColor
    = UseColor
    | Monochrome


type Color
    = Default
    | Red
    | Green
    | Yellow
    | Black
    | Blue
    | Magenta
    | Cyan
    | White


type ColorModifier
    = Inverted
    | Dark


type Style
    = Normal
    | Bold
    | Underline


render : UseColor -> Text -> String
render useColor txt =
    case txt of
        Text attrs str ->
            case useColor of
                UseColor ->
                    str
                        |> colorizeBackground attrs.background
                        |> colorizeForeground attrs.foreground
                        |> applyModifiers attrs.modifiers
                        |> applyStyle attrs.style

                Monochrome ->
                    str

        Texts texts ->
            List.map (render useColor) texts
                |> String.join ""


concat : List Text -> Text
concat =
    Texts


plain : String -> Text
plain =
    Text { foreground = Default, background = Default, style = Normal, modifiers = [] }



-- FOREGROUND COLORS --


default : String -> Text
default =
    Text { foreground = Default, background = Default, style = Normal, modifiers = [] }


red : String -> Text
red =
    Text { foreground = Red, background = Default, style = Normal, modifiers = [] }


green : String -> Text
green =
    Text { foreground = Green, background = Default, style = Normal, modifiers = [] }


yellow : String -> Text
yellow =
    Text { foreground = Yellow, background = Default, style = Normal, modifiers = [] }


black : String -> Text
black =
    Text { foreground = Black, background = Default, style = Normal, modifiers = [] }


blue : String -> Text
blue =
    Text { foreground = Blue, background = Default, style = Normal, modifiers = [] }


magenta : String -> Text
magenta =
    Text { foreground = Magenta, background = Default, style = Normal, modifiers = [] }


cyan : String -> Text
cyan =
    Text { foreground = Cyan, background = Default, style = Normal, modifiers = [] }


white : String -> Text
white =
    Text { foreground = White, background = Default, style = Normal, modifiers = [] }


inverted : Text -> Text
inverted txt =
    case txt of
        Text styles str ->
            Text { styles | modifiers = Inverted :: styles.modifiers } str

        Texts texts ->
            Texts (List.map inverted texts)


dark : Text -> Text
dark txt =
    case txt of
        Text styles str ->
            Text { styles | modifiers = Dark :: styles.modifiers } str

        Texts texts ->
            Texts (List.map dark texts)



-- BACKGROUND COLORS --


bgRed : String -> Text
bgRed =
    Text { foreground = Default, background = Red, style = Normal, modifiers = [] }


bgGreen : String -> Text
bgGreen =
    Text { foreground = Default, background = Green, style = Normal, modifiers = [] }


bgYellow : String -> Text
bgYellow =
    Text { foreground = Default, background = Yellow, style = Normal, modifiers = [] }


bgBlack : String -> Text
bgBlack =
    Text { foreground = Default, background = Black, style = Normal, modifiers = [] }


bgBlue : String -> Text
bgBlue =
    Text { foreground = Default, background = Blue, style = Normal, modifiers = [] }


bgMagenta : String -> Text
bgMagenta =
    Text { foreground = Default, background = Magenta, style = Normal, modifiers = [] }


bgCyan : String -> Text
bgCyan =
    Text { foreground = Default, background = Cyan, style = Normal, modifiers = [] }


bgWhite : String -> Text
bgWhite =
    Text { foreground = Default, background = White, style = Normal, modifiers = [] }



-- STYLES --


normal : Text -> Text
normal txt =
    case txt of
        Text styles str ->
            Text { styles | style = Normal } str

        Texts texts ->
            Texts (List.map dark texts)


bold : Text -> Text
bold txt =
    case txt of
        Text styles str ->
            Text { styles | style = Bold } str

        Texts texts ->
            Texts (List.map dark texts)


underline : Text -> Text
underline txt =
    case txt of
        Text styles str ->
            Text { styles | style = Underline } str

        Texts texts ->
            Texts (List.map dark texts)



-- INTERNAL HELPERS --


colorizeForeground : Color -> String -> String
colorizeForeground color str =
    case color of
        Default ->
            str

        Red ->
            Console.red str

        Green ->
            Console.green str

        Yellow ->
            Console.yellow str

        Black ->
            Console.black str

        Blue ->
            Console.blue str

        Magenta ->
            Console.magenta str

        Cyan ->
            Console.cyan str

        White ->
            Console.white str


colorizeBackground : Color -> String -> String
colorizeBackground color str =
    case color of
        Default ->
            str

        Red ->
            Console.bgRed str

        Green ->
            Console.bgGreen str

        Yellow ->
            Console.bgYellow str

        Black ->
            Console.bgBlack str

        Blue ->
            Console.bgBlue str

        Magenta ->
            Console.bgMagenta str

        Cyan ->
            Console.bgCyan str

        White ->
            Console.bgWhite str


applyStyle : Style -> String -> String
applyStyle style str =
    case style of
        Normal ->
            str

        Bold ->
            Console.bold str

        Underline ->
            Console.underline str


applyModifiers : List ColorModifier -> String -> String
applyModifiers modifiers str =
    List.foldl applyModifiersHelp str modifiers


applyModifiersHelp : ColorModifier -> String -> String
applyModifiersHelp modifier str =
    case modifier of
        Inverted ->
            Console.colorsInverted str

        Dark ->
            Console.dark str
