"use strict";

const assert = require("assert");
const path = require("path");
const shell = require("shelljs");
const spawn = require("cross-spawn");
const fs = require("fs-extra");
const os = require("os");
const xml2js = require("xml2js");
const temp = require("temp");

// Automatically track and cleanup files at exit
temp.track();

const elmTestPath = path.join(__dirname, "..", "bin", "elm-test");
const spawnOpts = { silent: true };

function elmTestWithYes(args, callback) {
  const child = spawn(elmTestPath, args, spawnOpts);

  child.stdin.setEncoding("utf-8");
  child.stdin.write(os.EOL);
  child.stdin.end();
  child.on('exit', (code) => {
    callback(code);
  });
}

function execElmTest(args) {
  return shell.exec(["ELM_HOME=" + process.env.ELM_HOME, elmTestPath].concat(args).join(" "), spawnOpts);
}

describe("flags", () => {
  describe("elm-test init", () => {
    beforeEach(() => {
      shell.pushd(temp.mkdirSync("elm-test-tests-"));
    });

    afterEach(() => {
      shell.popd();
    });

    describe("for a PACKAGE", () => {
      beforeEach(() => {
        shell.cp(path.join(__dirname, "templates", "package", "elm.json"), "elm.json");
      });

      afterEach(() => {
        shell.rm("-f", "elm.json");
      });

      it("Adds elm-explorations/test", (done) => {
        var json = JSON.parse(fs.readFileSync("elm.json", {encoding: "utf-8"}));
        assert.equal(typeof json["test-dependencies"]["elm-explorations/test"], "undefined");

        elmTestWithYes(["init"], (code) => {
          assert.equal(code, 0);

          json = JSON.parse(fs.readFileSync("elm.json", {encoding: "utf-8"}));
          assert.equal(typeof json["test-dependencies"]["elm-explorations/test"], "string");

          done();
        });
      });
    });

    describe("for an APPLICATION", () => {
      beforeEach(() => {
        shell.cp(path.join(__dirname, "templates", "application", "elm.json"), "elm.json");
      });

      afterEach(() => {
        shell.rm("-f", "elm.json");
      });

      it("Adds elm-explorations/test", (done) => {
        var json = JSON.parse(fs.readFileSync("elm.json", {encoding: "utf-8"}));
        assert.equal(typeof json["test-dependencies"]["direct"]["elm-explorations/test"], "undefined");

        elmTestWithYes(["init"], (code) => {
          assert.equal(code, 0);

          json = JSON.parse(fs.readFileSync("elm.json", {encoding: "utf-8"}));
          assert.equal(typeof json["test-dependencies"]["direct"]["elm-explorations/test"], "string");

          done();
        });
      });
    });
  });
  describe("elm-test install", () => {
    beforeEach(() => {
      shell.pushd(temp.mkdirSync("elm-test-tests-"));
    });

    afterEach(() => {
      shell.popd();
    });

    it("should fail if the current directory does not contain an elm.json", () => {
      shell.cp("-R", path.join(__dirname, "install", "*", "."));
      shell.rm("-f", "elm.json");

      const runResult = execElmTest(["install", "elm/regex"]);

      assert.notEqual(runResult.code, 0);
    });
  });

  describe("--help", () => {
    it("Should print the usage", () => {
      const runResult = execElmTest(["--help"]);
      // Checking against a fixture is brittle here
      // For now, check that the output is non-empty.
      assert.ok(runResult.stdout.length > 0);
    });

    it("Should exit indicating failure", () => {
      const runResult = execElmTest(["--help"]);
      assert.notEqual(0, runResult.code);
    });
  });

  describe("--report", () => {
    it("Should be able to report json lines", () => {
      const runResult = execElmTest(["--report=json", "tests/OnePassing.elm"]);

      let linesReceived = 0;

      runResult.stdout.split("\n").forEach(line => {
        if (line.length === 0) {
          return;
        }

        linesReceived += 1;
        assert.doesNotThrow(() => JSON.parse(line));
      });

      assert.ok(linesReceived > 0);
    }).timeout(60000);

    it("Should be able to report passing junit xml", done => {
      const runResult = execElmTest(["--report=junit", "tests/OnePassing.elm"]);

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);

    it("Should be able to report compilation errors", () => {
      const runResult = execElmTest(["--report=junit", "tests/compile-error-test/InvalidSyntax.elm"]);

      assert.ok(runResult.stderr.match(/PARSE ERROR/));
    }).timeout(60000);

    it("Should be able to report failing junit xml", done => {
      const runResult = execElmTest([ "--report=junit", "tests/OneFailing.elm"]);

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);
  });

  describe("--seed", () => {
    it("Should use and, thus, show the proper seed in the JSON report", () => {
      const runResult = execElmTest(["--report=json", "--seed=12345", "tests/OnePassing.elm"]);
      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("12345", firstOutput.initialSeed);
    }).timeout(60000);
  });

  describe("--fuzz", () => {
    it("Should default to 100", () => {
      const runResult = execElmTest(["--report=json", "tests/OnePassing.elm"]);
      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("100", firstOutput.fuzzRuns);
    }).timeout(60000);

    it("Should use the provided value", () => {
      const runResult = execElmTest(["--fuzz=5", "--report=json", "tests/OnePassing.elm"]);
      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("5", firstOutput.fuzzRuns);
    }).timeout(60000);
  });

  describe("--compiler", () => {
    it("Should fail if the given compiler can't be executed", () => {
      const runResult = execElmTest(["elm-test", "--compiler=foobar", "tests/OnePassing.elm"]);

      assert.notEqual(0, runResult.code);
    }).timeout(5000); // This sometimes needs more time to run on Travis.
  });

  describe("--watch", () => {
    it("Should re-run tests if a test file is touched", done => {
      const child = spawn(
        elmTestPath,
        ["--report=json", "--watch", "tests/OnePassing.elm"],
        spawnOpts
      );

      let hasRetriggered = false;

      child.on("close", code => {
        done(new Error("elm-test --watch exited with status code: " + code));
      });
      child.stdout.on("data", line => {
        try {
          const parsedLine = JSON.parse(line);
          if (parsedLine.event === "runComplete" && !hasRetriggered) {
            shell.touch("tests/OnePassing.elm");
            hasRetriggered = true;
          }

          if (parsedLine.event == "runComplete" && hasRetriggered) {
            child.kill();
            done();
          }
        } catch (e) {
          console.warn("Unexpected non-json output: " + line);
        }
      });
    }).timeout(60000);
  });
});
