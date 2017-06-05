const assert = require('assert');
const shell = require('shelljs');
const fs = require('fs-extra');

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
    // After updating the output of --help, restore the fixture by running
    // elm-test --help > tests/output-fixtures/help.txt
    it('Should print the usage', (done) => {
      fs.readFile('tests/output-fixtures/help.txt', 'utf8', (err, data) => {
        if (err) throw err;

        const runResult = shell.exec('elm-test --help', {silent: true});

        assert.equal(data, runResult.stdout);
        done();
      });
    });

    it('Should exit indicating failure', () => {
      const runResult = shell.exec('elm-test --help', {silent: true});
      assert.notEqual(0, runResult.code);
    });
  });
});
