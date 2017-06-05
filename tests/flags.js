const assert = require('assert');
const shell = require('shelljs');
const fs = require('fs-extra');
const xml2js = require('xml2js');

describe('flags', () => {
  describe('--add-dependencies', () => {
    beforeEach(() => {
      shell.mkdir('-p', 'tmp');
      shell.cd('tmp');
    });

    afterEach(() => {
      shell.cd('..');
      shell.rm('-Rf', 'tmp');
    });

    it('should copy over missing dependencies to the destination', (done) => {
      shell.cp('-R', '../tests/add-dependency-test/*', '.');

      shell.exec('elm-test --add-dependencies test-elm-package.json', {silent: true});

      fs.readJson('test-elm-package.json', 'utf8', (err, data) => {
        if (err) throw err;

        assert.equal(data.dependencies.foo, '1.0.0 <= v < 2.0.0');
        done();
      });
    });

    it('should fail if the destination file does not exist', () => {
      shell.cp('-R', '../tests/add-dependency-test/*', '.');
      shell.rm('-R', 'test-elm-package.json');

      const runResult = shell.exec('elm-test --add-dependencies test-elm-package.json', {silent: true});

      assert.notEqual(runResult.code, 0);
    });

    it('should fail if the current directory does not contain an elm-package.json', () => {
      shell.cp('-R', '../tests/add-dependency-test/*', '.');
      shell.rm('-R', 'elm-package.json');

      const runResult = shell.exec('elm-test --add-dependencies test-elm-package.json', {silent: true});

      assert.notEqual(runResult.code, 0);
    });
  });

  describe('--help', () => {
    it('Should print the usage', () => {
      const runResult = shell.exec('elm-test --help', {silent: true});
      // Checking against a fixture is brittle here
      // For now, check that the output is non-empty.
      assert.ok(runResult.stdout.length > 0);
    });

    it('Should exit indicating failure', () => {
      const runResult = shell.exec('elm-test --help', {silent: true});
      assert.notEqual(0, runResult.code);
    });
  });

  describe('--report', () => {
    it('Should be able to report json lines', () => {
      const runResult = shell.exec('elm-test --report=json tests/OnePassing.elm', {silent: true});

      let linesReceived = 0;

      runResult.stdout.split('\n').forEach(line => {
        if (line.length === 0) {
          return;
        }

        linesReceived += 1;
        assert.doesNotThrow(() => JSON.parse(line));
      });

      assert.ok(linesReceived > 0);
    }).timeout(10000);

    it('Should be able to report junit xml', (done) => {
      const runResult = shell.exec('elm-test --report=junit tests/OnePassing.elm', {silent: true});

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    });
  });
});
