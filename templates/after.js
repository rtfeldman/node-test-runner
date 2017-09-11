// Make sure necessary things are defined.
if (typeof Elm === "undefined") {
  throw "test runner config error: Elm is not defined. Make sure you provide a file compiled by Elm!";
}

var potentialModuleNames = Object.keys(Elm.Test.Generated);

if (potentialModuleNames.length !== 1) {
  console.error(
    "Multiple potential generated modules to run in the Elm.Test.Generated namespace: ",
    potentialModuleNames,
    " - this should never happen!"
  );
  process.exit(1);
}

var net = require("net"),
  client = net.createConnection(pipeFilename);

client.on("error", function(error) {
  console.error(error);
  client.end();
  process.exit(1);
});

client.setEncoding("utf8");
client.setNoDelay(true);

var testModule = Elm.Test.Generated[potentialModuleNames[0]];

// Run the Elm app.
var app = testModule.worker({ seed: initialSeed, report: report });

client.on("data", function(msg) {
  app.ports.receive.send(JSON.parse(msg));
});

// Use ports for inter-process communication.
app.ports.send.subscribe(function(msg) {
  // We do this in order to prevent a bug where two back-to-back-json
  // messages get passed, resulting in the supervisor trying to parse
  // "{ ...json object 1... }{ ...json object 2... }" which won't parse.
  // By appending a comma, and having the supervisor strip the
  // trailing comma and wrap the whole thing in [], the above becomes
  // the valid JSON string "[{ ...json object 1... },{ ...json object 2... }]"
  // and all is well!
  client.write(msg + ",");
});
