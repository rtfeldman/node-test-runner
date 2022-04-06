// @flow

const { supportsColor } = require('chalk');
const fs = require('fs');
const path = require('path');
const DependencyProvider = require('./DependencyProvider.js');
const ElmJson = require('./ElmJson');
const Project = require('./Project');
const Report = require('./Report');
const Solve = require('./Solve');

// These values are used _only_ in flow types. 'use' them with the javascript
// void operator to keep eslint happy.
void DependencyProvider;
void Project;
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

  // Needed when the user has `"type": "module"` in their package.json.
  // Our output is CommonJS.
  fs.writeFileSync(
    path.join(path.dirname(dest), 'package.json'),
    JSON.stringify({ type: 'commonjs' })
  );
}

// For older versions of elm-explorations/test we need to list every single
// variant of the `Test` type. To avoid having to update this regex if a new
// variant is added, newer versions of elm-explorations/test have prefixed all
// variants with `ElmTestVariant__` so we can match just on that.
const testVariantDefinition =
  /^var\s+\$elm_explorations\$test\$Test\$Internal\$(?:ElmTestVariant__\w+|UnitTest|FuzzTest|Labeled|Skipped|Only|Batch)\s*=\s*(?:\w+\(\s*)?function\s*\([\w, ]*\)\s*\{\s*return *\{/gm;

const checkDefinition =
  /^(var\s+\$author\$project\$Test\$Runner\$Node\$check)\s*=\s*\$author\$project\$Test\$Runner\$Node\$checkHelperReplaceMe___;?$/m;

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

function getGeneratedSrcDir(generatedCodeDir /*: string */) /*: string */ {
  return path.join(generatedCodeDir, 'src');
}

function generateElmJson(
  dependencyProvider /*: DependencyProvider */,
  project /*: typeof Project.Project */
) /*: void */ {
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
    'elm-version': '0.19.1',
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

function getMainModule(generatedCodeDir /*: string */) /*: {
  moduleName: string,
  path: string,
} */ {
  const moduleName = ['Test', 'Generated', 'Main'];
  return {
    moduleName: moduleName.join('.'),
    path:
      // We'll be putting the generated Main in something like this:
      //
      // my-project-name/elm-stuff/generated-code/elm-community/elm-test/0.19.1-revisionX/src/Test/Generated/Main.elm
      path.join(getGeneratedSrcDir(generatedCodeDir), ...moduleName) + '.elm',
  };
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
  mainModule /*: { moduleName: string, path: string } */,
  processes /*: number */
) /*: void */ {
  const testFileBody = makeTestFileBody(
    testModules,
    makeOptsCode(fuzz, seed, report, testFileGlobs, testFilePaths, processes)
  );

  const testFileContents = `module ${mainModule.moduleName} exposing (main)\n\n${testFileBody}`;

  fs.mkdirSync(path.dirname(mainModule.path), { recursive: true });

  fs.writeFileSync(mainModule.path, testFileContents);
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

module.exports = {
  generateElmJson,
  generateMainModule,
  getMainModule,
  prepareCompiledJsFile,
};
