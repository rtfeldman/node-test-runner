module.exports =
  "(function(Elm, chalk){\n" +
  "    window = {Date: Date, addEventListener: function() {}, removeEventListener: function() {}};\n" +
  "    document = {body: {}, createTextNode: function() { return {}; }};\n" +
  "    if (typeof XMLHttpRequest === 'undefined') { XMLHttpRequest = function() { return { addEventListener: function() {}, open: function() {}, send: function() {} }; }; }\n" +
  "    if (typeof FormData === 'undefined') { FormData = function () { this._data = []; }; FormData.prototype.append = function () { this._data.push(Array.prototype.slice.call(arguments)); }; }\n" +
  "    if (typeof Elm === 'undefined') { throw 'elm-io config error: Elm is not defined. Make sure you provide a file compiled by Elm!'}\n" +
  "    if (typeof Elm.Main === 'undefined' ) { throw 'Elm.Main is not defined. Make sure your module is named Main.' };\n" +
  "    var app = Elm.Main.embed({appendChild: function() {}});\n" +
  "    app.ports.emit.subscribe(function(msg) {\n" +
  "      var msgType = msg[0];\n" +
  "      var data = msg[1];\n" +
  "      if (msgType === 'FINISHED') {\n" +
  "        process.exit(data);\n" +
  "      } else if (msgType === 'CHALK') {\n" +
  "        data.forEach(function(msg) {\n" +
  "          var path = msg.styles;\n" +
  "          if (path.length === 0) {\n" +
  "            console.log(msg.text);\n" +
  "          } else {\n" +
  "            var fn = chalk;\n" +
  "            path.forEach(function(nextPath) { fn = fn[nextPath]; });\n" +
  "            console.log(fn(msg.text));\n" +
  "          }\n" +
  "        });\n" +
  "      }\n" +
  "    });\n" +
  "})(module.exports, require('chalk'));\n";
