//@flow

const net = require("net"),
  fs = require("fs-extra"),
  path = require("path"),
  chalk = require("chalk"), // Chalk is used only for the "Watching for changes..." message
  XmlBuilder = require("xmlbuilder"),
  Compile = require("./compile.js"),
  _ = require("lodash"),
  child_process = require("child_process"),
  workerPath = path.join(__dirname, "worker.js"),
  Socket = require("./socket.js");

function start(
  filePathArgs /*: Array<string> */,
  fuzz /*: ?number */,
  runs /*: ?number */,
  supportsColor /*: boolean */,
  initialSeed /*:?number*/,
  report /*:string*/,
  processes /*:number*/,
  watch /*:boolean*/,
  isMachineReadable /*:boolean*/
) {
  let nextResultToPrint = null,
    runningWorkers = 0,
    closedWorkers = 0,
    failures = 0,
    testsToRun = -1,
    started = false,
    lastWorkerIndex = -1,
    pendingException = false;
  const results = new Map(),
    todos = [],
    workerProcesses = [],
    workerSockets = [],
    startingTime = Date.now();

  function sendTest(socket) {
    socket.write(
      JSON.stringify({
        type: "LOAD",
        fuzz: fuzz,
        paths: filePathArgs,
        runs: runs,
        processes: processes,
        dest: Compile.dest,
        seed: initialSeed,
        report: serializeReport(report, supportsColor),
        index: lastWorkerIndex
      })
    );
    lastWorkerIndex++;
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

    _.each(response.results, function(result, index) {
      results.set(parseInt(index), result);

      switch (report) {
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

  function flushResults() {
    // Only print any results if we're ready - that is, nextResultToPrint
    // is no longer null. (BEGIN changes it from null to 0.)
    if (nextResultToPrint !== null) {
      let result = results.get(nextResultToPrint);

      while (
        // If there are no more results to print, then we're done.
        nextResultToPrint < testsToRun &&
        // Otherwise, keep going until we have no result available to print.
        typeof result !== "undefined"
      ) {
        printResult(report, result);
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

  function initWorker(socket) {
    runningWorkers++;

    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    workerSockets.push(socket);

    // TODO give each worker a separate socket. Otherwise, they can send
    // on top of each other and garble the json!
    socket.on("data", function(data) {
      let responses;

      try {
        // See the long note near client.write() in worker.js for why we do this.
        // It fixes a nasty bug!
        const withoutTrailingComma = data.substring(0, data.length - 1);

        responses = JSON.parse("[" + withoutTrailingComma + "]");
      } catch (err) {
        throw "Error parsing JSON data: " + data;
      }

      responses.forEach(function(response) {
        switch (response.type) {
          case "FINISHED":
            handleResults(response);

            // This worker found no tests remaining to run; it's finished!
            runningWorkers--;

            // If all the workers have finished, print the summmary.
            if (runningWorkers === 0) {
              socket.write(
                JSON.stringify({
                  type: "SUMMARY",
                  duration: Date.now() - startingTime,
                  failures: failures,
                  todos: todos
                })
              );
            }
            break;
          case "SUMMARY":
            flushResults();

            printResult(report, response.message);

            if (report === "junit") {
              const xml = response.message;
              const values = Array.from(results);

              xml.testsuite.testcase = xml.testsuite.testcase.concat(values);

              process.stdout.write(XmlBuilder.create(xml).end() + "\n");
            }

            if (watch) {
              // Close all the workers.
              workerProcesses.forEach(function(worker) {
                worker.kill();
              });
            } else {
              // Don't bother closing workers, because we're exiting immediately.
              process.exit(response.exitCode);
            }
            break;
          case "BEGIN":
            testsToRun = response.testCount;

            printResult(report, response.message);

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
            throw new Error("Unrecognized message from worker: " + response);
        }
      });
    });
  }

  const server = net.createServer(initWorker);

  server.on("error", function(err) {
    console.error(err.stack);
    server.close();
  });

  function initProcess(index) {
    const worker = child_process.fork(workerPath);

    worker.on("close", function(code, signal) {
      // code can be null.
      const hasNonZeroExitCode = typeof code === "number" && code !== 0;

      if (watch && !isMachineReadable) {
        if (hasNonZeroExitCode) {
          // Queue up complaining about an exception.
          // Don't print it immediately, or else it might print N times
          // where N is the number of cores.
          pendingException = true;
        }
        closedWorkers++;
        // If all the workerProcesses have closed, we're done! Continue watching.
        if (closedWorkers === workerProcesses.length) {
          if (pendingException) {
            // If we had an exception pending, print it and clear pending flag.
            reportRuntimeException();
            pendingException = false;
          }
          process.stdout.write(chalk.blue("Watching for changes...\n"));
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

        switch (report) {
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
              todos.push({
                labels: result.labels,
                todo: result.failures[0]
              });
            }
            break;
        }
      });

      flushResults();
    }

    workerProcesses.push(worker);
  }

  return new Promise(function(resolve, reject) {
    server.on("listening", function() {
      _.range(0, processes).forEach(initProcess);

      resolve(function() {
        started = true;

        workerSockets.forEach(sendTest);
      });
    });

    fs.remove(Socket.filename, function(error) {
      if (error) reject(error);

      server.listen(Socket.filename);
    });
  });
}

const logToConsole =
  process.platform === "win32"
    ? (function() {
        // Fix Windows Unicode problems. Credit to https://github.com/sindresorhus/figures for the Windows compat idea!
        const windowsSubstitutions = [
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

        return function(text) {
          process.stdout.write(windowsify(text + "\n"));
        };
      })()
    : function(text) {
        process.stdout.write(text + "\n");
      };

function printResult(format, result) {
  if (format === "console") {
    // todos are objects, and will be shown in the SUMMARY only.
    // passed tests are nulls, and should not be printed.
    // failed tests are strings.
    if (typeof result === "string") {
      logToConsole(result);
    }
  } else if (format === "json") {
    process.stdout.write(JSON.stringify(result) + "\n");
  }
  // JUnit does everything at once in SUMMARY, elsewhere
}

function serializeReport(report, supportsColor) {
  switch (report) {
    case "json":
      return "json";
    case "junit":
      return "junit";
    default:
      if (supportsColor) {
        return "console-color";
      } else {
        return "console-monochrome";
      }
  }
}

module.exports = { start: start };
