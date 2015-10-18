/* Implementation from: https://raw.githubusercontent.com/laszlopandy/elm-console/1.0.2/elm-io.sh */
module.exports =
  "(function(){\n" +
  "    window = {Date: Date};\n" +
  "    var stdin = process.stdin;\n" +
  "    var fs    = require('fs');\n" +
  "    if (typeof Elm === \"undefined\") { throw \"elm-io config error: Elm is not defined. Make sure you call elm-io with a real Elm output file\"}\n" +
  "    if (typeof Elm.Main === \"undefined\" ) { throw \"Elm.Main is not defined, make sure your module is named Main.\" };\n" +
  "    var worker = Elm.worker(Elm.Main\n" +
  "                            , {responses: null }\n" +
  "                           );\n" +
  "    var just = function(v) {\n" +
  "        return { 'Just': v};\n" +
  "    }\n" +
  "    var handle = function(request) {\n" +
  "        \n" +
  "        switch(request.ctor) {\n" +
  "        case 'Put':\n" +
  "            process.stdout.write(request.val);\n" +
  "            break;\n" +
  "        case 'Get':\n" +
  "            stdin.resume();\n" +
  "            break;\n" +
  "        case 'Exit':\n" +
  "            process.exit(request.val);\n" +
  "            break;\n" +
  "        case 'WriteFile':\n" +
  "            fs.writeFileSync(request.file, request.content);\n" +
  "            break;\n" +
  "        }\n" +
  "    }\n" +
  "    var handler = function(reqs) {\n" +
  "        for (var i = 0; i < reqs.length; i++) {\n" +
  "            handle(reqs[i]);\n" +
  "        }\n" +
  "        if (reqs.length > 0 && reqs[reqs.length - 1].ctor !== 'Get') {\n" +
  "            worker.ports.responses.send(just(\"\"));\n" +
  "        }\n" +
  "    }\n" +
  "    worker.ports.requests.subscribe(handler);\n" +
  "    stdin.on('data', function(chunk) {\n" +
  "        stdin.pause();\n" +
  "        worker.ports.responses.send(just(chunk.toString()));\n" +
  "    });\n" +
  "    worker.ports.responses.send(null);\n" +
  "})();\n";
