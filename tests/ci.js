'use strict';

const assert = require('assert');
const path = require('path');
const shell = require('shelljs');
const spawn = require('cross-spawn');

const { fixturesDir, spawnOpts } = require('./util');

const elmtestPath = path.join(__dirname, '..', 'bin', 'elm-test');

const packageInfo = require('../package.json');
const elmTestVersion = packageInfo.version;

// exit codes
const resultSuccess = 0;
const resultErrored = 1;
const resultFailureThreshold = 2;

function execElmTest(args) {
  return spawn.sync(
    elmtestPath,
    args,
    Object.assign({ encoding: 'utf-8' }, spawnOpts)
  );
}

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

function assertTestFailure(runResult) {
  const msg =
    'Expected failure (exit code >= ' +
    resultFailureThreshold +
    '), but got ' +
    runResult.status;
  assert.ok(
    runResult.status >= resultFailureThreshold,
    getDetailedMessage(msg, runResult)
  );
}

describe('--help', () => {
  it('Should print the usage and exit indicating success', () => {
    const runResult = execElmTest(['--help']);
    assertTestSuccess(runResult);
    // ensure we have a non-empty output
    assert.ok(runResult.stdout.length > 0);
  }).timeout(5000);
});

describe('--version', () => {
  it('Should print the version and exit indicating success', () => {
    const runResult = execElmTest(['--version']);
    assertTestSuccess(runResult);
    assert.strictEqual(elmTestVersion, runResult.stdout.trim());
  }).timeout(5000);
});

/* Test examples */

describe('Testing elm-test on an example application', () => {
  before(() => {
    shell.pushd('example-application');
  });

  after(() => {
    shell.popd();
  });

  it('Should pass for successful tests', () => {
    const args = path.join('tests', '*Pass*.elm');
    const runResult = execElmTest([args], false);
    assertTestSuccess(runResult);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], false);
    assertTestFailure(runResult);
  }).timeout(60000);
});

describe('Testing elm-test on an example package', () => {
  before(() => {
    shell.pushd('example-package');
  });

  after(() => {
    shell.popd();
  });

  it('Should pass for successful tests', () => {
    const args = path.join('tests', '*Pass*.elm');
    const runResult = execElmTest([args], false);
    assertTestSuccess(runResult);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], false);
    assertTestFailure(runResult);
  }).timeout(60000);
});

describe('Testing elm-test on example-application-src', () => {
  before(() => {
    shell.pushd('example-application-src');
  });

  after(() => {
    shell.popd();
  });

  it('Should pass successfully', () => {
    const runResult = execElmTest(['src'], false);
    assertTestSuccess(runResult);
  }).timeout(60000);
});

describe('Testing elm-test on an application with no tests', () => {
  before(() => {
    shell.pushd('example-application-no-tests');
  });

  after(() => {
    shell.popd();
  });

  it('Should fail due to missing tests', () => {
    const runResult = execElmTest();
    assertTestFailure(runResult);
  }).timeout(60000);
});

/* ci tests on single elm files */
describe('Testing elm-test on single Elm files', () => {
  before(() => {
    shell.pushd(fixturesDir);
  });

  after(() => {
    shell.popd();
  });

  it('Should succeed for the passing tests', () => {
    shell.ls('tests/Passing/').forEach(function (testToRun) {
      const itsPath = path.join('tests', 'Passing', testToRun);
      const runResult = execElmTest([itsPath]);
      assertTestSuccess(runResult);
    });
  }).timeout(60000);

  it('Should fail for the failing tests', () => {
    shell.ls('tests/Failing').forEach(function (testToRun) {
      const itsPath = path.join('tests', 'Failing', testToRun);
      const runResult = execElmTest([itsPath]);
      assertTestFailure(runResult);
    });
  }).timeout(60000);

  it('Should raise a runtime exception if appropriate', () => {
    shell.ls('tests/RuntimeException').forEach(function (testToRun) {
      const itsPath = path.join('tests', 'RuntimeException', testToRun);
      const runResult = execElmTest([itsPath]);
      assertTestErrored(runResult);
    });
  }).timeout(60000);
});
