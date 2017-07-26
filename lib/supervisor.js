// @flow

var chalk = require("chalk"), // Chalk is used only for the "Watching for changes..." message
  XmlBuilder = require("xmlbuilder"),
  _ = require("lodash"),
  child_process = require("child_process");

function run(
  elmTestVersion /*:string*/,
  format /*:string*/,
  processes /*:number*/,
  dest /*:string*/,
  watch /*:boolean*/,
  isMachineReadable /*:boolean*/
) {
  var nextResultToPrint = null;
  var finishedWorkers = 0;
  var closedWorkers = 0;
  var results = new Map();
  var failures = 0;
  var todos = [];
  var testsToRun = -1;
  var startingTime = Date.now();

  function printResult(result) {
    if (format === "console") {
      // todos are objects, and will be shown in the SUMMARY only.
      // passed tests are nulls, and should not be printed.
      // failed tests are strings.
      if (typeof result === "string") {
        console.log(makeWindowsSafe(result));
      }
    } else if (format === "json") {
      console.log(JSON.stringify(result));
    }
    // JUnit does everything at once in SUMMARY, elsewhere
  }

  function flushResults() {
    // Only print any results if we're ready - that is, nextResultToPrint
    // is no longer null. (BEGIN changes it from null to 0.)
    if (nextResultToPrint !== null) {
      var result = results.get(nextResultToPrint);

      while (
        // If there are no more results to print, then we're done.
        nextResultToPrint < testsToRun &&
        // Otherwise, keep going until we have no result available to print.
        typeof result !== "undefined"
      ) {
        printResult(result);
        nextResultToPrint++;
        result = results.get(nextResultToPrint);
      }
    }
  }
  function reportRuntimeException() {
    console.error(
      chalk.red(
        "\n\nThere was an unexpected runtime exception while running tests\n\n"
      )
    );
  }

  var pendingException = false;

  var workers = _.range(0, processes).map(function(index) {
    var worker = child_process.fork(dest);

    worker.on("close", function(code, signal) {
      // code can be null.
      var hasNonZeroExitCode = typeof code === "number" && code !== 0;

      if (watch && !isMachineReadable) {
        if (hasNonZeroExitCode) {
          // Queue up complaining about an exception.
          // Don't print it immediately, or else it might print N times
          // where N is the number of cores.
          pendingException = true;
        }
        closedWorkers++;
        // If all the workers have closed, we're done! Continue watching.
        if (closedWorkers === workers.length) {
          if (pendingException) {
            // If we had an exception pending, print it and clear pending flag.
            reportRuntimeException();
            pendingException = false;
          }
          console.log(chalk.blue("Watching for changes..."));
        }
      } else if (hasNonZeroExitCode) {
        reportRuntimeException();
        process.exit(1);
      }
    });

    function handleResults(response) {
      // TODO print progress bar - e.g. "Running test 5 of 20" on a bar!
      // -- yikes, be careful though...test the scenario where test
      // authors put Debug.log in their tests - does that mess
      // everything up re: the line feed? Seems like it would...
      // ...so maybe a bar is not best. Can we do better? Hm.
      // Maybe the answer is to print the thing, then Immediately
      // backtrack the line feed, so that if someone else does more
      // logging, it will overwrite our status update and that's ok?

      _.each(response.results, function(result, index) {
        results.set(parseInt(index), result);

        switch (format) {
          case "console":
            if (result === null) {
              // It's a PASS; no need to take any action.
            } else if (typeof result.todo !== "undefined") {
              todos.push(result);
            } else {
              failures++;
            }
            break;
          case "junit":
            if (typeof result.failure !== "undefined") {
              failures++;
            }
            break;
          case "json":
            if (result.status === "fail") {
              failures++;
            } else if (result.status === "todo") {
              todos.push({ labels: result.labels, todo: result.failures[0] });
            }
            break;
        }
      });

      flushResults();
    }

    worker.on("message", function(data) {
      var response = JSON.parse(data);

      switch (response.type) {
        case "FINISHED":
          handleResults(response);

          // This worker found no tests remaining to run; it's finished!
          finishedWorkers++;

          // If all the workers have finished, print the summmary.
          if (finishedWorkers === workers.length) {
            worker.send({
              type: "SUMMARY",
              duration: Date.now() - startingTime,
              failures: failures,
              todos: todos
            });
          }
          break;
        case "SUMMARY":
          flushResults();

          printResult(response.message);

          if (format === "junit") {
            var xml = response.message;
            var values = Array.from(results);

            xml.testsuite.testcase = xml.testsuite.testcase.concat(values);

            console.log(XmlBuilder.create(xml).end());
          }

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
          var result = JSON.parse(data);

          testsToRun = result.testCount;

          if (!isMachineReadable) {
            var headline = "elm-test " + elmTestVersion;
            var bar = _.repeat("-", headline.length);

            console.log("\n" + headline + "\n" + bar + "\n");
          }

          printResult(result.message);

          // Now we're ready to print results!
          nextResultToPrint = 0;

          flushResults();

          break;
        case "RESULTS":
          handleResults(response);

          break;
        case "ERROR":
          throw new Error(response.message);
        default:
          throw new Error("Unrecognized message from worker:" + response.type);
      }
    });

    return worker;
  });

  // To avoid race conditions, don't have the workers start executing tests
  // until all processes are up and running.
  workers.forEach(function(worker, index) {
    worker.send({ type: "TEST", index: index - 1 });
  });
}

function makeWindowsSafe(text) {
  return process.platform === "win32" ? windowsify(text) : text;
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
  return windowsSubstitutions.reduce(function(result /*:string*/, sub) {
    return result.replace(sub[0], sub[1]);
  }, str);
}

module.exports = { run: run };
