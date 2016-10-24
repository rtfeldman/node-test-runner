module Test.Page exposing (Step)

{-

Development note: in the future, this should be refactored to support andThen.

That way you could write this:

Page.visit "http://elm-lang.org/"
    |> Page.andThen (\_ -> Page.title (Expect.equal "home"))
    |> Page.andThen (\_ -> Page.text ".splash div:nth-child(2)" (Expect.equal "A delightful language for reliable webapps."))
    |> Page.andThen (\_ -> Page.clickLink "Get Started")
    |> Page.andThen (\_ -> Page.url (Expect.equal "https://guide.elm-lang.org/get_started.html"))

...except if you actually want to use the result of the previous step, you'd
have access to it in the anonymous function.

Since the most common use case would be to ignore the previous step's value,
I'd also want to use a custom operator to make that case more concise, e.g.:

Page.visit "http://elm-lang.org/"
    |! Page.title (Expect.equal "home")
    |! Page.text ".splash div:nth-child(2)" (Expect.lengthEqual "A delightful language for reliable webapps.")
    |> Page.andThen (\_ -> Page.clickLink "Get Started")
    |! Page.url (Expect.equal "https://guide.elm-lang.org/get_started.html")

This way in the typical case you aren't doing much extra work. I don't see a
need for a custom andThen operator here.

-}

type Step
    = Step
