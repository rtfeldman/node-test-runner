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
var app = testModule.init({flags: Date.now()});

client.on("data", function(msg) {
  app.ports.receive.send(JSON.parse(msg));
});

// Use ports for inter-process communication.
app.ports.send.subscribe(function(msg) {
  // We split incoming messages on the socket on newlines. The gist is that node
  // is rather unpredictable in whether or not a single `write` will result in a
  // single `on('data')` callback. Sometimes it does, sometimes multiple writes
  // result in a single callback and - worst of all - sometimes a single read
  // results in multiple callbacks, each receiving a piece of the data. The
  // horror.
  client.write(msg + "\n");
});
