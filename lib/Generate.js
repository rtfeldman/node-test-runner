const { supportsColor } = require('./chalk');
const fs = require('fs');
const path = require('path');
const ElmJson = require('./ElmJson');
const Hash = require('./Hash');
const Solve = require('./Solve');

const before = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'before.js'),
  'utf8'
);

const after = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'after.js'),
  'utf8'
);

/**
 * @param { Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> } testModules
 * @param { string } pipeFilename
 * @param { string } dest
 * @param { boolean } unbufferedLogs
 * @returns { Record<string, string> }
 */
function prepareCompiledJsFile(
  testModules,
  pipeFilename,
  dest,
  unbufferedLogs
) {
  const content = fs.readFileSync(dest, 'utf8');

  const names = testModules.flatMap((mod) =>
    mod.possiblyTests.map((test) =>
      toCompiledJavaScriptName(mod.moduleName, test)
    )
  );

  const hashes = Hash.calculateHashes(unbufferedLogs, names, content);

  const finalContent = `
${before}
var Elm = (function() {
${patch(hashes, unbufferedLogs, content)}
return this.Elm;
}).call({});
var pipeFilename = ${JSON.stringify(pipeFilename)};
${after}
  `.trim();

  fs.writeFileSync(dest, finalContent);

  // Needed when the user has `"type": "module"` in their package.json.
  // Our output is CommonJS.
  fs.writeFileSync(
    path.join(path.dirname(dest), 'package.json'),
    JSON.stringify({ type: 'commonjs' })
  );

  return hashes;
}

// To avoid having to update this regex if a new variant is added,
// elm-explorations/test have prefixed all variants with `ElmTestVariant__`.
// `\$?` is for the Lamdera compiler, where definitions sometimes end with a `$`.
// See https://github.com/lamdera/compiler/pull/41#issuecomment-2725158568
const testVariantDefinition =
  /^var \$elm_explorations\$test\$Test\$Internal\$(?:ElmTestVariant__\w+)\$? = (?:F\d\(\s*)?function \([\w, ]*\) \{\s*return \{/gm;

/**
 * @param { string } name
 * @returns { RegExp }
 */
function placeholderDefinition(name) {
  return RegExp(
    String.raw`^(var \$author\$project\$Test\$Runner\$Node\$${name}) = \$author\$project\$Test\$Runner\$Node\$placeholderReplaceMe___\('[^']+'\)`,
    'm'
  );
}

const checkDefinition = placeholderDefinition('check');
const getAndClearDebugLogsDefinition = placeholderDefinition(
  'getAndClearDebugLogs'
);
const getHashDefinition = placeholderDefinition('getHash');
const runWithDurationDefinition = placeholderDefinition('runWithDuration');

const debugLogDefinition =
  /^var _Debug_log = F2\(function\(tag, value\)\s*\{[^}]+\}\)/m;

const encodeEmptyDebugLogsCall =
  /^(\s*)\$author\$project\$Test\$Generated\$PreviousRun\$encodeDebugLogs\(_List_Nil\)/gm;

const encodeDebugLogsCall =
  /^(\s*)\$author\$project\$Test\$Generated\$PreviousRun\$encodeDebugLogs\(\s*_List_fromArray\(/gm;

/**
 * @param { string } moduleName
 * @param { string } valueName
 * @returns { string }
 */
function toCompiledJavaScriptName(moduleName, valueName) {
  return `$author$project$${moduleName.replace(/\./g, '$')}$${valueName}`;
}

/**
 * Patch the JavaScript output from Elm:
 *
 * - Create a symbol, tag all `Test` constructors with it and make the `check`
 *   function look for it.
 * - Silence `console.warn('Compiled in DEV mode. ...')`. The call is near the top of the file,
 *   and the first usage of `console.warn`.
 *
 * @param { Record<string, string> } hashes
 * @param { boolean } unbufferedLogs
 * @param { string } content
 * @returns { string }
 */
function patch(hashes, unbufferedLogs, content) {
  return (
    'var __elmTestSymbol = Symbol("elmTestSymbol");\n' +
    content
      .replace(testVariantDefinition, '$&__elmTestSymbol: __elmTestSymbol, ')
      .replace(
        checkDefinition,
        '$1 = value => value && value.__elmTestSymbol === __elmTestSymbol ? $elm$core$Maybe$Just(value) : $elm$core$Maybe$Nothing;'
      )
      // Simply remove the first occurrence of `console.warn`. This leaves the message string in parentheses behind, but that’s fine.
      .replace('console.warn', '')
      .replace(
        debugLogDefinition,
        unbufferedLogs
          ? `
var _Debug_logs = [];
var _Debug_logPaused = false;
var _Debug_log = F2(function(tag, value)
{
  if (_Debug_logs.length === 0) {
    _Debug_logs.push('');
  }
  console.error(tag + ': ' + _Debug_toString(value));
  return value;
});
            `.trim()
          : `
var _Debug_logs = [];
var _Debug_logPaused = false;
var _Debug_logPausedMessage = 'For passing fuzz tests, Debug.log is not shown, since showing logs from lots of runs is pretty confusing. Tip: Use Debug.todo to fail a test from anywhere.';
var _Debug_log = F2(function(tag, value)
{
  if (_Debug_logPaused) {
    if (_Debug_logs.length === 0) {
      _Debug_logs.push(_Debug_logPausedMessage);
    }
  } else {
    _Debug_logs.push(tag + ': ' + _Debug_toString(value));
  }
  return value;
});
            `.trim()
      )
      .replace(
        getAndClearDebugLogsDefinition,
        '$1 = paused => { var logs = _Json_wrap(_Debug_logs); _Debug_logs = []; _Debug_logPaused = paused; return logs; }'
      )
      .replace(
        getHashDefinition,
        `var __elmTestHashes = ${JSON.stringify(
          hashes,
          null,
          2
        )};\n$1 = name => __elmTestHashes[name]`
      )
      .replace(
        runWithDurationDefinition,
        '$1 = thunk => { var t = performance.now(); return _Utils_Tuple2(thunk(null), performance.now() - t); }'
      )
      // This optimizes a tiny bit: Instead of having a JS array, turning it into an Elm list,
      // and then encoding it back to a JS array again, we just wrap the original array.
      .replace(encodeEmptyDebugLogsCall, '$1_Json_wrap([])')
      .replace(encodeDebugLogsCall, '$1(_Json_wrap(')
  );
}

/**
 * @param { string } generatedCodeDir
 * @returns { string }
 */
function getGeneratedSrcDir(generatedCodeDir) {
  return path.join(generatedCodeDir, 'src');
}

/**
 * @param { import('./DependencyProvider').DependencyProviderType } dependencyProvider
 * @param { import('./Project').Project } project
 * @returns { void }
 */
function generateElmJson(dependencyProvider, project) {
  const generatedSrc = getGeneratedSrcDir(project.generatedCodeDir);

  fs.mkdirSync(generatedSrc, { recursive: true });

  const sourceDirs = [
    // Include the generated test application.
    generatedSrc,

    // NOTE: we must include node-test-runner's Elm source as a source-directory
    // instead of adding it as a dependency so that it can include port modules
    path.join(__dirname, '..', 'elm', 'src'),
  ]
    .concat(project.testsSourceDirs)
    .filter(
      // When running node-test-runner's own test suite, the node-test-runner/src folder
      // will get added twice: once because it's the source-directory of the packge being tested,
      // and once because elm-test will always add it.
      // To prevent elm from being confused, we need to remove the duplicate when this happens.
      (value, index, self) => self.indexOf(value) === index
    )
    .map((absolutePath) =>
      // Relative paths have the nice benefit that if the user moves their
      // directory, this doesn't break.
      path.relative(project.generatedCodeDir, absolutePath)
    );

  const testElmJson = {
    type: 'application',
    'source-directories': sourceDirs,
    'elm-version': '0.19.2',
    dependencies: Solve.getDependenciesCached(dependencyProvider, project),
    'test-dependencies': {
      direct: {},
      indirect: {},
    },
  };

  // Generate the new elm.json, if necessary.
  const generatedContents = JSON.stringify(testElmJson, null, 4);
  const generatedPath = ElmJson.getPath(project.generatedCodeDir);

  // Don't write a fresh elm.json if it's going to be the same. If we do,
  // it will update the timestamp on the file, which will cause `elm make`
  // to do a bunch of unnecessary work.
  if (
    !fs.existsSync(generatedPath) ||
    generatedContents !== fs.readFileSync(generatedPath, 'utf8')
  ) {
    // package projects don't explicitly list their transitive dependencies,
    // to we have to figure out what they are.  We write the elm.json that
    // we have so far, and run elm to see what it thinks is missing.
    fs.writeFileSync(generatedPath, generatedContents);
  }
}

const mainModuleName = ['Test', 'Generated', 'Main'];
const previousRunModuleName = ['Test', 'Generated', 'PreviousRun'];

/**
 * @typedef { {
    moduleName: string,
    path: string,
  } } Module
 *
 * @param { string } generatedCodeDir
 * @param { Array<string> } moduleName
 * @returns { Module }
 */
function getModule(generatedCodeDir, moduleName) {
  return {
    moduleName: moduleName.join('.'),
    path:
      // We'll be putting the generated Main in something like this:
      //
      // my-project-name/elm-stuff/generated-code/elm-community/elm-test/0.19.2-X/src/Test/Generated/Main.elm
      path.join(getGeneratedSrcDir(generatedCodeDir), ...moduleName) + '.elm',
  };
}

/**
 * @param { number } fuzz
 * @param { number | null } seed
 * @param { import('./Report').Report } report
 * @param { Array<string> } testFileGlobs
 * @param { Array<string> } testFilePaths
 * @param { Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> } testModules
 * @param { Module } mainModule
 * @returns { void }
 */
function generateMainModule(
  fuzz,
  seed,
  report,
  testFileGlobs,
  testFilePaths,
  testModules,
  mainModule
) {
  const testFileBody = makeTestFileBody(
    testModules,
    makeOptsCode(fuzz, seed, report, testFileGlobs, testFilePaths)
  );

  const testFileContents = `module ${mainModule.moduleName} exposing (main)\n\n${testFileBody}`;

  fs.mkdirSync(path.dirname(mainModule.path), { recursive: true });

  fs.writeFileSync(mainModule.path, testFileContents);
}

/**
 * @param { Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> } testModules
 * @param { string } optsCode
 * @returns { string }
 */
function makeTestFileBody(testModules, optsCode) {
  const imports = testModules.map((mod) => `import ${mod.moduleName}`);

  const possiblyTestsList = makeList(testModules.map(makeModuleTuple));

  return `
${imports.join('\n')}

import Dict
import Test.Reporter.Reporter exposing (Report(..))
import Console.Text exposing (UseColor(..))
import Test.Runner.Node
import Test
import ${previousRunModuleName.join('.')}

main : Test.Runner.Node.TestProgram
main =
    Test.Runner.Node.run
        ${indentAllButFirstLine('        ', optsCode)}
        ${indentAllButFirstLine('        ', possiblyTestsList)}
  `.trim();
}

/**
 * @param { {
    moduleName: string,
    possiblyTests: Array<string>,
  } } mod
 * @returns { string }
 */
function makeModuleTuple(mod) {
  const list = mod.possiblyTests.map((test) => {
    const name = toCompiledJavaScriptName(mod.moduleName, test);
    return `Test.Runner.Node.checkTagged ${mod.moduleName}.${test} "${name}"`;
  });

  return `
( "${mod.moduleName}"
, ${indentAllButFirstLine('  ', makeList(list))}
)
  `.trim();
}

/**
 * @param { Array<string> } parts
 * @returns { string }
 */
function makeList(parts) {
  if (parts.length === 0) {
    return '[]';
  }

  const list = parts.map(
    (part, index) =>
      `${index === 0 ? '' : ', '}${indentAllButFirstLine('  ', part)}`
  );

  return `
[ ${list.join('\n')}
]
  `.trim();
}

/**
 * @param { string } indent
 * @param { string } string
 * @returns { string }
 */
function indentAllButFirstLine(indent, string) {
  return string
    .split('\n')
    .map((line, index) => (index === 0 ? line : indent + line))
    .join('\n');
}

/**
 * @param { number } fuzz
 * @param { number | null } seed
 * @param { import('./Report').Report } report
 * @param { Array<string> } testFileGlobs
 * @param { Array<string> } testFilePaths
 * @returns { string }
 */
function makeOptsCode(fuzz, seed, report, testFileGlobs, testFilePaths) {
  return `
{ runs = ${fuzz}
, report = ${generateElmReportVariant(report)}
, seed = ${
    seed === null
      ? `Test.Runner.Node.RandomSeed ${makeRandomSeed()}`
      : `Test.Runner.Node.UserSuppliedSeed ${seed}`
  }
, previousRun = ${previousRunModuleName.join('.')}.previousRun
, globs =
    ${indentAllButFirstLine('    ', makeList(testFileGlobs.map(makeElmString)))}
, paths =
    ${indentAllButFirstLine('    ', makeList(testFilePaths.map(makeElmString)))}
}
  `.trim();
}

/**
 * This will be passed to `Random.initialSeed`, which calls:
 * `Bitwise.shiftRightZfBy 0 (incr + seed)` where `seed` is
 * our number and `incr` is a constant. `Bitwise.shiftRightZfBy 0`
 * is basically the same as as `modBy 0x100000000`. `incr` just shifts
 * the numbers, it doesn’t affect how many different seeds there can be.
 * In other words, there is no reason to pass a number higher than
 * or equal to 0x100000000: After that we are just repeating seeds
 * and have to be careful to not make some seeds more likely than others.
 *
 * @returns { number }
 */
function makeRandomSeed() {
  return Math.floor(Math.random() * 0x100000000);
}

/**
 * @param { import('./Report').Report } report
 * @returns { string }
 */
function generateElmReportVariant(report) {
  switch (report) {
    case 'json':
      return 'JsonReport';
    case 'junit':
      return 'JUnitReport';
    case 'console':
      if (supportsColor) {
        return 'ConsoleReport UseColor';
      } else {
        return 'ConsoleReport Monochrome';
      }
  }
}

/**
 * @param { string } string
 * @returns { string }
 */
function makeElmString(string) {
  return `"${string
    .replace(/[\\"]/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}"`;
}

/**
 * @param { Module } previousRunModule
 * @returns { void }
 */
function ensurePreviousRunModule(previousRunModule) {
  if (fs.existsSync(previousRunModule.path)) {
    return;
  }
  generatePreviousRunModule(previousRunModule, {
    fuzzRuns: -1,
    initialSeed: -1,
    cachedTests: {},
  });
}

/**
 * @typedef { {
    fuzzRuns: number,
    initialSeed: number,
    cachedTests: Record<string, CachedTests>
  } } PreviousRun
 *
 * @typedef { {
    hash: string,
    isActuallyTest: boolean,
    unitTests: Array<{ labels: Array<string>, expectation: string, debugLogs: Array<string> }>,
    fuzzTests: Array<{ labels: Array<string>, expectation: string, debugLogs: Array<string> }>,
  } } CachedTests
 *
 * @param { Module } previousRunModule
 * @param { PreviousRun } previousRun
 * @returns { void }
 */
function generatePreviousRunModule(previousRunModule, previousRun) {
  /**
   * @param { { labels: Array<string>, expectation: string, debugLogs: Array<string> } } data
   * @returns
   */
  const toTuple = ({ labels, expectation, debugLogs }) =>
    `
( ${indentAllButFirstLine('  ', makeList(labels.map(makeElmString)))}
, ( ${expectation}
  , encodeDebugLogs
    ${indentAllButFirstLine('    ', makeList(debugLogs.map(makeElmString)))}
  )
)
        `.trim();

  const cachedTestsList = makeList(
    Object.entries(previousRun.cachedTests)
      .filter(([, { isActuallyTest }]) => isActuallyTest)
      .map(([jsIdentifierName, { hash, unitTests, fuzzTests }]) =>
        `
( ${makeElmString(jsIdentifierName)}
, { hash = ${makeElmString(hash)}
  , unitTests =
      Dict.fromList
          ${indentAllButFirstLine(
            '          ',
            makeList(unitTests.map(toTuple))
          )}
  , fuzzTests =
      Dict.fromList
          ${indentAllButFirstLine(
            '          ',
            makeList(fuzzTests.map(toTuple))
          )}
  }
)
      `.trim()
      )
  );

  const fileContents = `
module ${previousRunModule.moduleName} exposing (previousRun)

import Dict
import Json.Encode
import Test.Distribution exposing (DistributionReport(..))
import Test.Runner exposing (UnitTestExpectation(..))
import Test.Runner.Failure exposing (Reason(..), InvalidReason(..))
import Test.Runner.Node exposing (CachedFuzzTestExpectation(..))


encodeDebugLogs : List String -> Json.Encode.Value
encodeDebugLogs =
    Json.Encode.list Json.Encode.string


previousRun : Test.Runner.Node.PreviousRun
previousRun =
    { fuzzRuns = ${previousRun.fuzzRuns}
    , initialSeed = ${previousRun.initialSeed}
    , cachedTests =
        Dict.fromList
            ${indentAllButFirstLine('            ', cachedTestsList)}
    }
  `.trim();

  fs.mkdirSync(path.dirname(previousRunModule.path), { recursive: true });

  fs.writeFileSync(previousRunModule.path, fileContents);
}

module.exports = {
  ensurePreviousRunModule,
  generateElmJson,
  generateMainModule,
  generatePreviousRunModule,
  getModule,
  mainModuleName,
  prepareCompiledJsFile,
  previousRunModuleName,
};
