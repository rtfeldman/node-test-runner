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
 * @returns { Record<string, string> }
 */
function prepareCompiledJsFile(testModules, pipeFilename, dest) {
  const content = fs.readFileSync(dest, 'utf8');

  const names = testModules.flatMap((mod) =>
    mod.possiblyTests.map((test) =>
      toCompiledJavaScriptName(mod.moduleName, test)
    )
  );

  const hashes = Hash.calculateHashes(names, content);

  const finalContent = `
${before}
var Elm = (function(module) {
${addKernelTestChecking(hashes, content)}
return this.Elm;
})({});
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

// For older versions of elm-explorations/test we need to list every single
// variant of the `Test` type. To avoid having to update this regex if a new
// variant is added, newer versions of elm-explorations/test have prefixed all
// variants with `ElmTestVariant__` so we can match just on that.
// `\$?` is for the Lamdera compiler, where definitions sometimes end with a `$`.
// See https://github.com/lamdera/compiler/pull/41#issuecomment-2725158568
const testVariantDefinition =
  /^var\s+\$elm_explorations\$test\$Test\$Internal\$(?:ElmTestVariant__\w+|UnitTest|FuzzTest|Labeled|Skipped|Only|Batch)\$?\s*=\s*(?:\w+\(\s*)?function\s*\([\w, ]*\)\s*\{\s*return *\{/gm;

const checkDefinition =
  /^(var\s+\$author\$project\$Test\$Runner\$Node\$check)\s*=\s*\$author\$project\$Test\$Runner\$Node\$checkHelperReplaceMe___;?$/m;

const detectFuzzTestDefinition =
  /^(var\s+\$author\$project\$Test\$Runner\$Node\$detectFuzzTest)\s*=\s*\$author\$project\$Test\$Runner\$Node\$detectFuzzTestHelperReplaceMe___;?$/m;

// For the identifier, this uses the same regex as `REFERENCES_REGEX` in `Hash.js`.
const hashPlaceholder = /__elm_test_hash__:([$_][$\w\u0080-\uffff]+)/g;

/**
 * @param { string } name
 * @returns { string }
 */
function makeHashPlaceholder(name) {
  return `__elm_test_hash__:${name}`;
}

/**
 * @param { string } moduleName
 * @param { string } valueName
 * @returns { string }
 */
function toCompiledJavaScriptName(moduleName, valueName) {
  return `$author$project$${moduleName.replace(/\./g, '$')}$${valueName}`;
}

/**
 * Create a symbol, tag all `Test` constructors with it and make the `check`
 * function look for it.
 *
 * @param { Record<string, string> } hashes
 * @param { string } content
 * @returns { string }
 */
function addKernelTestChecking(hashes, content) {
  return (
    'var __elmTestSymbol = Symbol("elmTestSymbol");\n' +
    content
      .replace(testVariantDefinition, '$&__elmTestSymbol: __elmTestSymbol, ')
      .replace(
        checkDefinition,
        `
function _getElmTestLabel(test) {
  while (typeof test.a !== "string" && typeof test.a !== undefined) {
    test = test.a;
  }
  return test.a || "";
}
$1 = F3((test, jsDefinitionName, hash) =>
  test && test.__elmTestSymbol === __elmTestSymbol
    ? $elm$core$Maybe$Just({ test, jsDefinitionName, hash, label: _getElmTestLabel(test) })
    : $elm$core$Maybe$Nothing
);
`.trim()
      )
      .replace(
        detectFuzzTestDefinition,
        `
var _elmTestIsFuzzTest = false;
var $elm_explorations$test$Test$Fuzz$fuzzLoop_elmTestOriginal = $elm_explorations$test$Test$Fuzz$fuzzLoop;
$elm_explorations$test$Test$Fuzz$fuzzLoop = F2(function (c, state) {
  _elmTestIsFuzzTest = true;
  return A2($elm_explorations$test$Test$Fuzz$fuzzLoop_elmTestOriginal, c, state);
});
$1 = (f) => {
  _elmTestIsFuzzTest = false;
  return _Utils_Tuple2(f(null), _elmTestIsFuzzTest);
}
`.trim()
      )
      .replace(hashPlaceholder, (_match, name) => hashes[name])
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
 * @param { number } seed
 * @param { import('./Report').Report } report
 * @param { Array<string> } testFileGlobs
 * @param { Array<string> } testFilePaths
 * @param { Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> } testModules
 * @param { Module } mainModule
 * @param { number } processes
 * @returns { void }
 */
function generateMainModule(
  fuzz,
  seed,
  report,
  testFileGlobs,
  testFilePaths,
  testModules,
  mainModule,
  processes
) {
  const testFileBody = makeTestFileBody(
    testModules,
    makeOptsCode(fuzz, seed, report, testFileGlobs, testFilePaths, processes)
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
    const newHash = makeHashPlaceholder(name);
    return `Test.Runner.Node.check ${mod.moduleName}.${test} "${name}" "${newHash}"`;
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
 * @param { number } seed
 * @param { import('./Report').Report } report
 * @param { Array<string> } testFileGlobs
 * @param { Array<string> } testFilePaths
 * @param { number } processes
 * @returns { string }
 */
function makeOptsCode(
  fuzz,
  seed,
  report,
  testFileGlobs,
  testFilePaths,
  processes
) {
  return `
{ runs = ${fuzz}
, report = ${generateElmReportVariant(report)}
, seed = ${seed}
, processes = ${processes}
, previousRun = ${previousRunModuleName.join('.')}.previousRun
, globs =
    ${indentAllButFirstLine('    ', makeList(testFileGlobs.map(makeElmString)))}
, paths =
    ${indentAllButFirstLine('    ', makeList(testFilePaths.map(makeElmString)))}
}
  `.trim();
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
    fingerprints: {},
  });
}

/**
 * @typedef { {
    fuzzRuns: number,
    initialSeed: number,
    fingerprints: Record<string, { hash: string, outcomes: Array<string> }>
  } } PreviousRun
 *
 * @param { Module } previousRunModule
 * @param { PreviousRun } previousRun
 * @returns { void }
 */
function generatePreviousRunModule(previousRunModule, previousRun) {
  const fingerprintsList = makeList(
    Object.entries(previousRun.fingerprints).map(
      ([jsIdentifierName, { hash, outcomes }]) =>
        `
( ${makeElmString(jsIdentifierName)}
, { hash = ${makeElmString(hash)}
  , outcomes =
      Dict.fromList
          ${indentAllButFirstLine('          ', makeList(outcomes))}
  }
)
      `.trim()
    )
  );

  const fileContents = `
module ${previousRunModule.moduleName} exposing (previousRun)

import Dict
import Test.Runner.Node

previousRun : Test.Runner.Node.PreviousRun
previousRun =
    { fuzzRuns = ${previousRun.fuzzRuns}
    , initialSeed = ${previousRun.initialSeed}
    , fingerprints =
        Dict.fromList
            ${indentAllButFirstLine('            ', fingerprintsList)}
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
