const shell = require('shelljs');
const path = require('path');
const spawn = require('cross-spawn');
const { fixturesDir, spawnOpts } = require('./util');

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
var versionRun = shell.exec(elmTest + ' --version');

if (versionRun.code !== 0) {
  shell.exec(
    'echo Expected elm-test --version to exit with exit code 0, but it was ' +
      versionRun.code
  );
  shell.exit(1);
}

if (versionRun.stdout.trim() !== elmTestVersion) {
  shell.exec(
    'echo Expected elm-test --version to output ' +
      elmTestVersion +
      ', but it was ' +
      versionRun.stdout.trim()
  );
  shell.exit(1);
}

/* Test examples */

shell.echo('\n### Testing elm-test on example-application/');

shell.cd('example-application');

assertTestFailure();
assertTestSuccess(path.join('tests', '*Pass*.elm'), false);
assertTestFailure(path.join('tests', '*Fail*.elm'));

shell.cd('../');

shell.echo('\n### Testing elm-test on example-application-src/');

shell.cd('example-application-src');

assertTestSuccess('src');

shell.cd('../');

shell.echo('\n### Testing elm-test on example-package/');

shell.cd('example-package');

assertTestSuccess(path.join('tests', '*Pass*.elm'));
assertTestFailure(path.join('tests', '*Fail*.elm'));
assertTestFailure();

shell.cd('../');

shell.echo('\n### Testing elm-test on example-application-no-tests');

shell.cd('example-application-no-tests');

assertTestFailure();

shell.cd('../');

shell.echo('\n### Testing elm-test on example-package-no-core');

shell.cd('example-package-no-core');

assertTestErrored();

shell.cd(fixturesDir);

/* ci tests on single elm files */

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
