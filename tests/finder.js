const assert = require("assert");
const finder = require("../lib/finder.js");
const fs = require('fs-extra');

describe("finder", function() {
  it("should initialize okay twice in a row", done => {
    finder.readExposing(__dirname + "/SeveralFailingWithComments.elm").then((exposedFunctions) =>{
      assert.deepEqual(exposedFunctions, [
        'withoutNums',
        'testWithoutNums',
        'testExpectations',
        'testFailingFuzzTests'
      ]);
      done();
    }).catch((err)=>{
      done(err);
    })
  });
});


describe("strip comments", () => {
  it("should strip a comment on the same line", done => {
    var stripped = finder.stripComments(`module A exposing {- hello -} (f)`, false);
    assert.equal(stripped.line, "module A exposing  (f)");
    done();
  });

  it("should strip multiple comments on the same line", done => {
    var stripped = finder.stripComments(`module A {- woop woop -} exposing {- hello -} (f)`, false);
    assert.equal(stripped.line, "module A  exposing  (f)");
    done();
  });

  it("should return everything up to the end of a comment", done => {
    var stripped = finder.stripComments(`module A exposing {- (f)`, false);
    assert.equal(stripped.line, "module A exposing ");
    done();
  });

  it("should return everything after the end of a comment", done => {
    var stripped = finder.stripComments(`module A exposing -} (f)`, true);
    assert.equal(stripped.line, " (f)");
    done();
  });

  it("should return nothing if in a comment and no comments inside", done => {
    var stripped = finder.stripComments(`module A exposing (f)`, true);
    assert.equal(stripped.line, "");
    done();
  });

  it("should return nothing if line starts with single-line comment", done => {
    var stripped = finder.stripComments(`--module A exposing (f)`, false);
    assert.equal(stripped.line, "");
    done();
  });

  it("should return nothing if line starts with single-line comment and in comment", done => {
    var stripped = finder.stripComments(`--module A exposing (f)`, true);
    assert.equal(stripped.line, "");
    done();
  });

  it("should return parts if line ends with single-line comment", done => {
    var stripped = finder.stripComments(`module A exposing --(f)`, false);
    assert.equal(stripped.line, "module A exposing ");
    done();
  });
});


describe("Parser", () => {
  it("should only read up to imports", done => {
    var lines = [
      "module A exposing (..)",
      "import Html",
      "f = 4"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), ['..']);
    done();
  });

  it("should list all exposed functions", done => {
    var lines = [
      "module A exposing (hello, {- just a little comment -} goodbye)",
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), ['hello', 'goodbye']);
    done();
  });

  it("should not get confused by a missing module decl", done => {
    var lines = [
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), []);
    done();
  });


  it("should not get confused by constructors being exposed", done => {
    var lines = [
      "module A exposing (Foo(..), Bar(G, F), goat)",
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), [ 'goat' ]);
    done();
  });

  it("should not get confused by multiline comments", done => {
    var lines = [
      "module A exposing (Foo(..),",
      " Bar(G,",
      "-- something",
      "F),",
      "goat)",
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), [ 'goat' ]);
    done();
  });

  it("should not get confused by lacking exposing", done => {
    var lines = [
      "module A",
      " Bar(G,",
      "-- something",
      "F),",
      "goat)",
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), false);
    assert.deepEqual(parser.getExposing(), [ ]);
    done();
  });

  it("should not get confused by exposing across multiple lines", done => {
    var lines = [
      "module",
      "Abananan",
      "exposing (",
      " Bar(G,",
      "-- something",
      "F),",
      "goat)",
      "import Html",
      "-- hello",
      "hello = 4",
      "goodbye = 5"
    ];

    var parser = new finder.Parser();

    lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
    assert.equal(parser.isDoneReading(), true);
    assert.deepEqual(parser.getExposing(), [ 'goat' ]);
    done();
  });

  it("should not be confused by exposing across multiple lines like #138", done => {
      var lines = [
        "module A",
        "  exposing",
        "    ( a",
        "    , b",
        "    , c",
        "    )",
        ""
        ];

        var parser = new finder.Parser();

        lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
        assert.equal(parser.isDoneReading(), true);
        assert.deepEqual(parser.getExposing(), [ 'a', 'b', 'c' ]);
        done();
  });
});
