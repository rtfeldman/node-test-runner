'use strict';

const assert = require('assert');
const path = require('path');
const spawn = require('cross-spawn');
const fs = require('fs');
const os = require('os');
const xml2js = require('xml2js');
const readline = require('readline');
const stripAnsi = require('strip-ansi');
const which = require('which');
const { fixturesDir, spawnOpts, dummyBinPath } = require('./util');

const rootDir = path.join(__dirname, '..');
const elmTestPath = path.join(rootDir, 'bin', 'elm-test');
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

function execElmTest(args, cwd = fixturesDir, extraOpts = {}) {
  return spawn.sync(
    elmTestPath,
    args,
    Object.assign({ encoding: 'utf-8', cwd }, spawnOpts, extraOpts)
  );
}

function rimraf(dirPath) {
  // We can replace this with just `fs.rmSync(dirPath, { recursive: true, force: true })`
  // when Node.js 12 is EOL 2022-04-30 and support for Node.js 12 is dropped.
  // `fs.rmSync` was added in Node.js 14.14.0, which is also when the
  // `recursive` option of `fs.rmdirSync` was deprecated. The `if` avoids
  // printing a deprecation message.
  if (fs.rmSync !== undefined) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } else if (fs.existsSync(dirPath)) {
    fs.rmdirSync(dirPath, { recursive: true });
  }
}

function ensureEmptyDir(dirPath) {
  rimraf(dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function touch(filePath) {
  const now = new Date();
  fs.utimesSync(filePath, now, now);
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

    it('should fail if no elm.json can be found', () => {
      const runResult = execElmTest(['install', 'elm/regex'], rootDir);
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

    describe('--output', () => {
      it('should ignore --output flag when set to /dev/null', () => {
        const runResult = execElmTest([
          'make',
          '--output=/dev/null',
          'tests/Passing/One.elm',
        ]);

        assert.strictEqual(runResult.status, 0);
      }).timeout(60000);

      it('should fail if setting --output to anything other than /dev/null', () => {
        const runResult = execElmTest([
          'make',
          '--output=output_file',
          'tests/Passing/One.elm',
        ]);

        assert.ok(Number.isInteger(runResult.status));
        assert.notStrictEqual(runResult.status, 0);
      }).timeout(60000);
    });
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

    it('Should allow 0', () => {
      const runResult = execElmTest([
        '--report=json',
        '--seed=0',
        path.join('tests', 'Passing', 'One.elm'),
      ]);
      const firstOutput = JSON.parse(runResult.stdout.split('\n')[0]);

      assert.strictEqual('0', firstOutput.initialSeed);
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

    it('Should fail if given 0', () => {
      const runResult = execElmTest([
        '--fuzz',
        '0',
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
      const elmExe = path.resolve(which.sync('elm'));
      fs.mkdirSync(dummyBinPath, { recursive: true });
      fs.copyFileSync(
        elmExe,
        path.join(dummyBinPath, 'different-elm' + path.extname(elmExe))
      );
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

    it('Should re-run tests when files are changed, added and removed', (done) => {
      const addedFile = path.join(
        fixturesDir,
        'tests',
        'Passing',
        'Generated.elm'
      );
      if (fs.existsSync(addedFile)) {
        fs.unlinkSync(addedFile);
      }

      const child = spawn(
        elmTestPath,
        ['--report=json', '--watch', path.join('tests', 'Passing', 'One.elm')],
        Object.assign({ encoding: 'utf-8', cwd: fixturesDir }, spawnOpts)
      );

      child.on('close', (code, signal) => {
        // don't send error when killed after test passed
        if (code !== null || signal !== 'SIGTERM') {
          done(new Error('elm-test --watch exited with status code: ' + code));
        }
      });

      let runsExecuted = 0;
      const reader = readline.createInterface({ input: child.stdout });

      reader.on('line', (line) => {
        try {
          const parsedLine = JSON.parse(stripAnsi('' + line));
          if (parsedLine.event !== 'runComplete') return;
          runsExecuted++;
          switch (runsExecuted) {
            case 1:
              // Imagine this adds `import Passing.Generated`…
              touch(path.join(fixturesDir, 'tests', 'Passing', 'One.elm'));
              break;
            case 2:
              // … then if Generated.elm is created we should re-run the tests.
              // (A really smart implementation cound follow the import graph.)
              fs.writeFileSync(addedFile, 'module Generated exposing (a)\na=1');
              break;
            case 3:
              // Same thing if we remove it again.
              fs.unlinkSync(addedFile);
              break;
            case 4:
              // Tests might depend on source files. (Again, a really smart
              // implementation would know for sure.)
              touch(path.join(fixturesDir, 'src', 'Port1.elm'));
              break;
            case 5:
              // elm.json needs to be watched too. You might add source
              // directories or install dependencies.
              touch(path.join(fixturesDir, 'elm.json'));
              // Another change close after should be batched into the same run.
              setTimeout(() => touch(path.join(fixturesDir, 'elm.json')), 100);
              break;
            case 6:
              child.kill();
              done();
              break;
            default:
              child.kill();
              done(
                new Error(
                  `More runs executed than expected: ${runsExecuted}\n${line}`
                )
              );
          }
        } catch (e) {
          child.kill();
          done(e);
        }
      });
    }).timeout(60000);

    it('Should re-run tests after install', (done) => {
      ensureEmptyDir(scratchDir);

      fs.copyFileSync(
        path.join(fixturesDir, 'templates', 'application', 'elm.json'),
        scratchElmJsonPath
      );
      fs.mkdirSync(path.join(scratchDir, 'src'));

      elmTestWithYes(['init'], (code) => {
        assert.strictEqual(code, 0);

        const child = spawn(
          elmTestPath,
          ['--report=json', '--watch'],
          Object.assign({ encoding: 'utf-8', cwd: scratchDir }, spawnOpts)
        );

        child.on('close', (code, signal) => {
          // don't send error when killed after test passed
          if (code !== null || signal !== 'SIGTERM') {
            done(
              new Error('elm-test --watch exited with status code: ' + code)
            );
          }
        });

        let runsExecuted = 0;

        child.stderr.on('data', (data) => {
          switch (runsExecuted) {
            case 0:
              child.kill();
              done();
              break;
            default:
              child.kill();
              done(
                new Error(
                  `Unexpected stderr test run: ${runsExecuted}\n${data.toString()}`
                )
              );
          }
        });

        const reader = readline.createInterface({ input: child.stdout });

        reader.on('line', (line) => {
          try {
            const parsedLine = JSON.parse(stripAnsi('' + line));
            if (parsedLine.event !== 'runComplete') return;
            runsExecuted++;
            switch (runsExecuted) {
              case 0: {
                // elm/json is in the "indirect" dependencies – let’s move it to "direct".
                // This should re-run the tests because we likely did this for a
                // reason – some file depends on elm/json now.
                elmTestWithYes(['install', 'elm/json'], (code) => {
                  assert.strictEqual(code, 0);
                });
                break;
              }
              case 1:
                // Remove the tests dir again. This should re-run and output
                // messages about no tests found but not crash.
                rimraf(path.join(scratchDir, 'tests'));
                break;
              default:
                child.kill();
                done(
                  new Error(
                    `Unexpected stdout test run: ${runsExecuted}\n${line}`
                  )
                );
            }
          } catch (e) {
            child.kill();
            done(e);
          }
        });
      });
    }).timeout(60000);
  });

  describe('color', () => {
    it('Should allow forcing colors on/off with flags and env vars', () => {
      // Run with a constant seed so we can compare outputs (the seed is printed).
      const baseArgs = ['--seed=1', path.join('tests', 'Passing', 'One.elm')];

      // Replace printed duration with a fixed value so we can compare outputs.
      const fixDuration = (string) => string.replace(/\d+ ms/g, '123 ms');

      // This has no colors because in the tests `elm-test` is not connected to a terminal.
      const base = execElmTest(baseArgs);
      assert.strictEqual(base.status, 0, 'base run');

      // This should have the same output but with some color codes here and there.
      const colorFlag = execElmTest([...baseArgs, '--color']);
      assert.strictEqual(colorFlag.status, 0, 'colorFlag run');
      assert.ok(
        colorFlag.stdout.length > base.stdout.length,
        'colorFlag.stdout should have color'
      );

      const shouldNotHaveColor = (name, args, env) => {
        const runResult = execElmTest(baseArgs.concat(args), fixturesDir, {
          env: Object.assign({}, spawnOpts.env, env),
        });
        assert.strictEqual(runResult.status, 0, `${name}: run`);
        assert.strictEqual(
          fixDuration(runResult.stdout),
          fixDuration(base.stdout),
          `${name}: stdout should NOT have color`
        );
      };

      const shouldHaveColor = (name, args, env) => {
        const runResult = execElmTest(baseArgs.concat(args), fixturesDir, {
          env: Object.assign({}, spawnOpts.env, env),
        });
        assert.strictEqual(runResult.status, 0, `${name}: run`);
        assert.strictEqual(
          fixDuration(runResult.stdout),
          fixDuration(colorFlag.stdout),
          `${name}: stdout should have color`
        );
      };

      shouldHaveColor('Force color with env var', [], { FORCE_COLOR: '1' });

      shouldNotHaveColor('Env var overrides flag (to no color)', ['--color'], {
        FORCE_COLOR: '0',
      });

      shouldNotHaveColor('No colors via flag', ['--no-color'], {});

      shouldHaveColor('Env var overrides flag (to color)', ['--no-color'], {
        FORCE_COLOR: '1',
      });
    }).timeout(60000);
  });

  describe('mixed', () => {
    it('Should find an elm.json up the directory tree', () => {
      const runResult = execElmTest(
        ['One.elm'],
        path.join(fixturesDir, 'tests', 'Passing')
      );
      assert.strictEqual(runResult.status, 0);
    }).timeout(60000);

    it('Should deduplicate test files', () => {
      // This is nice if two globs accidentally intersect.
      const runResult = execElmTest([
        'tests/Passing/Dedup/*.elm',
        'tests/**/!(Failing)/**/One.elm',
      ]);
      assert.strictEqual(runResult.status, 0);
    }).timeout(60000);

    it.only(
      'Should find all Elm files inside the directory that a glob resolves to',
      () => {
        // This is nice if two globs accidentally intersect.
        const runResult = execElmTest(['tests/Pass*']);
        console.log(runResult);
        assert.strictEqual(runResult.status, 0);
      }
    ).timeout(60000);
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
