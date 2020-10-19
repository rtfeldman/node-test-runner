// @flow

const path = require('path'),
  fs = require('fs-extra'),
  Murmur = require('murmur-hash-js'),
  Solve = require('./Solve.js'),
  Compile = require('./Compile.js'),
  supportsColor = require('chalk').supportsColor;

function prepareCompiledJsFile(
  pipeFilename /*: string */,
  dest /*: string */
) /*: Promise<void> */ {
  return Promise.all([
    readUtf8(path.join(__dirname, '..', 'templates', 'before.js')),
    readUtf8(dest),
    readUtf8(path.join(__dirname, '..', 'templates', 'after.js')),
  ]).then(([before, content, after]) => {
    return new Promise((resolve, reject) => {
      const finalContent = [
        before,
        'var Elm = (function(module) {',
        hackCompiledElmJs(content),
        'return this.Elm;',
        '})({});',
        'var pipeFilename = ' + JSON.stringify(pipeFilename) + ';',
        after,
      ].join('\n');
      return fs.writeFile(dest, finalContent, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

const testVariantDefinition = /^var\s+\$elm_explorations\$test\$Test\$Internal\$(ElmTestVariant__\w+|UnitTest|FuzzTest|Labeled|Skipped|Only|Batch)\s*=\s*(?:\w+\(\s*)?function\s*\([\w, ]*\)\s*\{\s*return *\{\s*\$:\s*(['"])\1\2/gm;

const checkDefinition = /^(var\s+\$author\$project\$Test\$Runner\$Node\$check\s*=\s*function\s*\(value\)\s*\{\s*)return +_Debug_todo\(.*\n(?:[ \t]+.*\n)+^\}/m;

function hackCompiledElmJs(content) {
  return (
    'var __elmTestSymbol = Symbol("elmTestSymbol");\n' +
    content
      .replace(testVariantDefinition, '$&, __elmTestSymbol: __elmTestSymbol')
      .replace(
        checkDefinition,
        '$1return value && value.__elmTestSymbol === __elmTestSymbol ? $elm$core$Maybe$Just(value) : $elm$core$Maybe$Nothing;\n}'
      )
  );
}

function readUtf8(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, { encoding: 'utf8' }, (err, contents) => {
      if (err) {
        reject(err);
      } else {
        resolve(contents);
      }
    });
  });
}

function generateElmJson(
  projectRootDir /*: string */,
  generatedCodeDir /*: string */,
  hasBeenGivenCustomGlobs /*: boolean */,
  elmJsonPath /*: string */,
  projectElmJson /*: any */
) /*: [string, Array<string>] */ {
  const testRootDir = Compile.getTestRootDir(projectRootDir);
  const generatedSrc = path.join(generatedCodeDir, 'src');

  var isPackageProject = projectElmJson.type === 'package';

  // if we were given file globs, we don't need to check the tests/ directory exists
  // this is only for elm applications, which people may need to introduce slowly into their apps
  // for packages, we stick with the existing behaviour and assume tests are in tests/ so do the check always
  const needToCareAboutTestsDir =
    hasBeenGivenCustomGlobs === false || isPackageProject === true;

  // we add the tests dir as a source if:
  // - we decided above we need to care about it
  // - if it exists on disk: this supports the case where we have all our tests in tests/ but
  //   want to pass a glob to only run one of the test files
  const shouldAddTestsDirAsSource =
    needToCareAboutTestsDir ||
    fs.existsSync(path.join(projectRootDir, 'tests'));

  if (needToCareAboutTestsDir) {
    if (!fs.existsSync(testRootDir)) {
      console.error(
        'Error: ' +
          testRootDir +
          ' does not exist. Please create a tests/ directory in your project root!'
      );
      process.exit(1);
    }

    if (!fs.lstatSync(testRootDir).isDirectory()) {
      console.error(
        'Error: ' +
          testRootDir +
          ' exists, but it is not a directory. Please create a tests/ directory in your project root!'
      );
      process.exit(1);
    }
  }

  fs.mkdirpSync(generatedCodeDir);
  fs.mkdirpSync(generatedSrc);

  var projectSourceDirs = isPackageProject
    ? ['./src']
    : projectElmJson['source-directories'];

  // Make all the source-directories absolute, and introduce a new one.
  var sourceDirs /*: Array<string> */ = projectSourceDirs
    .map(function (src) {
      return path.resolve(path.join(projectRootDir, src));
    })
    .concat(shouldAddTestsDirAsSource ? [testRootDir] : []);

  var allSourceDirs = [
    // Include elm-stuff/generated-sources - since we'll be generating sources in there.
    generatedSrc,

    // NOTE: we must include node-test-runner's Elm source as a source-directory
    // instead of adding it as a dependency so that it can include port modules
    path.resolve(path.join(__dirname, '..', 'elm', 'src')),
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

  let testElmJsonTemplate = {
    type: 'application',
    'source-directories': allSourceDirs,
    'elm-version': '0.19.1',
    // All dependencies will be replaced with resolved ones below.
    dependencies: projectElmJson.dependencies,
    'test-dependencies': projectElmJson['test-dependencies'],
  };

  const generatedPath = path.join(generatedCodeDir, 'elm.json');
  const templatePath = path.join(generatedCodeDir, 'elm.template.json');
  const templateElmJsonString = JSON.stringify(testElmJsonTemplate, null, 4);

  try {
    if (
      // If the elm.json we are creating already exists…
      fs.existsSync(generatedPath) &&
      // …and its template hasn’t changed…
      fs.readFileSync(templatePath, 'utf8') === templateElmJsonString
    ) {
      // …then just return early and go with the generated elm.json we already have.
      // This avoids calculating exact dependencies again and saves a second or so.
      return [generatedSrc, sourceDirs];
    }
  } catch (_error) {
    // No template file since before, moving on.
  }

  let testElmJson = {
    ...testElmJsonTemplate,
    dependencies: Solve.getDependencies(elmJsonPath, projectElmJson),
    'test-dependencies': {
      direct: {},
      indirect: {},
    },
  };

  // Generate the new elm.json, if necessary.
  const generatedContents = JSON.stringify(testElmJson, null, 4);

  // Don't write a fresh elm.json if it's going to be the same. If we do,
  // it will update the timestamp on the file, which will cause `elm make`
  // to do a bunch of unnecessary work.
  if (
    !fs.existsSync(generatedPath) ||
    generatedContents !== fs.readFileSync(generatedPath, 'utf8')
  ) {
    fs.writeFileSync(generatedPath, generatedContents);
  }

  // Write the template elm.json so we can find it the next time we build.
  fs.writeFileSync(templatePath, templateElmJsonString);

  return [generatedSrc, sourceDirs];
}

function generateMainModule(
  fuzz /*: number */,
  seed /*: number */,
  report /*: string */,
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
  fs.mkdirpSync(mainPath);

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
  report /*: string */,
  testFileGlobs /*: Array<string> */,
  testFilePaths /*: Array<string> */,
  processes /*: number */
) /*: string */ {
  // TODO: CLI args should be parsed, validated and defaulted properly in elm-test.js.
  const finalSeed = isNaN(seed)
    ? Math.floor(Math.random() * 407199254740991) + 1000
    : seed;

  return `
{ runs = ${isNaN(fuzz) ? 'Nothing' : `Just ${fuzz}`}
, report = ${makeReportCode(report)}
, seed = ${finalSeed}
, processes = ${processes}
, globs =
    ${indentAllButFirstLine('    ', makeList(testFileGlobs.map(makeElmString)))}
, paths =
    ${indentAllButFirstLine('    ', makeList(testFilePaths.map(makeElmString)))}
}
  `.trim();
}

function makeReportCode(report) {
  switch (report) {
    case 'json':
      return 'JsonReport';
    case 'junit':
      return 'JUnitReport';
    default:
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
