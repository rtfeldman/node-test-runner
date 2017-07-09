// @flow

var chalk = require("chalk"),
  XmlBuilder = require("xmlbuilder"),
  _ = require("lodash"),
  child_process = require("child_process");

function run(
  format /*:string*/,
  processes /*:number*/,
  dest /*:string*/,
  watch /*:boolean*/,
  isMachineReadable /*:boolean*/
) {
  var nextResultToPrint = null;
  var finishedWorkers = 0;
  var closedWorkers = 0;
  var results = {};
  var failures = 0;
  var todos = [];
  var testsToRun = -1;
  var startingTime = Date.now();

  function printResult(result) {
    if (format === "CHALK") {
      // todos are objects, and will be shown in the SUMMARY only.
      // passed tests are nulls, and should not be printed.
      // failed tests are arrays of chalk data.
      if (result instanceof Array) {
        console.log(chalkify(result));
      }
    } else if (format === "JSON") {
      console.log(JSON.stringify(result));
    }
    // JUnit does everything at once in SUMMARY, elsewhere
  }

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

  var workers = _.range(0, processes).map(function(index) {
    var worker = child_process.fork(dest);

    if (watch && !isMachineReadable) {
      worker.on("close", function(code, signal) {
        closedWorkers++;

        // If all the workers have closed, we're done! Continue watching.
        if (closedWorkers === workers.length) {
          console.log(chalk.blue("Watching for changes..."));
        }
      });
    }

    function handleResults(response) {
      // TODO print progress bar - e.g. "Running test 5 of 20" on a bar!
      // -- yikes, be careful though...test the scenario where test
      // authors put Debug.log in their tests - does that mess
      // everything up re: the line feed? Seems like it would...
      // ...so maybe a bar is not best. Can we do better? Hm.
      // Maybe the answer is to print the thing, then Immediately
      // backtrack the line feed, so that if someone else does more
      // logging, it will overwrite our status update and that's ok?

      Object.assign(results, response.results);

      _.each(response.results, function(result, index) {
        if (result === null) {
          // It's a PASS; no need to take any action.
        } else if (typeof result.todo !== "undefined") {
          todos.push(result);
        } else {
          failures++;
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

          if (format === "JUNIT") {
            var xml = response.message;

            xml.testsuite.testcase = xml.testsuite.testcase.concat(
              _.values(results)
            );
            // TODO on BEGIN, print <testsuite><testcase>, then print failures
            // to stdout as they arrive, then print <testcase></testsuite>.

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

    worker.send({ type: "TEST", index: index - 1 });

    return worker;
  });
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
