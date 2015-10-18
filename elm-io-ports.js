/* Implementation from: https://raw.githubusercontent.com/laszlopandy/elm-console/1.0.2/elm-io.sh */
module.exports =
  "(function(){\n" +
  "    window = {Date: Date};\n" +
  "    if (typeof Elm === \"undefined\") { throw \"elm-io config error: Elm is not defined. Make sure you call elm-io with a real Elm output file\"}\n" +
  "    if (typeof Elm.Main === \"undefined\" ) { throw \"Elm.Main is not defined, make sure your module is named Main.\" };\n" +
  "    var worker = Elm.worker(Elm.Main);\n" +
  "})();\n";
