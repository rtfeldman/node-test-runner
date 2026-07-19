'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { fixturesDir, spawnOpts } = require('./util');

const elmTestPath = path.join(__dirname, '..', 'bin', 'elm-test');

const packageInfo = require('../package.json');
const elmTestVersion = packageInfo.version;

// exit codes
const resultSuccess = 0;
const resultErrored = 1;
const resultFailureThreshold = 2;

/**
 * @param { Array<string> } args
 * @param { string } cwd
 * @returns { import('child_process').SpawnSyncReturns<string> }
 */
function execElmTest(args, cwd = '.') {
  return spawnSync(
    'node',
    [elmTestPath, ...args],
    Object.assign(
      /** @type { const } */ ({ encoding: 'utf-8', cwd }),
      spawnOpts
    )
  );
}

/**
 * @param { string } message
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { string }
 */
function getDetailedMessage(message, runResult) {
  return (
    message +
    '\n\n' +
    'STDOUT\n' +
    runResult.stdout +
    '\n\n' +
    'STDERR\n' +
    runResult.stderr
  );
}

/**
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { void }
 */
function assertTestSuccess(runResult) {
  const msg =
    'Expected success (exit code ' +
    resultSuccess +
    '), but got ' +
    runResult.status;
  assert.strictEqual(
    resultSuccess,
    runResult.status,
    getDetailedMessage(msg, runResult)
  );
}

/**
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { void }
 */
function assertTestErrored(runResult) {
  const msg =
    'Expected error (exit code ' +
    resultErrored +
    '), but got ' +
    runResult.status;
  assert.strictEqual(
    resultErrored,
    runResult.status,
    getDetailedMessage(msg, runResult)
  );
}

/**
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { void }
 */
function assertTestFailure(runResult) {
  const msg =
    'Expected failure (exit code >= ' +
    resultFailureThreshold +
    '), but got ' +
    runResult.status;
  assert.ok(
    runResult.status !== null && runResult.status >= resultFailureThreshold,
    getDetailedMessage(msg, runResult)
  );
}

/**
 * @param { import('../lib/Report').Report} reporter
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { void }
 */
function assertDistributionShown(reporter, runResult) {
  const msg = getDetailedMessage(
    'Expected to show distribution table',
    runResult
  );
  switch (reporter) {
    case 'console':
      assert.ok(runResult.stdout.includes('Distribution report:'), msg);
      break;
    case 'junit':
      assert.ok(runResult.stdout.includes('Distribution report:'), msg);
      break;
    case 'json':
      assert.ok(runResult.stdout.includes('distributionCount'), msg);
      break;
    default:
      throw 'Unknown reporter!';
  }
}

/**
 * @param { import('../lib/Report').Report} reporter
 * @param { import('child_process').SpawnSyncReturns<string> } runResult
 * @returns { void }
 */
function assertDistributionNotShown(reporter, runResult) {
  const msg = getDetailedMessage(
    'Expected to show distribution table',
    runResult
  );
  switch (reporter) {
    case 'console':
      assert.ok(!runResult.stdout.includes('Distribution report:'), msg);
      break;
    case 'junit':
      assert.ok(!runResult.stdout.includes('Distribution report:'), msg);
      break;
    case 'json':
      assert.ok(!runResult.stdout.includes('distributionCount'), msg);
      break;
    default:
      throw 'Unknown reporter!';
  }
}

/**
 * @param { string } dir
 * @returns { Array<string> }
 */
function readdir(dir) {
  return fs
    .readdirSync(dir)
    .filter((item) => item.endsWith('.elm'))
    .sort();
}

describe('--help', () => {
  it('Should print the usage and exit indicating success', () => {
    const runResult = execElmTest(['--help']);
    assertTestSuccess(runResult);
    // ensure we have a non-empty output
    assert.ok(runResult.stdout.length > 0);
  });
});

describe('--version', () => {
  it('Should print the version and exit indicating success', () => {
    const runResult = execElmTest(['--version']);
    assertTestSuccess(runResult);
    assert.strictEqual(elmTestVersion, runResult.stdout.trim());
  });
});

/* Test examples */

describe('Testing elm-test on an example application', () => {
  const cwd = 'example-application';

  it('Should pass for successful tests', () => {
    const args = path.join('tests', '*Pass*.elm');
    const runResult = execElmTest([args], cwd);
    assertTestSuccess(runResult);
  });

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], cwd);
    assertTestFailure(runResult);
  });

  it('Should successfully run `elm-test make`', () => {
    const runResult = execElmTest(['make'], cwd);
    assertTestSuccess(runResult);
  });
});

describe('Testing elm-test on an example package', () => {
  const cwd = 'example-package';

  it('Should pass for successful tests', () => {
    const args = path.join('tests', '*Pass*.elm');
    const runResult = execElmTest([args], cwd);
    assertTestSuccess(runResult);
  });

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], cwd);
    assertTestFailure(runResult);
  });

  it('Should successfully run `elm-test make`', () => {
    const runResult = execElmTest(['make'], cwd);
    assertTestSuccess(runResult);
  });
});

describe('Testing elm-test on example-application-src', () => {
  const cwd = 'example-application-src';

  it('Should pass successfully', () => {
    const runResult = execElmTest(['src'], cwd);
    assertTestSuccess(runResult);
  });
});

describe('Testing elm-test on an application with no tests', () => {
  const cwd = 'example-application-no-tests';

  it('Should fail due to missing tests', () => {
    const runResult = execElmTest([], cwd);
    assertTestFailure(runResult);
  });
});

/* ci tests on single elm files */
describe('Testing elm-test on single Elm files', () => {
  const cwd = fixturesDir;

  // passing tests
  const passingTestFiles = [
    'Dependency.elm',
    'One.elm',
    'Ports.elm',
    'Several.elm',
    'TrickyMultilines.elm',
    'Unexposed.elm',
  ];

  for (const testToRun of passingTestFiles) {
    it(`Should succeed for the passing test: ${testToRun}`, () => {
      const itsPath = path.join('tests', 'Passing', testToRun);
      const runResult = execElmTest([itsPath], cwd);
      assertTestSuccess(runResult);
    });
  }

  it(`Should run every file in tests/Passing`, () => {
    const filesFound = readdir(path.join(cwd, 'tests', 'Passing'));
    assert.deepStrictEqual(filesFound, passingTestFiles);
  });

  // failing tests
  const failingTestFiles = [
    'Fuzz.elm',
    'One.elm',
    'OneRuntimeException.elm',
    'OneTodo.elm',
    'Several.elm',
    'SeveralTodos.elm',
    'SeveralWithComments.elm',
    'SplitSocketMessage.elm',
  ];

  for (const testToRun of failingTestFiles) {
    it(`Should fail for the failing test: ${testToRun}`, () => {
      const itsPath = path.join('tests', 'Failing', testToRun);
      const runResult = execElmTest([itsPath], cwd);
      assertTestFailure(runResult);
    });
  }

  it(`Should run every file in tests/Failing`, () => {
    const filesFound = readdir(path.join(cwd, 'tests', 'Failing'));
    assert.deepStrictEqual(filesFound, failingTestFiles);
  });

  // tests that raise runtime errors
  const erroredTestFiles = ['OnePort.elm'];

  for (const testToRun of erroredTestFiles) {
    it(`Should raise a runtime exception for test: ${testToRun}`, () => {
      const itsPath = path.join('tests', 'RuntimeException', testToRun);
      const runResult = execElmTest([itsPath], cwd);
      assertTestErrored(runResult);
    });
  }

  it(`Should run every file in tests/RuntimeException`, () => {
    const filesFound = readdir(path.join(cwd, 'tests', 'RuntimeException'));
    assert.deepStrictEqual(filesFound, erroredTestFiles);
  });

  // tests that fail at compile time
  const compilerErrorTestFiles = {
    'InvalidSyntax.elm': 'endless comment',
    'NoTests.elm': 'no exposed values of type test',
  };

  for (const [testToRun, output] of Object.entries(compilerErrorTestFiles)) {
    for (const reporter of ['console', 'junit', 'json']) {
      it(`Compile errors should go to stderr for test: ${testToRun}, reporter: ${reporter}`, () => {
        const itsPath = path.join('tests', 'CompileError', testToRun);
        const runResult = execElmTest([itsPath, '--report', reporter], cwd);
        assert(
          runResult.stderr.toLowerCase().includes(output),
          runResult.stderr
        );
        assert.deepStrictEqual(
          runResult.stdout.split('\n').slice(1).join('\n').trim(),
          ''
        );
      });
    }
  }

  it(`Should not crash the junit reporter on invalid characters`, () => {
    const itsPath = path.join('tests', 'InvalidXMLCharacter', 'Test.elm');
    const runResult = execElmTest([itsPath, '--report', 'junit'], cwd);
    assertTestSuccess(runResult);
  });

  it(`Should run every file in tests/CompileError`, () => {
    const filesFound = readdir(path.join(cwd, 'tests', 'CompileError'));
    assert.deepStrictEqual(
      filesFound,
      Object.keys(compilerErrorTestFiles).sort()
    );
  });
});

describe('Distribution report tests', () => {
  const cwd = fixturesDir;
  /** @type { Record<import('../lib/Report').Report, Record<string, { showDistribution: boolean }>> } */
  const distributionReportFiles = {
    console: {
      'ReportDistributionPassing.elm': { showDistribution: true },
      'ReportDistributionFailing.elm': { showDistribution: true },
      'ExpectDistributionPassing.elm': { showDistribution: false },
      'ExpectDistributionFailingDistribution.elm': { showDistribution: true },
      'ExpectDistributionFailingTest.elm': { showDistribution: true },
    },
    junit: {
      'ReportDistributionPassing.elm': { showDistribution: true },
      'ReportDistributionFailing.elm': { showDistribution: true },
      'ExpectDistributionPassing.elm': { showDistribution: false },
      'ExpectDistributionFailingDistribution.elm': { showDistribution: true },
      'ExpectDistributionFailingTest.elm': { showDistribution: true },
    },
    json: {
      'ReportDistributionPassing.elm': { showDistribution: true },
      'ReportDistributionFailing.elm': { showDistribution: true },
      'ExpectDistributionPassing.elm': { showDistribution: true },
      'ExpectDistributionFailingDistribution.elm': { showDistribution: true },
      'ExpectDistributionFailingTest.elm': { showDistribution: true },
    },
  };

  for (const [reporterKey, tests] of Object.entries(distributionReportFiles)) {
    const reporter = /** @type { import('../lib/Report').Report } */ (
      reporterKey
    );
    for (const [test, { showDistribution }] of Object.entries(tests)) {
      const testFile = path.join(cwd, 'tests', 'Distribution', test);
      it(`Distribution report test for test: ${test}, reporter: ${reporter}`, () => {
        const runResult = execElmTest([testFile, '--report', reporter], cwd);
        if (showDistribution) {
          assertDistributionShown(reporter, runResult);
        } else {
          assertDistributionNotShown(reporter, runResult);
        }
      });
    }
  }
});
