
module.exports = function(moduleName, testVariableNames) {
  return "var " + moduleName + "$main = {\n" +
          "main: A2(\n" +
                  "$$$testRunner$run,\n" +
                  "$$$testRunner$emit,\n" +
                  "_elm_community$elm_test$Test$concat(\n" +
                          "_elm_lang$core$Native_List.fromArray(\n" +
                                  "[" + testVariableNames.join(",") + "]))),\n" +
          "flags: _elm_lang$core$Json_Decode$value\n" +
      "};\n"
};
