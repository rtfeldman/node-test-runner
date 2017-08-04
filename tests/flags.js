"use strict";

const assert = require("assert");
const shell = require("shelljs");
const spawn = require("cross-spawn");
const fs = require("fs-extra");
const xml2js = require("xml2js");

describe("flags", () => {
  describe("--add-dependencies", () => {
    beforeEach(() => {
      shell.mkdir("-p", "tmp");
      shell.cd("tmp");
    });

    afterEach(() => {
      shell.cd("..");
      shell.rm("-Rf", "tmp");
    });

    it("should copy over missing dependencies to the destination", done => {
      shell.cp("-R", "../tests/add-dependency-test/*", ".");

      shell.exec("elm-test --add-dependencies test-elm-package.json", {
        silent: true
      });

      fs.readJson("test-elm-package.json", "utf8", (err, data) => {
        if (err) throw err;

        assert.equal(data.dependencies.foo, "1.0.0 <= v < 2.0.0");
        done();
      });
    });

    it("should fail if the destination file does not exist", () => {
      shell.cp("-R", "../tests/add-dependency-test/*", ".");
      shell.rm("-R", "test-elm-package.json");

      const runResult = shell.exec(
        "elm-test --add-dependencies test-elm-package.json",
        { silent: true }
      );

      assert.notEqual(runResult.code, 0);
    });

    it("should fail if the current directory does not contain an elm-package.json", () => {
      shell.cp("-R", "../tests/add-dependency-test/*", ".");
      shell.rm("-R", "elm-package.json");

      const runResult = shell.exec(
        "elm-test --add-dependencies test-elm-package.json",
        { silent: true }
      );

      assert.notEqual(runResult.code, 0);
    });
  });

  describe("--help", () => {
    it("Should print the usage", () => {
      const runResult = shell.exec("elm-test --help", { silent: true });
      // Checking against a fixture is brittle here
      // For now, check that the output is non-empty.
      assert.ok(runResult.stdout.length > 0);
    });

    it("Should exit indicating failure", () => {
      const runResult = shell.exec("elm-test --help", { silent: true });
      assert.notEqual(0, runResult.code);
    });
  });

  describe("--report", () => {
    it("Should be able to report json lines", () => {
      const runResult = shell.exec(
        "elm-test --report=json tests/OnePassing.elm",
        { silent: true }
      );

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
      const runResult = shell.exec(
        "elm-test --report=junit tests/OnePassing.elm",
        { silent: true }
      );

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);
    it("Should be able to report failing junit xml", done => {
      const runResult = shell.exec(
        "elm-test --report=junit tests/OneFailing.elm",
        { silent: true }
      );

      xml2js.parseString(runResult.stdout, (err, data) => {
        if (err) throw err;

        assert.ok(data);
        done();
      });
    }).timeout(60000);
  });

  describe("--seed", () => {
    it("Should use and, thus, show the proper seed in the JSON report", () => {
      const runResult = shell.exec(
        "elm-test --report=json --seed=12345 tests/OnePassing.elm",
        { silent: true }
      );

      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("12345", firstOutput.initialSeed);
    }).timeout(60000);
  });

  describe("--fuzz", () => {
    it("Should default to 100", () => {
      const runResult = shell.exec(
        "elm-test --report=json tests/OnePassing.elm",
        { silent: true }
      );

      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("100", firstOutput.fuzzRuns);
    }).timeout(60000);

    it("Should use the provided value", () => {
      const runResult = shell.exec(
        "elm-test --fuzz=5 --report=json tests/OnePassing.elm",
        { silent: true }
      );

      const firstOutput = JSON.parse(runResult.stdout.split("\n")[0]);

      assert.equal("5", firstOutput.fuzzRuns);
    }).timeout(60000);
  });

  describe("--compiler", () => {
    it("Should fail if the given compiler can't be executed", () => {
      const runResult = shell.exec(
        "elm-test --compiler=foobar tests/OnePassing.elm",
        { silent: true }
      );

      assert.notEqual(0, runResult.code);
    }).timeout(5000); // This sometimes needs more time to run on Travis.
  });

  describe("--watch", () => {
    it("Should re-run tests if a test file is touched", done => {
      const child = spawn(
        "elm-test",
        ["--report=json", "--watch", "tests/OnePassing.elm"],
        { silent: true }
      );

      let hasRetriggered = false;

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
