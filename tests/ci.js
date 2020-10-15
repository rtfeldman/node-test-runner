'use strict';

const assert = require('assert');
const path = require('path');
const shell = require('shelljs');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const os = require('os');
const xml2js = require('xml2js');
const readline = require('readline');
const stripAnsi = require('strip-ansi');

const { fixturesDir, spawnOpts, dummyBinPath } = require('./util');

const elmiToJSONPath = require('elmi-to-json').paths['elmi-to-json'];

//const elmiToJSONPath = path.join(__dirname, '..', 'bin', 'elmi-to-json');
const elmtestPath = path.join(__dirname, '..', 'bin', 'elm-test');


function execElmiToJSON(args) {
  return spawn.sync(
    elmiToJSONPath,
    args,
    Object.assign({ encoding: 'utf-8' }, spawnOpts)
  );
}

function execElmTest(args) {
  return spawn.sync(
    elmtestPath,
    args,
    Object.assign({ encoding: 'utf-8' }, spawnOpts)
  );
}
// old 
const packageInfo = require('../package.json');
const filename = __filename.replace(__dirname + '/', '');
const elmTest = 'elm-test';
const elmTestVersion = packageInfo.version;

const resultSuccess = 0;
const resultErrored = 1;
const resultFailureThreshold = 2;
/*
function run(testFile, clearCache) {
  if (clearCache !== false) {
    shell.echo(
      'Clearing ' + path.join(process.cwd(), 'elm-stuff') + ' prior to run'
    );
    shell.rm('-rf', 'elm-stuff');
  }

  let cmd = [elmTest, ...(testFile ? [testFile] : []), '--color'].join(' ');

  shell.echo('Running: ' + cmd);
  return shell.exec(cmd, spawnOpts);
}

function assertTestErrored(testFile, clearCache) {
  const result = run(testFile, clearCache);
  if (result.code !== 1) {
    fail('Expected tests to exit with exit code 1.', result);
  }
}

function assertTestFailure(testFile, clearCache) {
  const result = run(testFile, clearCache);
  if (result.code < 2) {
    fail('Expected tests to fail with exit code 2 or higher.', result);
  }
}

function assertTestSuccess(testFile, clearCache) {
  const result = run(testFile, clearCache);
  if (result.code !== 0) {
    fail('Expected tests to pass with exit code 0.', result);
  }
}

function fail(message, result) {
  shell.echo();
  shell.echo(`######### ERROR`);
  shell.echo(
    "The last elm-test run above didn't run as expected. Details below."
  );
  shell.echo();
  shell.echo('### stdout');
  shell.echo(result.stdout || '(no stdout)');
  shell.echo();
  shell.echo('### stderr');
  shell.echo(result.stderr || '(no stderr)');
  shell.echo();
  shell.echo('### message');
  shell.echo(message);
  shell.echo(`Exit code: ${result.code}. See stdout and stderr above.`);
  shell.echo(`This message comes from tests/${filename}`);
  shell.echo();
  shell.exit(1);
}
*/
/*

shell.echo(filename + ': Uninstalling old elm-test...');
shell.exec('npm remove --ignore-scripts=false --global ' + elmTest);

shell.echo(filename + ': Installing elm-test...');
shell.exec('npm link --ignore-scripts=false');
*/
// var interfacePath = require('elmi-to-json').paths['elmi-to-json'];

describe('--help', () => {
  it('Should exit indicating success', () => {
    const runResult = execElmiToJSON(['--help']);
    assert.strictEqual(resultSuccess, runResult.status);
  }).timeout(60000);

  it('Should print the usage', () => {
    const runResult = execElmiToJSON(['--help']);
    // ensure we have a non-empty output
    assert.ok(runResult.stdout.length > 0);
  }).timeout(60000);
});

// shell.exec('npm link --ignore-scripts=false');
describe('--version', () => {
  it('Should exit indicating success', () => {
    const runResult = execElmTest(['--version']);
    assert.strictEqual(resultSuccess, runResult.status);
  }).timeout(60000);

  it('Should print the usage', () => {
    const runResult = execElmTest(['--version']);
    assert.strictEqual(elmTestVersion, runResult.stdout.trim());
  }).timeout(60000);
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
    assert.strictEqual(resultSuccess, runResult.status);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], false);
    assert.ok(runResult.status >= resultFailureThreshold);
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
    assert.strictEqual(resultSuccess, runResult.status);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const args = path.join('tests', '*Fail*.elm');
    const runResult = execElmTest([args], false);
    assert.ok(runResult.status >= resultFailureThreshold);
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
    assert.strictEqual(resultSuccess, runResult.status);
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
    assert.notStrictEqual(resultSuccess, runResult.status);
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
  
  // shell.cd(fixturesDir);
  it('Should succeed for the passing tests', () => {
					shell.ls('tests/Passing/').forEach(function (testToRun) {
            const itsPath = path.join('tests', 'Passing', testToRun);
            const runResult = execElmTest([itsPath]);
            assert.strictEqual(resultSuccess, runResult.status);
					});
  }).timeout(60000);
  
  it('Should fail for the failing tests', () => {
					shell.ls('tests/Failing').forEach(function (testToRun) {
            const itsPath = path.join('tests', 'Failing', testToRun);
            const runResult = execElmTest([itsPath]);
            assert.ok(runResult.status >= resultFailureThreshold);
					});
  }).timeout(60000);
  
  it('Should raise a runtime exception if appropriate', () => {
    shell.ls('tests/RuntimeException').forEach(function (testToRun) {
      const itsPath = path.join('tests', 'RuntimeException', testToRun);
      const runResult = execElmTest([itsPath]);
      assert.strictEqual(resultErrored, runResult.status);
    });
  }).timeout(60000);
});