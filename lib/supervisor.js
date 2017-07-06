// @flow

var os = require("os"),
  chalk = require("chalk"),
  builder = require("xmlbuilder"),
  child_process = require("child_process");

function run(
  dest /*:string*/,
  watch /*:boolean*/,
  isMachineReadable /*:boolean*/
) {
  var cpus = os.cpus() || new Array(1);

  var nextTestToRun = -1;
  var nextResultToPrint = null;
  var finishedWorkers = 0;
  var closedWorkers = 0;
  var results = [];
  var summaries = [];
  var testsToRun = -1; // TODO: record this number from BEGIN

  function flushResults() {
    // Only print any results if we're ready - that is, nextResultToPrint
    // is no longer null. (BEGIN changes it from null to 0.)
    if (nextResultToPrint !== null) {
      var result = results[nextResultToPrint];

      while (
        // If there are no more results to print, then we're done.
        nextResultToPrint < testsToRun &&
        // Otherwise, keep going until we have no result available to print.
        typeof result !== "undefined"
      ) {
        printResult(result);
        nextResultToPrint++;
        result = results[nextResultToPrint];
      }
    }
  }

  var workers = cpus.map(function(throwaway, index) {
    var worker = child_process.fork(dest);
    var currentlyRunningIndex = nextTestToRun;

    function runNextTest() {
      currentlyRunningIndex = nextTestToRun;

      nextTestToRun++;

      // Immediately run the next test.
      if (currentlyRunningIndex === -1) {
        // The BEGIN message requests metadata about the test run, e.g.
        // how many tests will be run, whether they should auto-fail because
        // of skip/on/y/todo, etc.
        worker.send({ type: "BEGIN" });
      } else {
        // Send the index of the test to run.
        worker.send({ type: "TEST", index: currentlyRunningIndex });
      }
    }

    if (watch && !isMachineReadable) {
      worker.on("close", function(code, signal) {
        closedWorkers++;

        // If all the workers have closed, we're done! Continue watching.
        if (closedWorkers === workers.length) {
          console.log(chalk.blue("Watching for changes..."));
        }
      });
    }

    worker.on("message", function(data) {
      var response = JSON.parse(data);

      switch (response.type) {
        case "FINISHED":
          // This worker found no tests remaining to run; it's finished!
          finishedWorkers++;

          // If all the workers have finished, print the summmary.
          if (finishedWorkers === workers.length) {
            worker.send({ type: "SUMMARY", testResults: summaries });
          }
          break;
        case "SUMMARY":
          flushResults();

          printResult(response);

          if (watch) {
            // Close all the workers.
            workers.forEach(function(worker) {
              worker.kill();
            });
          } else {
            // Don't bother closing workers, because we're exiting immediately.
            process.exit(response.exitCode);
          }
          break;
        case "BEGIN":
          // TODO record all the relevant values, and display the "hey we're
          // starting up here" thing to the user.
          var result = JSON.parse(data);

          testsToRun = result.testCount;

          printResult(result);

          // Now we're ready to print results!
          nextResultToPrint = 0;
          flushResults();

          runNextTest();

          break;
        case "TEST_COMPLETED":
          // TODO print progress bar - e.g. "Running test 5 of 20" on a bar!
          // -- yikes, be careful though...test the scenario where test
          // authors put Debug.log in their tests - does that mess
          // everything up re: the line feed? Seems like it would...
          // ...so maybe a bar is not best. Can we do better? Hm.
          // Maybe the answer is to print the thing, then Immediately
          // backtrack the line feed, so that if someone else does more
          // logging, it will overwrite our status update and that's ok?

          results[currentlyRunningIndex] = response;
          summaries.push(response.summary);

          flushResults();

          runNextTest();
          break;
        case "ERROR":
          throw new Error(response.message);
        default:
          throw new Error("Unrecognized message from worker:" + response.type);
      }
    });

    runNextTest();

    return worker;
  });
}

function printResult(data) {
  if (data.type === "ERROR") {
    throw new Error(data.message);
  } else if (
    data.type === "TEST_COMPLETED" ||
    data.type === "SUMMARY" ||
    data.type === "BEGIN"
  ) {
    if (data.format === "CHALK") {
      if (data.message !== null) {
        console.log(chalkify(data.message));
      }
    } else if (data.format === "JUNIT") {
      if (data.type === "SUMMARY") {
        console.log(builder.create(data.message).end());
      }
    } else if (data.format === "JSON") {
      console.log(JSON.stringify(data.message));
    } else {
      console.error("Unrecognized data format:", data.format);
      console.error("Full message:", data);
    }
  } else {
    console.error("Unrecognized data type:", data.type);
    console.error("Full message:", data);
  }
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

module.exports = { run: run };
