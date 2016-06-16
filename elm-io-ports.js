module.exports =
  "(function(Elm, chalk){\n" +
  // Make sure necessary things are defined.
  "    if (typeof Elm === 'undefined') { throw 'elm-io config error: Elm is not defined. Make sure you provide a file compiled by Elm!'}\n" +
  "    if (typeof Elm.Main === 'undefined' ) { throw 'Elm.Main is not defined. Make sure your module is named Main.' };\n" +

  // Apply Node polyfills as necessary.
  "    window = {Date: Date, addEventListener: function() {}, removeEventListener: function() {}};\n" +
  "    document = {body: {}, createTextNode: function() {}};\n" +
  "    if (typeof XMLHttpRequest === 'undefined') { XMLHttpRequest = function() { return { addEventListener: function() {}, open: function() {}, send: function() {} }; }; }\n" +
  "    if (typeof FormData === 'undefined') { FormData = function () { this._data = []; }; FormData.prototype.append = function () { this._data.push(Array.prototype.slice.call(arguments)); }; }\n" +

  // Fix Windows Unicode problems. Credit to https://github.com/sindresorhus/figures for the Windows compat idea!
  "    var windowsSubstitutions = [[/[↓✗]/g, '>'], [/✔/g, '√']];\n" +
  "    function windowsify(str) { return windowsSubstitutions.reduce(\n" +
  "        function(result, sub) { return result.replace(sub[0], sub[1]); }, str\n" +
  "      );\n" +
  "    }\n" +

  "    function chalkify(messages) {\n" +
  "        return messages.map(function(msg) {\n" +
  "          var path = msg.styles;\n" +
  "          var text = process.platform === 'win32' ? windowsify(msg.text) : msg.text;\n" +

  "          if (path.length === 0) {\n" +
  "            return text;\n" +
  "          } else {\n" +
  "            var fn = chalk;\n" +

  "            path.forEach(function(nextPath) { fn = fn[nextPath]; });\n" +

  "            return fn(text);\n" +
  "          }\n" +
  "        }).join('');\n" +
  "    }\n" +

  // Run the Elm app.
  "    var app = Elm.Main.embed({appendChild: function() {}});\n" +

  // Receive messages from ports and translate them into appropriate JS calls.
  "    app.ports.emit.subscribe(function(msg) {\n" +
  "      var msgType = msg[0];\n" +
  "      var data = msg[1];\n" +

  "      if (msgType === 'FINISHED') {\n" +
  "        console.log(chalkify(data.message));" +
  "        process.exit(data.exitCode);\n" +
  "      } else if (msgType === 'CHALK') {\n" +
  "        console.log(chalkify(data));\n" +
  "      }\n" +
  "    });\n" +
  "})(module.exports, require('chalk'));\n";
