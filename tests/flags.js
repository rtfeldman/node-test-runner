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

const elmTestPath = path.join(__dirname, '..', 'bin', 'elm-test');
const scratchDir = path.join('fixturesDir', 'scratch');

function elmTestWithYes(args, callback) {
  const child = spawn(elmTestPath, args, spawnOpts);

  child.stdin.setEncoding('utf-8');
  child.stdin.write(os.EOL);
  child.stdin.end();
  child.on('exit', (code) => {
    callback(code);
  });
}

function execElmTest(args) {
  return spawn.sync(
    elmTestPath,
    args,
    Object.assign({ encoding: 'utf-8' }, spawnOpts)
  );
}

describe('flags', () => {
  before(() => {
    shell.pushd(fixturesDir);
  });

  after(() => {
    shell.popd();
  });

  describe('elm-test init', () => {
    beforeEach(() => {
      fs.ensureDirSync(scratchDir);
      shell.pushd(scratchDir);
    });

    afterEach(() => {
      shell.popd();
      fs.removeSync(scratchDir);
    });

    describe('for a PACKAGE', () => {
      beforeEach(() => {
        shell.cp(
          path.join(fixturesDir, 'templates', 'package', 'elm.json'),
          'elm.json'
        );
      });

      it('Adds elm-explorations/test', (done) => {
        var json = JSON.parse(
          fs.readFileSync('elm.json', { encoding: 'utf-8' })
        );
        assert.equal(
          typeof json['test-dependencies']['elm-explorations/test'],
          'undefined'
        );

        elmTestWithYes(['init'], (code) => {
          assert.equal(code, 0);

          json = JSON.parse(fs.readFileSync('elm.json', { encoding: 'utf-8' }));
          assert.equal(
            typeof json['test-dependencies']['elm-explorations/test'],
            'string'
          );

          done();
        });
      }).timeout(60000);
    });

    describe('for an APPLICATION', () => {
      beforeEach(() => {
        shell.cp(
          path.join(fixturesDir, 'templates', 'application', 'elm.json'),
          'elm.json'
        );
      });

      it('Adds elm-explorations/test', (done) => {
        var json = JSON.parse(
          fs.readFileSync('elm.json', { encoding: 'utf-8' })
        );
        assert.equal(
          typeof json['test-dependencies']['direct']['elm-explorations/test'],
          'undefined'
        );

        elmTestWithYes(['init'], (code) => {
          assert.equal(code, 0);

          json = JSON.parse(fs.readFileSync('elm.json', { encoding: 'utf-8' }));
          assert.equal(
            typeof json['test-dependencies']['direct']['elm-explorations/test'],
            'string'
          );

          done();
        });
      }).timeout(60000);
    });
  });
  describe('elm-test install', () => {
    beforeEach(() => {
      fs.ensureDirSync(scratchDir);
      shell.pushd(scratchDir);
    });

    afterEach(() => {
      shell.popd();
      fs.removeSync(scratchDir);
    });

    it('should fail if the current directory does not contain an elm.json', () => {
      shell.cp('-R', path.join(fixturesDir, 'install', '*', '.'));
      shell.rm('-f', 'elm.json');

      const runResult = execElmTest(['install', 'elm/regex']);

      assert.ok(Number.isInteger(runResult.status));
      assert.notEqual(runResult.status, 0);
    }).timeout(60000);

    it('should not allow command injection', () => {
      shell.cp(
        path.join(fixturesDir, 'templates', 'application', 'elm.json'),
        'elm.json'
      );
      const runResult = spawn.sync(
        elmTestPath,
        ['install', "elm/regex; printf 'FINDME'; printf 'TWICE'"],
        Object.assign({ encoding: 'utf-8', input: 'y\n' }, spawnOpts)
      );
      assert(!runResult.stdout.includes('FINDME'));
      assert(!runResult.stderr.includes('FINDMETWICE'));
    }).timeout(60000);
  });

  describe('--help', () => {
    it('Should print the usage', () => {
      const runResult = execElmTest(['--help']);
      // Checking against a fixture is brittle here
      // For now, check that the output is non-empty.
      assert.ok(runResult.stdout.length > 0);
    }).timeout(60000);

    it('Should exit indicating success (see #359)', () => {
      const runResult = execElmTest(['--help']);
      assert.strictEqual(0, runResult.status);
    }).timeout(60000);
  });

  describe('--report', () => {
    it('Should be able to report json lines', () => {
      const runResult = execElmTest([
        '--report=json',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      let linesReceived = 0;

      runResult.stdout.split('\n').forEach((line) => {
        if (line.length === 0) {
          return;
        }

        linesReceived += 1;
        assert.doesNotThrow(() => JSON.parse(line));
      });

      assert.ok(linesReceived > 0);
    }).timeout(60000);

    it('Should be able to report passing junit xml', (done) => {
      const runResult = execElmTest([
        '--report=junit',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);

    it('Should be able to report compilation errors', () => {
      const runResult = execElmTest([
        '--report=junit',
        path.join('tests', 'CompileError', 'InvalidSyntax.elm'),
      ]);

      assert.ok(runResult.stderr.match(/ENDLESS COMMENT/));
    }).timeout(60000);

    it('Should be able to report failing junit xml', (done) => {
      const runResult = execElmTest([
        '--report=junit',
        path.join('tests', 'Failing', 'One.elm'),
      ]);

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);
  });

  describe('--seed', () => {
    it('Should use and, thus, show the proper seed in the JSON report', () => {
      const runResult = execElmTest([
        '--report=json',
        '--seed=12345',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.equal('12345', firstOutput.initialSeed);
    }).timeout(60000);
  });

  describe('--fuzz', () => {
    it('Should default to 100', () => {
      const runResult = execElmTest([
        '--report=json',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.equal('100', firstOutput.fuzzRuns);
    }).timeout(60000);

    it('Should use the provided value', () => {
      const runResult = execElmTest([
        '--fuzz=5',
        '--report=json',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.equal('5', firstOutput.fuzzRuns);
    }).timeout(60000);
  });

  describe('--compiler', () => {
    before(() => {
      // Warning: this assumes the directory structure of the elm npm module.
      //          It may break with new npm versions of elm.
      const ext = process.platform === 'win32' ? '.exe' : '';
      const elmExe = require.resolve('elm/bin/elm' + ext);
      shell.mkdir('-p', dummyBinPath);
      shell.cp(elmExe, path.join(dummyBinPath, 'different-elm' + ext));
    });

    it("Should fail if the given compiler can't be executed", () => {
      const runResult = execElmTest([
        'elm-test',
        '--compiler=foobar',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should work with different elm on PATH', () => {
      const runResult = execElmTest([
        'elm-test',
        '--compiler=different-elm',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.equal(runResult.status, 0);
    }).timeout(5000);

    it('Should work with local different elm', () => {
      const runResult = execElmTest([
        'elm-test',
        '--compiler=./dummy-bin/different-elm',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.equal(runResult.status, 0);
    }).timeout(5000);
  });

  describe('--watch', () => {
    it('Should re-run tests if a test file is touched', (done) => {
      const child = spawn(
        elmTestPath,
        ['--report=json', '--watch', path.join('tests', 'Passing', 'One.elm')],
        spawnOpts
      );

      let hasRetriggered = false;

      child.on('close', (code, signal) => {
        // don't send error when killed after test passed
        if (code !== null || signal !== 'SIGTERM') {
          done(new Error('elm-test --watch exited with status code: ' + code));
        }
      });
      const reader = readline.createInterface({ input: child.stdout });
      reader.on('line', (line) => {
        try {
          const json = stripAnsi('' + line);
          // skip expected non-json
          if (json === 'Watching for changes...') return;
          const parsedLine = JSON.parse(json);
          if (parsedLine.event !== 'runComplete') return;
          if (!hasRetriggered) {
            shell.touch(path.join('tests', 'Passing', 'One.elm'));
            hasRetriggered = true;
          } else {
            child.kill();
            done();
          }
        } catch (e) {
          console.warn('Unexpected non-json output: ' + line);
        }
      });
    }).timeout(60000);
  });
});
