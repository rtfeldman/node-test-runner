'use strict';

const assert = require('assert');
const path = require('path');
const spawn = require('cross-spawn');
const fs = require('fs');
const os = require('os');
const xml2js = require('xml2js');
const readline = require('readline');
const rimraf = require('rimraf');
const stripAnsi = require('strip-ansi');
const { fixturesDir, spawnOpts, dummyBinPath } = require('./util');

const elmTestPath = path.join(__dirname, '..', 'bin', 'elm-test');
const scratchDir = path.join(fixturesDir, 'scratch');
const scratchElmJsonPath = path.join(scratchDir, 'elm.json');

function elmTestWithYes(args, callback) {
  const child = spawn(
    elmTestPath,
    args,
    Object.assign({ encoding: 'utf-8', cwd: scratchDir }, spawnOpts)
  );

  child.stdin.setEncoding('utf-8');
  child.stdin.write(os.EOL);
  child.stdin.end();
  child.on('exit', (code) => {
    callback(code);
  });
}

function execElmTest(args, cwd = fixturesDir) {
  return spawn.sync(
    elmTestPath,
    args,
    Object.assign({ encoding: 'utf-8', cwd }, spawnOpts)
  );
}

function ensureEmptyDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    // We can replace this with `fs.rmdirSync(dir, { recursive: true })`
    // once Node.js 10 is EOL 2021-04-30 and support for Node.js 10 is dropped.
    rimraf.sync(dirPath);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('flags', () => {
  describe('elm-test init', () => {
    beforeEach(() => {
      ensureEmptyDir(scratchDir);
    });

    it('Should fail if given extra arguments', () => {
      const runResult = execElmTest(['init', 'frontend/elm']);
      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(60000);

    describe('for a PACKAGE', () => {
      it('Adds elm-explorations/test', (done) => {
        fs.copyFileSync(
          path.join(fixturesDir, 'templates', 'package', 'elm.json'),
          scratchElmJsonPath
        );

        const jsonBefore = readJson(scratchElmJsonPath);
        assert.strictEqual(
          typeof jsonBefore['test-dependencies']['elm-explorations/test'],
          'undefined'
        );

        elmTestWithYes(['init'], (code) => {
          assert.strictEqual(code, 0);

          const jsonAfter = readJson(scratchElmJsonPath);
          assert.strictEqual(
            typeof jsonAfter['test-dependencies']['elm-explorations/test'],
            'string'
          );

          done();
        });
      }).timeout(60000);
    });

    describe('for an APPLICATION', () => {
      it('Adds elm-explorations/test', (done) => {
        fs.copyFileSync(
          path.join(fixturesDir, 'templates', 'application', 'elm.json'),
          scratchElmJsonPath
        );

        const jsonBefore = readJson(scratchElmJsonPath);
        assert.strictEqual(
          typeof jsonBefore['test-dependencies']['direct'][
            'elm-explorations/test'
          ],
          'undefined'
        );

        elmTestWithYes(['init'], (code) => {
          assert.strictEqual(code, 0);

          const jsonAfter = readJson(scratchElmJsonPath);
          assert.strictEqual(
            typeof jsonAfter['test-dependencies']['direct'][
              'elm-explorations/test'
            ],
            'string'
          );

          done();
        });
      }).timeout(60000);
    });
  });

  describe('elm-test install', () => {
    beforeEach(() => {
      ensureEmptyDir(scratchDir);
    });

    it('should fail if given no arguments', () => {
      const runResult = execElmTest(['install']);
      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(60000);

    it('should fail if given extra arguments', () => {
      const runResult = execElmTest(['install', 'elm/regex', 'elm/time']);
      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(60000);

    it('should fail if the current directory does not contain an elm.json', () => {
      const runResult = execElmTest(['install', 'elm/regex'], scratchDir);
      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(60000);

    it('should not allow command injection', () => {
      fs.copyFileSync(
        path.join(fixturesDir, 'templates', 'application', 'elm.json'),
        scratchElmJsonPath
      );
      const runResult = spawn.sync(
        elmTestPath,
        ['install', "elm/regex; printf 'FINDME'; printf 'TWICE'"],
        Object.assign(
          { encoding: 'utf-8', input: 'y\n', cwd: fixturesDir },
          spawnOpts
        )
      );
      assert(!runResult.stdout.includes('FINDME'));
      assert(!runResult.stderr.includes('FINDMETWICE'));
    }).timeout(60000);

    it('should exit with success if package already installed', () => {
      const runResult = execElmTest(['install', 'elm-explorations/test']);
      console.log(runResult);
      assert.strictEqual(runResult.status, 0);
    }).timeout(60000);
  });

  describe('elm-test make', () => {
    it('should exit with success for valid Elm code', () => {
      const runResult = execElmTest(['make', 'tests/Passing/One.elm']);
      assert.strictEqual(runResult.status, 0);
    }).timeout(60000);

    it('should exit with non-success for invalid Elm code', () => {
      const runResult = execElmTest([
        'make',
        'tests/CompileError/InvalidSyntax.elm',
      ]);
      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
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
    it('Should fail if given an unknown reporter', () => {
      const runResult = execElmTest([
        '--report',
        'rune-stone',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

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
    it('Should fail if given a non-integer', () => {
      const runResult = execElmTest([
        '--seed',
        '1.5',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should fail if given a negative integer', () => {
      const runResult = execElmTest([
        '--seed',
        '-5',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should use and, thus, show the proper seed in the JSON report', () => {
      const runResult = execElmTest([
        '--report=json',
        '--seed=12345',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.strictEqual('12345', firstOutput.initialSeed);
    }).timeout(60000);
  });

  describe('--fuzz', () => {
    it('Should fail if given a non-digits', () => {
      const runResult = execElmTest([
        '--fuzz',
        '0xaf',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should fail if given a negative integer', () => {
      const runResult = execElmTest([
        '--fuzz',
        '-5',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should default to 100', () => {
      const runResult = execElmTest([
        '--report=json',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.strictEqual('100', firstOutput.fuzzRuns);
    }).timeout(60000);

    it('Should use the provided value', () => {
      const runResult = execElmTest([
        '--fuzz=5',
        '--report=json',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.strictEqual('5', firstOutput.fuzzRuns);
    }).timeout(60000);
  });

  describe('--compiler', () => {
    before(() => {
      // Warning: this assumes the directory structure of the elm npm module.
      //          It may break with new npm versions of elm.
      const ext = process.platform === 'win32' ? '.exe' : '';
      const elmExe = require.resolve('elm/bin/elm' + ext);
      fs.mkdirSync(dummyBinPath, { recursive: true });
      fs.copyFileSync(elmExe, path.join(dummyBinPath, 'different-elm' + ext));
    });

    it('Should fail if given no value', () => {
      const runResult = execElmTest([
        '--compiler',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it("Should fail if the given compiler can't be executed", () => {
      const runResult = execElmTest([
        '--compiler=foobar',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should work with different elm on PATH', () => {
      const runResult = execElmTest([
        '--compiler=different-elm',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.strictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should work with local different elm', () => {
      const runResult = execElmTest([
        '--compiler=./dummy-bin/different-elm',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.strictEqual(runResult.status, 0);
    }).timeout(5000);
  });

  describe('--watch', () => {
    it('Should fail if given a value', () => {
      const runResult = execElmTest([
        '--watch=always',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should re-run tests if a test file is touched', (done) => {
      const child = spawn(
        elmTestPath,
        ['--report=json', '--watch', path.join('tests', 'Passing', 'One.elm')],
        Object.assign({ encoding: 'utf-8', cwd: fixturesDir }, spawnOpts)
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
            const now = new Date();
            fs.utimesSync(
              path.join(fixturesDir, 'tests', 'Passing', 'One.elm'),
              now,
              now
            );
            hasRetriggered = true;
          } else {
            child.kill();
            done();
          }
        } catch (e) {
          child.kill();
          done(e);
        }
      });
    }).timeout(60000);
  });

  describe('unknown flags', () => {
    it('Should fail on unknown short flag', () => {
      const runResult = execElmTest([
        '-ä',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);

    it('Should fail on unknown long flag', () => {
      const runResult = execElmTest([
        '--unknown-flag',
        path.join('tests', 'Passing', 'One.elm'),
      ]);

      assert.ok(Number.isInteger(runResult.status));
      assert.notStrictEqual(runResult.status, 0);
    }).timeout(5000);
  });
});
