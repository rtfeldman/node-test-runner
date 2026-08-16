const chalk = require('./chalk');
const child_process = require('child_process');
const fs = require('fs');
const net = require('net');
const readline = require('readline');
const Generate = require('./Generate');
const Report = require('./Report');
const XMLBuilder = require('./XMLBuilder');

/**
 * @param { string } elmTestVersion
 * @param { Record<string, string> } hashes
 * @param { import('./Generate').Module } previousRunModule
 * @param { string } pipeFilename
 * @param { number } fuzz
 * @param { import('./Report').Report } report
 * @param { number } processes
 * @param { boolean } unbufferedLogs
 * @param { string } dest
 * @param { boolean } watch
 * @returns { Promise<number> }
 */
function run(
  elmTestVersion,
  hashes,
  previousRunModule,
  pipeFilename,
  fuzz,
  report,
  processes,
  unbufferedLogs,
  dest,
  watch
) {
  return new Promise(function (resolve) {
    /** @type { Array<number> | undefined } */
    var unitTests = undefined;
    /** @type { Array<number> | undefined } */
    var fuzzTests = undefined;
    var nextUnitTest = 0;
    var nextFuzzTest = 0;
    var finishedUnitTests = 0;
    var finishedFuzzTests = 0;
    var closedWorkers = 0;
    var results = new Map();
    var failures = 0;
    /** @type { Array<{ labels: Array<string>, todo: string }> } */
    var todos = [];
    var startingTime = Date.now();
    /** @type { Array<import('child_process').ChildProcess> } */
    var workers = [];
    /** @type { import('net').Server | undefined } */
    var server = undefined;
    /** @type { import('./Generate').PreviousRun } */
    var toBePreviousRun = {
      fuzzRuns: fuzz,
      // When running with a random seed, Node.elm might decide to use
      // the same seed as the last run to reproduce a failure.
      // This is replaced with the real value at BEGIN.
      initialSeed: -1,
      cachedTests: {},
    };
    for (var key in hashes) {
      toBePreviousRun.cachedTests[key] = {
        hash: hashes[key],
        // We don’t know if exposed items are tests or not until runtime.
        isActuallyTest: false,
        unitTests: [],
        fuzzTests: [],
      };
    }

    /**
     * @param { number } exitCode
     * @returns { void }
     */
    function end(exitCode) {
      if (server) {
        server.close();
      }
      resolve(exitCode);
    }

    /**
     * @param { any } result This `any` became explicit instead of implicit when migrating from Flow to TypeScript.
     * @returns { void }
     */
    function printResult(result) {
      switch (report) {
        case 'console':
          switch (result.type) {
            case 'begin':
              console.log(makeWindowsSafe(result.output));
              break;
            case 'complete':
              switch (result.status) {
                case 'pass':
                  // passed tests should be printed only if they contain debug logs or a distributionReport
                  if (result.message !== undefined) {
                    console.log(makeWindowsSafe(result.message));
                  }
                  break;
                case 'todo':
                  // todos will be shown in the SUMMARY only.
                  break;
                case 'fail':
                  console.log(makeWindowsSafe(result.failure));
                  break;
                default:
                  throw new Error(`Unexpected result.status: ${result.status}`);
              }
              break;
            case 'summary':
              console.log(makeWindowsSafe(result.summary));
              break;
            default:
              throw new Error(`Unexpected result.type: ${result.type}`);
          }
          break;

        case 'json':
          console.log(JSON.stringify(result));
          break;

        case 'junit':
          // JUnit does everything at once in SUMMARY, elsewhere
          break;
      }
    }

    function reportRuntimeException() {
      console.error(
        chalk.red(
          '\n\nThere was an unexpected runtime exception while running tests\n\n'
        )
      );
    }

    /**
     * @param { number } testId
     * @param { any } result This `any` became explicit instead of implicit when migrating from Flow to TypeScript.
     * @returns { void }
     */
    function handleResult(testId, result) {
      // TODO print progress bar - e.g. "Running test 5 of 20" on a bar!
      // -- yikes, be careful though...test the scenario where test
      // authors put Debug.log in their tests - does that mess
      // everything up re: the line feed? Seems like it would...
      // ...so maybe a bar is not best. Can we do better? Hm.
      // Maybe the answer is to print the thing, then Immediately
      // backtrack the line feed, so that if someone else does more
      // logging, it will overwrite our status update and that's ok?

      if (report === 'junit') {
        results.set(testId, result);
      }

      switch (report) {
        case 'console':
          switch (result.status) {
            case 'pass':
              // It's a PASS; no need to take any action.
              break;
            case 'todo':
              todos.push(result);
              break;
            case 'fail':
              failures++;
              break;
            default:
              throw new Error(`Unexpected result.status: ${result.status}`);
          }
          break;
        case 'junit':
          if (typeof result.failure !== 'undefined') {
            failures++;
          }
          break;
        case 'json':
          if (result.status === 'fail') {
            failures++;
          } else if (result.status === 'todo') {
            todos.push({ labels: result.labels, todo: result.failures[0] });
          }
          break;
      }
    }

    /**
     * @param { import('net').Socket } socket
     * @returns { void }
     */
    function initWorker(socket) {
      if (fuzzTests === undefined) {
        throw new Error(
          `fuzzTests is undefined, even though we have started workers for fuzz tests!`
        );
      }

      // Other workers might have exhausted all fuzz tests before this one even got a chance to start.
      if (nextFuzzTest >= fuzzTests.length) {
        return;
      }

      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      // See the long note near client.write() in worker.js for why we do this.
      // It fixes a nasty bug!
      // https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
      var stream = readline.createInterface({
        input: socket,
        crlfDelay: Infinity,
      });

      /** @type { SendToWorker } */
      const send = (message) => {
        socket.write(JSON.stringify(message));
      };

      stream.on('line', function (data) {
        handleResponse(JSON.parse(data), send);
      });

      send({
        type: 'FUZZ',
        testId: fuzzTests[nextFuzzTest++],
      });
    }

    /**
     * @typedef {
        | {
          type: 'BEGIN',
          initialSeed: number,
          debugLogs: Array<string>,
          message?: any,
        }
        | {
          type: 'READY',
          unitTests: Array<number>,
          fuzzTests: Array<number>,
        }
        | {
          type: 'RESULT',
          testId: number,
          testType: 'unit' | 'fuzz',
          jsDefinitionName: string,
          labels: Array<string>,
          expectationElmCode: string | null,
          debugLogs: Array<string>,
          message: any,
        }
        | {
          type: 'SUMMARY',
          exitCode: number,
          message: any,
        }
        | {
          type: 'ERROR',
          message: string,
        }
      } FromWorkerMessage - Needs to be in sync with Ports.elm.
     *
     * @typedef { (message: ToWorkerMessage) => void } SendToWorker
     * @typedef {
        | {
          type: 'UNIT',
          testId: number,
        }
        | {
          type: 'FUZZ',
          testId: number,
        }
        | {
          type: 'SUMMARY',
          duration: number,
          failures: number,
          todos: Array<{ labels: Array<string>, todo: string }>,
        }
      } ToWorkerMessage - Needs to be in sync with Ports.elm.
     *
     * @param { FromWorkerMessage } response
     * @param { SendToWorker } send
     * @returns { void }
     */
    function handleResponse(response, send) {
      switch (response.type) {
        case 'SUMMARY':
          if (response.exitCode === 1) {
            // The tests could not even run. At the time of this writing, the
            // only case is “No exposed values of type Test found”. That
            // _could_ have been caught at compile time, but the current
            // architecture needs to actually run the JS to figure out which
            // exposed values are of type Test. That’s why this type of
            // response is handled differently than others.
            console.error(response.message);
          } else {
            printResult(response.message);

            if (report === 'junit') {
              var xml = response.message;
              var values = Array.from(results.values());
              xml.testsuite.testcase = xml.testsuite.testcase.concat(values);
              console.log(XMLBuilder.toString(xml));
            }

            Generate.generatePreviousRunModule(
              previousRunModule,
              toBePreviousRun
            );
          }

          // Close all the workers.
          workers.forEach(function (worker) {
            worker.kill();
          });
          end(response.exitCode);
          break;

        case 'BEGIN':
          // Store the seed actually chosen to be used in the end.
          toBePreviousRun.initialSeed = response.initialSeed;

          if (!Report.isMachineReadable(report)) {
            var headline = 'elm-test ' + elmTestVersion;
            var bar = '-'.repeat(headline.length);

            console.log('\n' + headline + '\n' + bar + '\n');
          }

          printResult(response.message);
          if (response.debugLogs.length > 0) {
            for (const debugLog of response.debugLogs) {
              console.error(debugLog);
            }
            if (report === 'console') {
              console.error('\n');
            }
          }
          break;

        case 'READY':
          unitTests = response.unitTests;
          fuzzTests = response.fuzzTests;

          if (unitTests.length === 0 && fuzzTests.length === 0) {
            sendToMainProcess({
              type: 'SUMMARY',
              duration: Date.now() - startingTime,
              failures: failures,
              todos: todos,
            });
          } else {
            // If running multi-threaded, run fuzz tests on threads.
            // Save one core for the main thread.
            if (fuzzTests.length > 0) {
              if (processes > 1) {
                startWorkers(Math.min(processes - 1, fuzzTests.length));
              } else if (unitTests.length === 0) {
                sendToMainProcess({
                  type: 'FUZZ',
                  testId: fuzzTests[nextFuzzTest++],
                });
              }
            }

            // Run unit tests in the main thread.
            if (unitTests.length > 0) {
              sendToMainProcess({
                type: 'UNIT',
                testId: unitTests[nextUnitTest++],
              });
            }
          }
          break;

        case 'RESULT': {
          handleResult(response.testId, response.message);
          printResult(response.message);
          if (response.debugLogs.length > 0 && !unbufferedLogs) {
            if (report !== 'console') {
              console.error(response.labels.slice().reverse().join(' > '));
            }
            for (const debugLog of response.debugLogs) {
              console.error(debugLog);
            }
            if (report === 'console') {
              console.error('\n');
            }
          }

          const cachedTests =
            toBePreviousRun.cachedTests[response.jsDefinitionName];
          cachedTests.isActuallyTest = true;
          const usedUnbufferedLogs =
            unbufferedLogs && response.debugLogs.length > 0;
          switch (response.testType) {
            case 'unit':
              finishedUnitTests++;
              if (response.expectationElmCode !== null && !usedUnbufferedLogs) {
                cachedTests.unitTests.push({
                  labels: response.labels,
                  expectation: response.expectationElmCode,
                  debugLogs: response.debugLogs,
                });
              }
              break;

            case 'fuzz':
              finishedFuzzTests++;
              if (response.expectationElmCode !== null && !usedUnbufferedLogs) {
                cachedTests.fuzzTests.push({
                  labels: response.labels,
                  expectation: response.expectationElmCode,
                  debugLogs: response.debugLogs,
                });
              }
              break;
          }

          if (unitTests === undefined || fuzzTests === undefined) {
            // Not READY yet.
            break;
          }

          if (
            finishedUnitTests >= unitTests.length &&
            finishedFuzzTests >= fuzzTests.length
          ) {
            sendToMainProcess({
              type: 'SUMMARY',
              duration: Date.now() - startingTime,
              failures: failures,
              todos: todos,
            });
          } else {
            switch (response.testType) {
              case 'unit':
                if (nextUnitTest < unitTests.length) {
                  send({
                    type: 'UNIT',
                    testId: unitTests[nextUnitTest++],
                  });
                } else if (processes === 1 && nextFuzzTest < fuzzTests.length) {
                  send({
                    type: 'FUZZ',
                    testId: fuzzTests[nextFuzzTest++],
                  });
                }
                break;

              case 'fuzz':
                if (nextFuzzTest < fuzzTests.length) {
                  send({
                    type: 'FUZZ',
                    testId: fuzzTests[nextFuzzTest++],
                  });
                }
                break;
            }
          }

          break;
        }

        case 'ERROR':
          throw new Error(response.message);

        default:
          throw new Error(
            'Unrecognized message from worker: ' +
              /** @type { { type: string } } */ (response).type
          );
      }
    }

    /** @type { SendToWorker } */
    var sendToMainProcess = require(dest).run(
      /* shouldSendBegin */ true,
      /** @type { (response: FromWorkerMessage) => void } */
      (response) => {
        handleResponse(response, sendToMainProcess);
      }
    );

    // Allow the generated file to be `require`d again (for watch mode).
    delete require.cache[dest];

    /**
     * @param { number } amount
     * @returns { void }
     */
    function startWorkers(amount) {
      var pendingException = false;

      // Using a named pipe to communicate is actually faster than
      // using `process.send` or `worker_threads`! See:
      // https://github.com/rtfeldman/node-test-runner/pull/674
      server = net.createServer(initWorker);

      server.on('error', function (err) {
        console.error(err.stack);
        if (server) {
          server.close();
        }
      });

      server.on('listening', function () {
        workers = Array.from({ length: amount }, () => {
          var worker = child_process.fork(dest);

          worker.on('close', function (code) {
            // code can be null.
            var hasNonZeroExitCode = typeof code === 'number' && code !== 0;

            if (watch && !Report.isMachineReadable(report)) {
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
                end(1);
              }
            } else if (hasNonZeroExitCode) {
              reportRuntimeException();
              end(1);
            }
          });

          return worker;
        });
      });

      if (fs.existsSync(pipeFilename) && process.platform !== 'win32') {
        // Never remove named pipes on Windows. The OS will clean them up when
        // nothing has a handle to them anymore.
        fs.unlinkSync(pipeFilename);
      }

      server.listen(pipeFilename);
    }
  });
}

/**
 * @param { string } text
 * @returns { string }
 */
function makeWindowsSafe(text) {
  return process.platform === 'win32' ? windowsify(text) : text;
}

/**
 * Fix Windows Unicode problems. Credit to https://github.com/sindresorhus/figures for the Windows compat idea!
 * @type { Array<[RegExp, string]> }
 */
var windowsSubstitutions = [
  [/[↓✗►]/g, '>'],
  [/╵│╷╹┃╻/g, '|'],
  [/═/g, '='],
  [/▔/g, '-'],
  [/✔/g, '√'],
];

/**
 * @param { string } str
 * @returns { string }
 */
function windowsify(str) {
  return windowsSubstitutions.reduce(function (result, sub) {
    return result.replace(sub[0], sub[1]);
  }, str);
}

module.exports = {
  run: run,
};
