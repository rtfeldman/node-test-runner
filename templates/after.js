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

var testModule = Elm.Test.Generated[potentialModuleNames[0]];

// Run the Elm app.
var app = testModule.worker({ seed: initialSeed, report: report });

// Use ports for inter-process communication.
app.ports.send.subscribe(function(msg) {
  process.send(msg);
});

process.on("message", function(msg) {
  app.ports.receive.send(msg);
});
