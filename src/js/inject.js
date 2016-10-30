var fs = require("fs");

module.exports = function() {
  // TODO infer path from Node env info
  var extras = fs.readFileSync("/Users/rtfeldman/code/node-test-runner/src/js/extras.js", {encoding: "utf8"});

  return extras +
    "\n_elm_lang$core$Native_Platform.addPublicModule(Elm['Main'], 'Main', {\n" +
          "main: $$$testRunner$run(\n" +
                  "_elm_community$elm_test$Test$concat(\n" +
                          "_elm_lang$core$Native_List.fromArray(\n" +
                                  "$$$testRunner$tests))),\n" +
          "flags: _elm_lang$core$Json_Decode$value\n" +
      "});\n";
};
