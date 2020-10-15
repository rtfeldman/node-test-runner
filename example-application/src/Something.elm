module Something exposing (main, ultimateAnswer)

-- `import VirtualDom` refers to ./VirtualDom.elm, not the VirtualDom package,
-- which is an indirect dependency (of Html). This tests that we’re not breaking
-- stuff when constructing the elm.json used for running the test.

import Html
import VirtualDom


main : Html.Html msg
main =
    Html.text "yes"


ultimateAnswer : Int
ultimateAnswer =
    41 + VirtualDom.t
