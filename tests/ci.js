#!/usr/bin/env node

require('shelljs/global');

var filename = __filename.replace(__dirname + '/', '');

function run(testFile) {
  var logFile = 'elm-test.test.log';
  var retVal;

  if (!testFile) {
    retVal = exec('elm-test');
  } else {
    logFile = testFile + '.test.log';
    retVal = exec('elm-test ' + testFile);
  }

  retVal.toEnd(logFile);
  return retVal.code;
}

function assertTestFailure(testFile) {
  var code = run(testFile);
  if (code !== 1) {
    exec('echo ' + filename + ': ERROR: ' + (testFile ? testFile + ': ' : '') + 'Expected tests to fail >&2');
    exit(1);
  }
}

function assertTestSuccess(testFile) {
  var code = run(testFile);
  if (code !== 0) {
    exec('echo ' + filename + ': ERROR: ' + (testFile ? testFile + ': ' : '') + 'Expected tests to pass >&2');
    exit(1);
  }
}

echo(filename + ': Installing elm-test...');
exec('npm install --global');

echo(filename + ': Verifying installed elm-test version...');
exec('elm-test --version');

echo(filename + ': Testing examples...');

cd('examples/tests');
exec('elm-package install --yes');
assertTestSuccess('PassingTests.elm');
assertTestFailure('FailingTests.elm');
cd('../..');

echo(filename + ': Testing elm-test init...');
mkdir('-p', 'tmp');
cd('tmp');
exec('elm-test init --yes');
cd('tests');
exec('elm-package install --yes');
cd('..');
assertTestFailure();

// update failing test to passing test
sed('-i', /should fail/, 'should pass', 'tests/Tests.elm');
sed('-i', /Expect.fail "failed as expected!"/, 'Expect.pass', 'tests/Tests.elm');
rm('-Rf', 'tests/elm-stuff');
cd('tests');
exec('elm-package install --yes');
cd('..');
assertTestSuccess();

cd('..');
rm('-Rf', 'tmp');

echo('');
echo(filename + ': Everything looks good!');
echo('                                                            ');
echo('  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  ');
echo('_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_');
echo(' _/_                                                        ');
echo('(/                                                          ');
