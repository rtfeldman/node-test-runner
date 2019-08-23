const shell = require('shelljs');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var spawn = require('cross-spawn');
var packageInfo = require('../package.json');
var filename = __filename.replace(__dirname + '/', '');
var elmTest = 'elm-test';
const elmHome = path.join(__dirname, '..', 'fixtures', 'elm-home');
const spawnOpts = {
  silent: false,
  env: Object.assign({ ELM_HOME: elmHome }, process.env),
};

var elmTestVersion = packageInfo.version;

function run(testFile) {
  console.log('\nClearing ' + path.join(process.cwd(), 'elm-stuff') + ' prior to run');
  shell.rm('-rf', 'elm-stuff');

  if (!testFile) {
    var cmd = [elmTest, '--color'].join(' ');

    shell.echo('Running: ' + cmd);
    return shell.exec(cmd, spawnOpts).code;
  } else {
    var cmd = [elmTest, testFile, '--color'].join(' ');

    shell.echo('Running: ' + cmd);
    return shell.exec(cmd, spawnOpts).code;
  }
}

function assertTestErrored(testfile) {
  var code = run(testfile);
  if (code !== 1) {
    shell.exec(
      'echo ' +
        filename +
        ': error: ' +
        (testfile ? testfile + ': ' : '') +
        'expected tests to exit with ERROR exit code, not exit code' +
        code +
        ' >&2'
    );
    shell.exit(1);
  }
}

function assertTestIncomplete(testfile) {
  var code = run(testfile);
  if (code !== 3) {
    shell.exec(
      'echo ' +
        filename +
        ': error: ' +
        (testfile ? testfile + ': ' : '') +
        'expected tests to exit with INCOMPLETE exit code, not exit code' +
        code +
        ' >&2'
    );
    shell.exit(1);
  }
}

function assertTestFailure(testfile) {
  var code = run(testfile);

  console.log("assertTestFailure(" + testfile + ") ==> ", code);
  if (code < 2) {
    shell.exec(
      'echo ' +
        filename +
        ': error: ' +
        (testfile ? testfile + ': ' : '') +
        'expected tests to fail >&2'
    );
    shell.exit(1);
  }
}

function assertTestSuccess(testFile) {
  var code = run(testFile);
  if (code !== 0) {
    shell.exec(
      'echo ' +
        filename +
        ': ERROR: ' +
        (testFile ? testFile + ': ' : '') +
        'Expected tests to pass >&2'
    );
    shell.exit(1);
  }
}

shell.echo(filename + ': Uninstalling old elm-test...');
shell.exec('npm remove --ignore-scripts=false --global ' + elmTest);

shell.echo(filename + ': Installing elm-test...');
shell.exec('npm link --ignore-scripts=false');

var interfacePath = require('elmi-to-json').paths['elmi-to-json'];

shell.echo(filename + ': Verifying elmi-to-json is installed...');
var interfaceResult = spawn.sync(interfacePath, ['--help']);
var interfaceExitCode = interfaceResult.status;

if (interfaceExitCode !== 0) {
  shell.echo(
    filename +
      ': Failed because `elmi-to-json` is present, but `elmi-to-json --help` returned with exit code ' +
      interfaceExitCode
  );
  shell.echo(interfaceResult.stdout.toString());
  shell.echo(interfaceResult.stderr.toString());
  shell.exit(1);
}

shell.exec('npm link --ignore-scripts=false');

shell.echo(filename + ': Verifying installed elm-test version...');
var versionRun = shell.exec('elm-test --version');

if (versionRun.code !== 0) {
  shell.exec("echo Expected elm-test --version to exit with exit code 0, but it was " + versionRun.code);
  shell.exit(1);
}

if (versionRun.stdout.trim() !== elmTestVersion) {
  shell.exec("echo Expected elm-test --version to output " + elmTestVersion + ", but it was " + versionRun.stdout.trim());
  shell.exit(1);
}


/* Test examples */

shell.echo('### Testing elm-test on example-application/');

shell.cd('example-application');

assertTestFailure();
assertTestSuccess(path.join('tests', '*Pass*.elm'));
assertTestFailure(path.join('tests', '*Fail*.elm'));

shell.cd('../');

shell.echo('### Testing elm-test on example-package/');

shell.cd('example-package');

assertTestSuccess(path.join('tests', '*Pass*.elm'));
assertTestFailure(path.join('tests', '*Fail*.elm'));
assertTestFailure();

shell.cd('../');

shell.echo('### Testing elm-test on example-application-no-tests');

shell.cd('example-application-no-tests');

assertTestFailure();

shell.cd('../');

shell.echo('### Testing elm-test on example-package-no-core');

shell.cd('example-package-no-core');

assertTestSuccess();

shell.cd('../');

/* ci tests on single elm files */

shell.ls('tests/*.elm').forEach(function(testToRun) {
  if (/Passing\.elm$/.test(testToRun)) {
    shell.echo('\n### Testing ' + testToRun + ' (expecting it to pass)\n');
    assertTestSuccess(testToRun);
  } else if (/Failing\.elm$/.test(testToRun)) {
    shell.echo('\n### Testing ' + testToRun + ' (expecting it to fail)\n');
    assertTestFailure(testToRun);
  } else if (/PortRuntimeException\.elm$/.test(testToRun)) {
    shell.echo(
      '\n### Testing ' +
        testToRun +
        ' (expecting it to error with a runtime exception)\n'
    );
    assertTestErrored(testToRun);
  } else if (/Port\d\.elm$/.test(testToRun)) {
    shell.echo('\n### Skipping ' + testToRun + ' (helper file)\n');
    return;
  } else {
    shell.echo(
      'Tried to run ' +
        testToRun +
        ' but it has an invalid filename; node-test-runner tests should fit the pattern "*Passing.elm" or "*Failing.elm"'
    );
    shell.exit(1);
  }
});

shell.echo('');
shell.echo(filename + ': Everything looks good!');
shell.echo('                                                            ');
shell.echo('  __   ,_   _  __,  -/-     ,         __   __   _   ,    ,  ');
shell.echo('_(_/__/ (__(/_(_/(__/_    _/_)__(_/__(_,__(_,__(/__/_)__/_)_');
shell.echo(' _/_                                                        ');
shell.echo('(/                                                          ');
