const shell = require('shelljs');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var spawn = require('cross-spawn');
const { fixturesDir, spawnOpts } = require('./util');

var filename = __filename.replace(__dirname + '/', '');
var elmTest = 'elm-test';

function run(testFile) {
  console.log('\nClearing elm-stuff prior to run');
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

shell.echo(filename + ': Verifying installed elmi-to-json...');
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

shell.echo(filename + ': Verifying installed elm-test version...');
run('--version');

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

shell.cd(fixturesDir);

shell.ls('tests/Passing/').forEach(function(testToRun) {
  shell.echo('\n### Testing ' + testToRun + ' (expecting it to pass)\n');
  assertTestSuccess(path.join('tests', 'Passing', testToRun));
});

shell.ls('tests/Failing').forEach(function(testToRun) {
  shell.echo('\n### Testing ' + testToRun + ' (expecting it to fail)\n');
  assertTestFailure(path.join('tests', 'Failing', testToRun));
});

shell.ls('tests/RuntimeException').forEach(function(testToRun) {
  shell.echo(
    '\n### Testing ' +
      testToRun +
      ' (expecting it to error with a runtime exception)\n'
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
