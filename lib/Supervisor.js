const { Worker } = require('worker_threads');
const Report = require('./Report');
const XMLBuilder = require('./XMLBuilder');

/**
 * @param { string } elmTestVersion
 * @param { import('./Report').Report } report
 * @param { number } processes
 * @param { string } dest
 * @returns { Promise<number> }
 */
function run(elmTestVersion, report, processes, dest) {
  return new Promise(function (resolve) {
    /** @type { number | null } */
    var nextResultToPrint = null;
    var finishedWorkers = 0;
    var results = new Map();
    var failures = 0;
    /** @type { Array<{ labels: Array<string>, todo: string }> } */
    var todos = [];
    var testsToRun = -1;
    var startingTime = Date.now();

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
                  // passed tests should be printed only if they contain distributionReport
                  if (result.distributionReport !== undefined) {
                    console.log(makeWindowsSafe(result.distributionReport));
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

    function flushResults() {
      // Only print any results if we're ready - that is, nextResultToPrint
      // is no longer null. (BEGIN changes it from null to 0.)
      if (nextResultToPrint !== null) {
        var result = results.get(nextResultToPrint);

        while (
          // If there are no more results to print, then we're done.
          nextResultToPrint < testsToRun &&
          // Otherwise, keep going until we have no result available to print.
          typeof result !== 'undefined'
        ) {
          printResult(result);
          nextResultToPrint++;
          result = results.get(nextResultToPrint);
        }
      }
    }

    /**
     * @param { any } response This `any` became explicit instead of implicit when migrating from Flow to TypeScript.
     * @returns { void }
     */
    function handleResults(response) {
      // TODO print progress bar - e.g. "Running test 5 of 20" on a bar!
      // -- yikes, be careful though...test the scenario where test
      // authors put Debug.log in their tests - does that mess
      // everything up re: the line feed? Seems like it would...
      // ...so maybe a bar is not best. Can we do better? Hm.
      // Maybe the answer is to print the thing, then Immediately
      // backtrack the line feed, so that if someone else does more
      // logging, it will overwrite our status update and that's ok?

      Object.keys(response.results).forEach(function (index) {
        var result = response.results[index];
        results.set(parseInt(index), result);

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
      });

      flushResults();
    }

    /** @type { Array<import('worker_threads').Worker> } */
    var workers = Array.from({ length: processes }, (_, index) => {
      var worker = new Worker(dest, { workerData: index });

      worker.on('message', function (response) {
        switch (response.type) {
          case 'FINISHED':
            handleResults(response);

            // This worker found no tests remaining to run; it's finished!
            finishedWorkers++;

            // If all the workers have finished, print the summary.
            if (finishedWorkers === workers.length) {
              worker.postMessage({
                type: 'SUMMARY',
                duration: Date.now() - startingTime,
                failures: failures,
                todos: todos,
              });
            }
            break;
          case 'SUMMARY':
            flushResults();

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
            }

            // Close all the workers.
            workers.forEach(function (worker) {
              worker.terminate();
            });
            resolve(response.exitCode);
            break;
          case 'BEGIN':
            testsToRun = response.testCount;

            if (!Report.isMachineReadable(report)) {
              var headline = 'elm-test ' + elmTestVersion;
              var bar = '-'.repeat(headline.length);

              console.log('\n' + headline + '\n' + bar + '\n');
            }

            printResult(response.message);

            // Now we're ready to print results!
            nextResultToPrint = 0;

            flushResults();

            break;
          case 'RESULTS':
            handleResults(response);

            break;
          case 'ERROR':
            throw new Error(response.message);
          default:
            throw new Error(
              'Unrecognized message from worker:' + response.type
            );
        }
      });

      return worker;
    });
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

module.exports = { run: run };
