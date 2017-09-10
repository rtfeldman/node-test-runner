//@flow

const net = require("net"),
  Socket = require("./socket.js"),
  client = net.createConnection(Socket.filename);

client.setEncoding("utf8");
client.setNoDelay(true);

let app = null;

function send(data) {
  if (app === null) {
    console.error("Worker tried to send data before initialized: ", data);
    process.exit(1);
  } else {
    app.ports.receive.send(data);
  }
}

function sendTest(index) {
  send({ type: "TEST", index: index });
}

client.on("error", function(error) {
  console.error(error);
  client.end();
  process.exit(1);
});

client.on("data", function(raw) {
  const data = JSON.parse(raw);

  switch (data.type) {
    case "LOAD":
      const dest = data.dest,
        index = data.index,
        report = data.report,
        fuzz = data.fuzz,
        seed = data.seed,
        paths = data.paths,
        runs = data.runs,
        processes = data.processes,
        Elm = require(dest);

      // Make sure necessary things are defined.
      if (typeof Elm === "undefined") {
        throw "test runner config error: Elm is not defined. Make sure you provide a file compiled by Elm!";
      }

      const potentialModuleNames = Object.keys(Elm.Test.Generated);

      if (potentialModuleNames.length !== 1) {
        console.error(
          "Multiple potential generated modules to run in the Elm.Test.Generated namespace: ",
          potentialModuleNames,
          " - this should never happen!"
        );
        process.exit(1);
      }

      const testModule = Elm.Test.Generated[potentialModuleNames[0]];

      // Run the Elm app.
      app = testModule.worker({
        seed: seed,
        fuzz: fuzz,
        seed: seed,
        report: report,
        paths: paths,
        runs: runs,
        processes: processes,
        firstTestToRun: index
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

      sendTest(index);

      break;

    default:
      send(data);
  }
});
