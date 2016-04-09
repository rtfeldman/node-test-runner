/* Implementation from: https://github.com/laszlopandy/elm-console/blob/master/elm-io.sh */
module.exports =
  "(function(){\n" +
  "    window = {Date: Date, addEventListener: function() {}, removeEventListener: function() {}};\n" +
  "    if (typeof XMLHttpRequest === \"undefined\") { XMLHttpRequest = function() { return { addEventListener: function() {}, open: function() {}, send: function() {} }; }; }\n" +
  "    if (typeof FormData === \"undefined\") { FormData = function () { this._data = []; }; FormData.prototype.append = function () { this._data.push(Array.prototype.slice.call(arguments)); }; }\n" +
  "    if (typeof Elm === \"undefined\") { throw \"elm-io config error: Elm is not defined. Make sure you call elm-io with a real Elm output file\"}\n" +
  "    if (typeof Elm.Main === \"undefined\" ) { throw \"Elm.Main is not defined, make sure your module is named Main.\" };\n" +
  "    var worker = Elm.worker(Elm.Main);\n" +
  "})();\n";
