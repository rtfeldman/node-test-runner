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

  // elm-explorations/test reads `globalThis.elmTestPrintDebugLogsBeforeFirstTestToConsole`
  // to decide if debug logs that happen before the first test runs should print to the
  // console or be collected.
  const finalContent = `
${before}
globalThis.elmTestPrintDebugLogsBeforeFirstTestToConsole = ${JSON.stringify(
    unbufferedLogs
  )};
var Elm = (function() {
${patch(hashes, content)}
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

const getHashDefinition =
  '\nvar $author$project$Test$Runner$Node$getHash = $author$project$Test$Runner$Node$placeholderReplaceMe___;';

const getHashReplacement =
  '\nvar $author$project$Test$Runner$Node$getHash = function(name) { return __elmTestHashes[name]; };';

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
 * - Silence `console.warn('Compiled in DEV mode. ...')`. The call is near the top of the file,
 *   and the first usage of `console.warn`.
 * - Insert hashes and make `Test.Runner.Node.getHash` read from it.
 *
 * @param { Record<string, string> } hashes
 * @param { string } content
 * @returns { string }
 */
function patch(hashes, content) {
  return (
    content
      // Simply remove the first occurrence of `console.warn`. This leaves the message string in parentheses behind, but that’s fine.
      .replace('console.warn', '')
      .replace(
        getHashDefinition,
        `\nvar __elmTestHashes = ${JSON.stringify(
          hashes,
          null,
          2
        )};${getHashReplacement}`
      )
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
 * @param { import('./DependencyProvider').PackageStrategy } packageStrategy
 * @param { import('./Project').Project } project
 * @param { boolean } offline
 * @param { () => void } onBeforeSolve
 * @returns { void }
 */
function generateElmJson(
  dependencyProvider,
  packageStrategy,
  project,
  offline,
  onBeforeSolve
) {
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
    dependencies: Solve.getDependenciesCached(
      dependencyProvider,
      packageStrategy,
      project,
      offline,
      onBeforeSolve
    ),
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
 * @param { boolean } unbufferedLogs
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
  unbufferedLogs,
  testFileGlobs,
  testFilePaths,
  testModules,
  mainModule
) {
  const testFileBody = makeTestFileBody(
    testModules,
    makeOptsCode(
      fuzz,
      seed,
      report,
      unbufferedLogs,
      testFileGlobs,
      testFilePaths
    )
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
 * @param { boolean } unbufferedLogs
 * @param { Array<string> } testFileGlobs
 * @param { Array<string> } testFilePaths
 * @returns { string }
 */
function makeOptsCode(
  fuzz,
  seed,
  report,
  unbufferedLogs,
  testFileGlobs,
  testFilePaths
) {
  return `
{ runs = ${fuzz}
, report = ${generateElmReportVariant(report)}
, seed = ${seed === null ? makeRandomSeed() : seed}
, seedIsUserSupplied = ${makeElmBoolean(seed !== null)}
, unbufferedLogs = ${makeElmBoolean(unbufferedLogs)}
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
 * @param { boolean } boolean
 * @returns { string }
 */
function makeElmBoolean(boolean) {
  return boolean ? 'True' : 'False';
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
    unitTests: Array<{ labels: Array<string>, expectation: string, bufferedDebugLogs: string }>,
    fuzzTests: Array<{ labels: Array<string>, expectation: string, bufferedDebugLogs: string }>,
  } } CachedTests
 *
 * @param { Module } previousRunModule
 * @param { PreviousRun } previousRun
 * @returns { void }
 */
function generatePreviousRunModule(previousRunModule, previousRun) {
  /**
   * @param { { labels: Array<string>, expectation: string, bufferedDebugLogs: string } } data
   * @returns
   */
  const toTuple = ({ labels, expectation, bufferedDebugLogs }) =>
    `
( ${indentAllButFirstLine('  ', makeList(labels.map(makeElmString)))}
, ( ${expectation}
  , ${makeElmString(bufferedDebugLogs)}
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
import Test.Distribution exposing (DistributionReport(..))
import Test.Runner.Failure exposing (Reason(..), InvalidReason(..))
import Test.Runner.Node exposing (CachedFuzzTestExpectation(..), CachedUnitTestExpectation(..))


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

  // Write to a temporary file and then rename it atomically to the actual path.
  // This avoids ending up with an empty file is elm-test is killed right between
  // the file is truncated and written to. The tests sometimes failed due to this.
  const tempPath = previousRunModule.path + '.tmp';
  fs.writeFileSync(tempPath, fileContents);
  fs.renameSync(tempPath, previousRunModule.path);
}

module.exports = {
  ensurePreviousRunModule: ensurePreviousRunModule,
  generateElmJson: generateElmJson,
  generateMainModule: generateMainModule,
  generatePreviousRunModule: generatePreviousRunModule,
  getModule: getModule,
  mainModuleName: mainModuleName,
  prepareCompiledJsFile: prepareCompiledJsFile,
  previousRunModuleName: previousRunModuleName,
};
