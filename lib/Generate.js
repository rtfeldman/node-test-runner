// @flow

const { supportsColor } = require('chalk');
const fs = require('fs');
const Murmur = require('murmur-hash-js');
const path = require('path');
const Compile = require('./Compile.js');
const Solve = require('./Solve.js');
const Report = require('./Report.js');

void Report;

const before = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'before.js'),
  'utf8'
);

const after = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'after.js'),
  'utf8'
);

function prepareCompiledJsFile(
  pipeFilename /*: string */,
  dest /*: string */
) /*: void */ {
  const content = fs.readFileSync(dest, 'utf8');
  const finalContent = `
${before}
var Elm = (function(module) {
${addKernelTestChecking(content)}
return this.Elm;
})({});
var pipeFilename = ${JSON.stringify(pipeFilename)};
${after}
  `.trim();
  fs.writeFileSync(dest, finalContent);
}

// For older versions of elm-explorations/test we need to list every single
// variant of the `Test` type. To avoid having to update this regex if a new
// variant is added, newer versions of elm-explorations/test have prefixed all
// variants with `ElmTestVariant__` so we can match just on that.
const testVariantDefinition = /^var\s+\$elm_explorations\$test\$Test\$Internal\$(?:ElmTestVariant__\w+|UnitTest|FuzzTest|Labeled|Skipped|Only|Batch)\s*=\s*(?:\w+\(\s*)?function\s*\([\w, ]*\)\s*\{\s*return *\{/gm;

const checkDefinition = /^(var\s+\$author\$project\$Test\$Runner\$Node\$check)\s*=\s*\$author\$project\$Test\$Runner\$Node\$checkHelperReplaceMe___;?$/m;

// Create a symbol, tag all `Test` constructors with it and make the `check`
// function look for it.
function addKernelTestChecking(content) {
  return (
    'var __elmTestSymbol = Symbol("elmTestSymbol");\n' +
    content
      .replace(testVariantDefinition, '$&__elmTestSymbol: __elmTestSymbol, ')
      .replace(
        checkDefinition,
        '$1 = value => value && value.__elmTestSymbol === __elmTestSymbol ? $elm$core$Maybe$Just(value) : $elm$core$Maybe$Nothing;'
      )
  );
}

function generateElmJson(
  projectRootDir /*: string */,
  generatedCodeDir /*: string */,
  projectElmJson /*: any */
) /*: [string, Array<string>] */ {
  const testRootDir = path.join(projectRootDir, 'tests');
  const generatedSrc = path.join(generatedCodeDir, 'src');

  var isPackageProject = projectElmJson.type === 'package';

  const shouldAddTestsDirAsSource = fs.existsSync(
    path.join(projectRootDir, 'tests')
  );

  fs.mkdirSync(generatedCodeDir, { recursive: true });
  fs.mkdirSync(generatedSrc, { recursive: true });

  let testElmJson = {
    type: 'application',
    'source-directories': [], // these are added below
    'elm-version': '0.19.1',
    dependencies: Solve.getDependenciesCached(
      generatedCodeDir,
      path.join(projectRootDir, 'elm.json'),
      projectElmJson
    ),
    'test-dependencies': {
      direct: {},
      indirect: {},
    },
  };

  // Make all the source-directories absolute, and introduce a new one.
  var projectSourceDirs;
  if (isPackageProject) {
    projectSourceDirs = ['./src'];
  } else {
    projectSourceDirs = projectElmJson['source-directories'];
  }
  var sourceDirs /*: Array<string> */ = projectSourceDirs
    .map((src) => path.join(projectRootDir, src))
    .concat(shouldAddTestsDirAsSource ? [testRootDir] : []);

  testElmJson['source-directories'] = [
    // Include elm-stuff/generated-sources - since we'll be generating sources in there.
    generatedSrc,

    // NOTE: we must include node-test-runner's Elm source as a source-directory
    // instead of adding it as a dependency so that it can include port modules
    path.join(__dirname, '..', 'elm', 'src'),
  ]
    .concat(sourceDirs)
    .filter(
      // When running node-test-runner's own test suite, the node-test-runner/src folder
      // will get added twice: once because it's the source-directory of the packge being tested,
      // and once because elm-test will always add it.
      // To prevent elm from being confused, we need to remove the duplicate when this happens.
      function (value, index, self) {
        return self.indexOf(value) === index;
      }
    )
    .map(function (absolutePath) {
      // Relative paths have the nice benefit that if the user moves their
      // directory, this doesn't break.
      return path.relative(generatedCodeDir, absolutePath);
    });

  // Generate the new elm.json, if necessary.
  const generatedContents = JSON.stringify(testElmJson, null, 4);
  const generatedPath = path.join(generatedCodeDir, 'elm.json');

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

  return [generatedSrc, sourceDirs];
}

function generateMainModule(
  fuzz /*: number */,
  seed /*: number */,
  report /*: typeof Report.Report */,
  testFileGlobs /*: Array<string> */,
  testFilePaths /*: Array<string> */,
  testModules /*: Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> */,
  generatedSrc /*: string */,
  processes /*: number */
) /*: string */ {
  const testFileBody = makeTestFileBody(
    testModules,
    makeOptsCode(fuzz, seed, report, testFileGlobs, testFilePaths, processes)
  );

  // Generate a filename that incorporates the hash of file contents.
  // This way, if you run e.g. `elm-test Foo.elm` and then `elm-test Bar.elm`
  // and then re-run `elm-test Foo.elm` we still have a cached `Main` for
  // `Foo.elm` (assuming none of its necessary imports have changed - and
  // why would they?) so we don't have to recompile it.
  const salt = Murmur.murmur3(testFileBody);
  const moduleName = 'Main' + salt;
  const mainPath = path.join(generatedSrc, 'Test', 'Generated');
  const mainFile = path.join(mainPath, moduleName + '.elm');

  // We'll be putting the generated Main in something like this:
  //
  // my-project-name/elm-stuff/generated-code/elm-community/elm-test/src/Test/Generated/Main123456.elm
  const testFileContents = `module Test.Generated.${moduleName} exposing (main)\n\n${testFileBody}`;

  // Make sure src/Test/Generated/ exists so we can write the file there.
  fs.mkdirSync(mainPath, { recursive: true });

  // Always write the file, in order to update its timestamp. This is important,
  // because if we run `elm-make Main123456.elm` and that file's timestamp did
  // not change, elm-make will short-circuit and not recompile *anything* - even
  // if some of Main's dependencies (such as an individual test file) changed.
  fs.writeFileSync(mainFile, testFileContents);

  return mainFile;
}

function makeTestFileBody(
  testModules /*: Array<{
    moduleName: string,
    possiblyTests: Array<string>,
  }> */,
  optsCode /*: string */
) /*: string */ {
  const imports = testModules.map((mod) => `import ${mod.moduleName}`);

  const possiblyTestsList = makeList(testModules.map(makeModuleTuple));

  return `
${imports.join('\n')}

import Test.Reporter.Reporter exposing (Report(..))
import Console.Text exposing (UseColor(..))
import Test.Runner.Node
import Test

main : Test.Runner.Node.TestProgram
main =
    Test.Runner.Node.run
        ${indentAllButFirstLine('        ', optsCode)}
        ${indentAllButFirstLine('        ', possiblyTestsList)}
  `.trim();
}

function makeModuleTuple(mod /*: {
  moduleName: string,
  possiblyTests: Array<string>,
} */) /*: string */ {
  const list = mod.possiblyTests.map(
    (test) => `Test.Runner.Node.check ${mod.moduleName}.${test}`
  );

  return `
( "${mod.moduleName}"
, ${indentAllButFirstLine('  ', makeList(list))}
)
  `.trim();
}

function makeList(parts /*: Array<string> */) /*: string */ {
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

function indentAllButFirstLine(indent, string) {
  return string
    .split('\n')
    .map((line, index) => (index === 0 ? line : indent + line))
    .join('\n');
}

function makeOptsCode(
  fuzz /*: number */,
  seed /*: number */,
  report /*: typeof Report.Report */,
  testFileGlobs /*: Array<string> */,
  testFilePaths /*: Array<string> */,
  processes /*: number */
) /*: string */ {
  return `
{ runs = ${fuzz}
, report = ${generateElmReportVariant(report)}
, seed = ${seed}
, processes = ${processes}
, globs =
    ${indentAllButFirstLine('    ', makeList(testFileGlobs.map(makeElmString)))}
, paths =
    ${indentAllButFirstLine('    ', makeList(testFilePaths.map(makeElmString)))}
}
  `.trim();
}

function generateElmReportVariant(
  report /*: typeof Report.Report */
) /*: string */ {
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

function makeElmString(string) {
  return `"${string
    .replace(/[\\"]/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}"`;
}

module.exports = { prepareCompiledJsFile, generateElmJson, generateMainModule };
