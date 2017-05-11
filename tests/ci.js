require('shelljs/global');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var spawn = require('cross-spawn');

var filename = __filename.replace(__dirname + '/', '');
var elmTest = "elm-test";

function run(testFile) {
  if (!testFile) {
    echo("Running: elm-test");
    return exec(elmTest).code;
  } else {
    var cmd = [elmTest, testFile].join(" ");

    echo("Running: " + cmd);
    return exec(cmd).code
  }
}

function assertTestFailure(testfile) {
  var code = run(testfile);
  if (code < 2) {
    exec('echo ' + filename + ': error: ' + (testfile ? testfile + ': ' : '') + 'expected tests to fail >&2');
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

echo(filename + ': Uninstalling old elm-test...');
exec('npm remove --ignore-scripts=false --global ' + elmTest);

echo(filename + ': Installing elm-test...');
exec('npm link --ignore-scripts=false');

var binaryExtension = process.platform === "win32" ? ".exe" : "";
var interfacePath = path.resolve(path.join(__dirname, "..", "bin", "elm-interface-to-json" + binaryExtension));
if (!fs.existsSync(interfacePath)) {
  echo(filename + ': Failed because elm-interface-to-json was not found at ' + interfacePath);
  exit(1);
}

echo(filename + ': Verifying installed elm-interface-to-json...');
var interfaceExitCode = spawn.sync(interfacePath, ["--help"]).status;

if (interfaceExitCode !== 0) {
  echo(filename + ': Failed because `elm-interface-to-json` is present, but `elm-interface-to-json --help` returned with exit code ' + interfaceExitCode);
  exit(1);
}

echo(filename + ': Verifying installed elm-test version...');
exec(elmTest + ' --version');

echo('### Testing elm-test on example/');

cd('example');

assertTestSuccess(path.join("tests", "*Pass*"));
assertTestFailure(path.join("tests", "*Fail*"));
assertTestFailure();

ls("tests/*.elm").forEach(function(testToRun) {
  if (/Passing\.elm$/.test(testToRun)) {
    echo("\n### Testing " + testToRun + " (expecting it to pass)\n");
    assertTestSuccess(testToRun);
  } else if (/Failing\.elm$/.test(testToRun)) {
    echo("\n### Testing " + testToRun + " (expecting it to fail)\n");
    assertTestFailure(testToRun);
  } else {
    echo("Tried to run " + testToRun + " but it has an invalid filename; node-test-runner tests should fit the pattern \"*Passing.elm\" or \"*Failing.elm\"");
    process.exit(1);
  }
});

cd('..');

echo('### Testing elm-test init && elm-test');
rm('-Rf', 'tmp');
mkdir('-p', 'tmp');
cd('tmp');
exec(elmTest + ' init --yes');
assertTestFailure();

cd('..');

echo('\n### Testing elm-test init on a non-empty directory\n');
rm('-Rf', 'tmp');
cp('-R', 'tests/init-test', 'tmp');
cd('tmp');
exec(elmTest + ' init --yes');
assertTestFailure();


rm('-Rf', 'tmp');

echo('');
echo(filename + ': Everything looks good!');
echo('                                                            ');
echo('  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  ');
echo('_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_');
echo(' _/_                                                        ');
echo('(/                                                          ');
