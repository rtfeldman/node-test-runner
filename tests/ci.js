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
    assert.equal(0, runResult.status);
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
    assert.equal(0, runResult.status);
  }).timeout(60000);

  it('Should print the usage', () => {
    const runResult = execElmTest(['--version']);
    assert.equal(elmTestVersion, runResult.stdout.trim());
  }).timeout(60000);
});

/* Test examples */

describe('Testing an example application', () => {
  before(() => {
	      shell.pushd('example-application');
  });

  after(() => {
   shell.popd();
  });

  it('Should pass successful tests', () => {
    const runResult = execElmTest(path.join('tests', '*Pass*.elm'), false);
    assert.equal(0, runResult.status);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const runResult = execElmTest(path.join('tests', '*Fail*.elm'), false);
    assert.equal(1, runResult.status);
  }).timeout(60000);
});

/*
shell.echo('\n### Testing elm-test on example-application/');

shell.cd('example-application');

assertTestFailure();
assertTestSuccess(path.join('tests', '*Pass*.elm'), false);
assertTestFailure(path.join('tests', '*Fail*.elm'));

shell.cd('../');
*/
describe('Testing an example package', () => {
  before(() => {
    shell.pushd('example-package');
  });

  after(() => {
    shell.popd();
  });

  it('Should pass successful tests', () => {
    const runResult = execElmTest(path.join('tests', '*Pass*.elm'), false);
    console.log('\n ERRORS \n' + runResult.stderr + '\n');
    console.log('\n STDOUT \n' + runResult.stdout + '\n');
    
    assert.equal(0, runResult.status);
  }).timeout(60000);

  it('Should fail for failing tests', () => {
    const runResult = execElmTest(path.join('tests', '*Fail*.elm'), false);
    assert.equal(1, runResult.status);
  }).timeout(60000);
});
/* 

shell.echo('\n### Testing elm-test on example-application-src/');

shell.cd('example-application-src');

assertTestSuccess('src');

shell.cd('../');

shell.echo('\n### Testing elm-test on example-package/');

shell.cd('example-package');

assertTestSuccess(path.join('tests', '*Pass*.elm'));
assertTestFailure(path.join('tests', '*Fail*.elm'));
assertTestFailure();
assertTestSuccess('src');

shell.cd('../');
*/


describe('Testing an application with no tests', () => {
  before(() => {
    shell.pushd('example-application-no-tests');
  });

  after(() => {
    shell.popd();
  });

  // shell.cd('example-application-no-tests');
  it('Should fail due to missing tests', () => {
    const runResult = execElmTest();
    assert.equal(1, runResult.status);
  }).timeout(60000);
});
/*
shell.echo('\n### Testing elm-test on example-application-no-tests');

shell.cd('example-application-no-tests');

assertTestFailure();

shell.cd('../');
*/

describe('Testing a package with no core', () => {
  before(() => {
    shell.pushd('example-package-no-core');
  });

  after(() => {
    shell.popd();
  });
  
  // shell.cd('example-package-no-core');
  it('Should succeed', () => {
    const runResult = execElmTest();
    assert.equal(0, runResult.status);
  }).timeout(60000);
});
/*
shell.echo('\n### Testing elm-test on example-package-no-core');

shell.cd('example-package-no-core');

assertTestSuccess();
*/
/*

shell.cd(fixturesDir);
*/

/* ci tests on single elm files */

describe('Testing single Elm files', () => {
  before(() => {
    shell.pushd(fixturesDir);
  });

  after(() => {
    shell.popd();
  });
  
  // shell.cd(fixturesDir);
  it('Should succeed for the passing tests', () => {
					shell.ls('tests/Passing/').forEach(function (testToRun) {
            const runResult = execElmTest(path.join('tests', 'Passing', testToRun));
            assert.equal(0, runResult.status);
					});
  }).timeout(60000);
  
  it('Should fail for the failing tests', () => {
					shell.ls('tests/Failing').forEach(function (testToRun) {
            const runResult = execElmTest(path.join('tests', 'Failing', testToRun));
            assert.equal(1, runResult.status);
					});
  }).timeout(60000);
  
  it('Should raise a runtime exception if appropriate', () => {
    shell.ls('tests/RuntimeException').forEach(function (testToRun) {
      const runResult = execElmTest(path.join('tests', 'RuntimeException', testToRun));
      assert.equal(1, runResult.status);
      //assertTestErrored(path.join('tests', 'RuntimeException', testToRun));
    });
  }).timeout(60000);
});

/*
shell.ls('tests/Passing/').forEach(function (testToRun) {
  shell.echo('\n### Testing ' + testToRun + ' (expecting it to pass)');
  assertTestSuccess(path.join('tests', 'Passing', testToRun));
});

shell.ls('tests/Failing').forEach(function (testToRun) {
  shell.echo('\n### Testing ' + testToRun + ' (expecting it to fail)');
  assertTestFailure(path.join('tests', 'Failing', testToRun));
});

shell.ls('tests/RuntimeException').forEach(function (testToRun) {
  shell.echo(
    '\n### Testing ' +
      testToRun +
      ' (expecting it to error with a runtime exception)'
  );
  assertTestErrored(path.join('tests', 'RuntimeException', testToRun));
});

shell.echo('');
shell.echo(filename + ': Everything looks good!');
shell.echo('                                                            ');
shell.echo('  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  ');
shell.echo('_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_');
shell.echo(' _/_                                                        ');
shell.echo('(/                                                          ');
*/
