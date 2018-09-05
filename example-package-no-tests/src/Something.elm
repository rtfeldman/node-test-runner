module Something exposing (ultimateAnswer)

-- Elm.Docs from elm/project-metadata-utils is imported because
-- it has a dependency on elm/parser, which is not a dependency of
-- node-test-runner.  This is done to test that the generated elm.json
-- for package projects correctly includes any necessary transitive
-- dependencies of the package being tested

import Elm.Docs


ultimateAnswer : Int
ultimateAnswer =
    42
