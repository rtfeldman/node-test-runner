#!/usr/bin/env node

require('shelljs/global');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');

var filename = __filename.replace(__dirname + '/', '');
var elmTest = path.join(__dirname, '..', 'bin', 'elm-test');

function run(testFile) {
  if (!testFile) {
    return exec(elmTest).code;
  } else {
    return exec([elmTest, testFile].join(" ")).code
  }
}

function assertTestFailure(testFile) {
  var code = run(testFile);
  if (code !== 2) {
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
exec(elmTest + ' --version');

ls("tests/*.elm").forEach(function(testToRun) {
  if (/Passing\.elm$/.test(testToRun)) {
    echo("\n### Testing " + testToRun + "\n");
    assertTestSuccess(testToRun);
  } else if (/Failing\.elm$/.test(testToRun)) {
    echo("\n### Testing " + testToRun + "\n");
    assertTestFailure(testToRun);
  } else {
    echo("Tried to run " + testToRun + " but it has an invalid filename; node-test-runner tests should fit the pattern \"*Passing.elm\" or \"*Failing.elm\"");
    process.exit(1);
  }
});

echo('### Testing elm-test on example/');

cd('example');

assertTestSuccess(path.join("tests", "PassingTests.*"));
assertTestFailure(path.join("tests", "Fail*"));
assertTestFailure();

cd('..');

echo('### Testing elm-test init && elm-test');
rm('-Rf', 'tmp');
mkdir('-p', 'tmp');
cd('tmp');
exec(elmTest + ' init --yes');
assertTestFailure();

// cd('..');
//
// echo('\n### Testing elm-test init on a non-empty directory\n');
// rm('-Rf', 'tmp');
// cp('-R', 'tests/init-test', 'tmp');
// cd('tmp');
// exec(elmTest + ' init --yes');
// assertTestFailure();


rm('-Rf', 'tmp');

echo('');
echo(filename + ': Everything looks good!');
echo('                                                            ');
echo('  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  ');
echo('_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_');
echo(' _/_                                                        ');
echo('(/                                                          ');
