// var msgType = msg[0];
// var data = msg[1];
//
// if (msgType === "FINISHED") {
//   if (data.format === "CHALK") {
//     console.log(chalkify(data.message));
//   } else if (data.format === "JUNIT") {
//     console.log(builder.create(data.message).end());
//   } else {
//     console.log(JSON.stringify(data.message));
//   }
//
//   if (!args.watch) {
//     process.exit(data.exitCode);
//   }
// } else if (msgType === "STARTED" || msgType === "TEST_COMPLETED") {
//   if (data.format === "CHALK") {
//     console.log(chalkify(data.message));
//   } else if (data.format === "JSON") {
//     console.log(JSON.stringify(data.message));
//   }
// }

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

// Fix Windows Unicode problems. Credit to https://github.com/sindresorhus/figures for the Windows compat idea!
var windowsSubstitutions = [
  [/[↓✗►]/g, ">"],
  [/╵│╷╹┃╻/g, "|"],
  [/═/g, "="],
  ,
  [/▔/g, "-"],
  [/✔/g, "√"]
];

function windowsify(str) {
  return windowsSubstitutions.reduce(function(result, sub) {
    return result.replace(sub[0], sub[1]);
  }, str);
}

function chalkify(messages) {
  return messages
    .map(function(msg) {
      var path = msg.styles;
      var text = process.platform === "win32" ? windowsify(msg.text) : msg.text;

      if (path.length === 0) {
        return text;
      } else {
        var fn = chalk;

        path.forEach(function(nextPath) {
          fn = fn[nextPath];
        });

        return fn(text);
      }
    })
    .join("");
}

// Run the Elm app.
var app = testModule.worker({ seed: initialSeed, report: report });

// Use ports for inter-process communication.
app.ports.send.subscribe(function(msg) {
  process.send(msg);
});

process.on("message", function(msg) {
  app.ports.receive.send(msg);
});
