/* Implementation from: https://raw.githubusercontent.com/maxsnew/IO/master/elm-io.sh */
module.exports =
  "(function(){\n" +
  "    window = {Date: Date};\n" +
  "    var stdin = process.stdin;\n" +
  "    var fs    = require('fs');\n" +
  "    var worker = Elm.worker(Elm.Main, {responses: null });\n" +
  "    var just = function(v) {\n" +
  "        return { 'Just': v};\n" +
  "    }\n" +
  "    var handle = function(request) {\n" +
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
  "    \n" +
  "    // Read\n" +
  "    stdin.on('data', function(chunk) {\n" +
  "        stdin.pause();\n" +
  "        worker.ports.responses.send(just(chunk.toString()));\n" +
  "    })\n" +
  "\n" +
  "    // Start msg\n" +
  "    worker.ports.responses.send(null);\n" +
  "})();\n";
