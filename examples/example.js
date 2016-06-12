var Supervisor = require("elm-web-workers");
var path = require("path");
var elmPath = path.join(__dirname, "elm.js");

var supervisor = new Supervisor(elmPath, "Example");

supervisor.on("emit", function(msg) {
  console.log("[supervisor]:", msg);
});

supervisor.on("close", function(msg) {
  console.log("Closed with message:", msg);
});

supervisor.start();

supervisor.send({msgType: "dispatch"});
