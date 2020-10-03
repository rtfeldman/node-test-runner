// @flow

const path = require('path'),
  fs = require('fs-extra'),
  Murmur = require('murmur-hash-js'),
  Version = require('./version.js'),
  Compile = require('./Compile.js'),
  supportsColor = require('chalk').supportsColor;

function prepareCompiledJsFile(pipeFilename /*: string */, dest /*: string */) {
  return Promise.all([
    readUtf8(path.join(__dirname, '..', 'templates', 'before.js')),
    readUtf8(dest),
    readUtf8(path.join(__dirname, '..', 'templates', 'after.js')),
  ]).then(([before, content, after]) => {
    return new Promise((resolve, reject) => {
      const finalContent = [
        before,
        'var Elm = (function(module) { ',
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

const testVariantDefinition = /^var\s+\$elm_explorations\$test\$Test\$Internal\$(ElmTestVariant__\w+|UnitTest|FuzzTest|Labeled|Skipped|Only|Batch)\s*=\s*(?:\w+\(\s*)?function\s*\([\w, ]*\)\s*\{\s*return\s*\{\s*\$:\s*(['"])\1\2/gm;

const checkDefinition = /^(var\s+\$author\$project\$Test\$Runner\$Node\$check\s*=\s*function\s*\(value\)\s*\{\s*)return\s+(\$elm\$core\$Maybe\$)Nothing;?(\s*\};?)/m;

function hackCompiledElmJs(content) {
  return (
    'var __elmTestSymbol = Symbol("elmTestSymbol");\n' +
    content
      .replace(testVariantDefinition, '$&, __elmTestSymbol: __elmTestSymbol')
      .replace(
        checkDefinition,
        '$1return value && value.__elmTestSymbol === __elmTestSymbol ? $2Just(value) : $2Nothing;$3'
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
  packageIndirectDeps /*: Object */,
  hasBeenGivenCustomGlobs /*: boolean */
) {
  const testRootDir = Compile.getTestRootDir(projectRootDir);
  const elmJsonPath = path.resolve(path.join(projectRootDir, 'elm.json'));
  const generatedSrc = path.join(generatedCodeDir, 'src');

  var projectElmJson = {};

  try {
    projectElmJson = fs.readJsonSync(elmJsonPath);
  } catch (err) {
    console.error('Error reading elm.json: ' + err);
    process.exit(1);
  }
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

  let testElmJson = {
    type: 'application',
    'source-directories': [], // these are added below
    'elm-version': '0.19.1',
    dependencies: {
      direct: {},
      indirect: {},
    },
    'test-dependencies': {
      direct: {},
      indirect: {},
    },
  };

  var nodeTestRunnerElmJsonPath = path.resolve(
    path.join(__dirname, '..', 'elm', 'elm.json')
  );
  var nodeTestRunnerElmJson = fs.readJsonSync(nodeTestRunnerElmJsonPath);
  // we want to use the version of elm-explorations/test that the user
  // specifies in their own test-dependencies. everything else needs to
  // be included for the test runner to compile.
  delete nodeTestRunnerElmJson.dependencies.direct['elm-explorations/test'];
  addDirectDependencies(
    nodeTestRunnerElmJson['dependencies']['direct'],
    isPackageProject,
    testElmJson
  );
  addIndirectDependencies(
    nodeTestRunnerElmJson['dependencies']['indirect'],
    testElmJson
  );

  // Make all the source-directories absolute, and introduce a new one.
  var projectSourceDirs;
  if (isPackageProject) {
    projectSourceDirs = ['./src'];
  } else {
    projectSourceDirs = projectElmJson['source-directories'];
  }
  var sourceDirs /*: Array<string> */ = projectSourceDirs
    .map(function (src) {
      return path.resolve(path.join(projectRootDir, src));
    })
    .concat(shouldAddTestsDirAsSource ? [testRootDir] : []);

  testElmJson['source-directories'] = [
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
      // These all need to be relative paths. Otherwise, there's a bug in elm make
      // (as of 0.19.1-alpha4) where certain .elmi files wouldn't get generated.
      //
      // SSCCE: https://gist.github.com/rtfeldman/c0a068794b2e36d350c00357f458c50f
      //
      // Relative paths also have the nice benefit that if the user moves their
      // directory, this doesn't break.
      return path.relative(generatedCodeDir, absolutePath);
    });

  if (isPackageProject) {
    addDirectDependencies(
      projectElmJson['dependencies'],
      isPackageProject,
      testElmJson
    );
    addDirectDependencies(
      projectElmJson['test-dependencies'],
      isPackageProject,
      testElmJson
    );
    addIndirectDependencies(packageIndirectDeps, testElmJson);
  } else {
    addDirectDependencies(
      projectElmJson['dependencies']['direct'],
      isPackageProject,
      testElmJson
    );
    addIndirectDependencies(
      projectElmJson['dependencies']['indirect'],
      testElmJson
    );
    addDirectDependencies(
      projectElmJson['test-dependencies']['direct'],
      isPackageProject,
      testElmJson
    );
    addIndirectDependencies(
      projectElmJson['test-dependencies']['indirect'],
      testElmJson
    );
  }

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

function addDirectDependencies(
  deps /*: Object */,
  isPackageProject /*: boolean */,
  testElmJson /*: Object */
) {
  Object.keys(deps).forEach(function (name) {
    var version = deps[name];
    if (isPackageProject) {
      // Use the lowest version in the range.
      // NOTE: technically this doesn't work if someone does something weird like:
      //
      // "2.0.0 < v < 3.0.0"
      //
      // ...but we're choosing not to support that right now.
      version = version.split(' ')[0];
    }
    if (testElmJson['dependencies']['direct'].hasOwnProperty(name)) {
      var existingVersion = testElmJson['dependencies']['direct'][name];

      // If we have a clash, choose the higher of the two versions.
      // This may not work! It's entirely possible that the result won't
      // compile. We're going to try it and see what happens.
      version = Version.getHigherVersion(version, existingVersion);
    }
    testElmJson['dependencies']['direct'][name] = version;
  });
}

function addIndirectDependencies(deps, testElmJson /*: Object */) {
  Object.keys(deps).forEach(function (name) {
    if (testElmJson['dependencies']['direct'].hasOwnProperty(name)) {
      // already a normal dep
    } else {
      var version = deps[name];

      if (testElmJson['dependencies']['indirect'].hasOwnProperty(name)) {
        var existingVersion = testElmJson['dependencies']['indirect'][name];

        // If we have a clash, choose the higher of the two versions.
        // This may not work! It's entirely possible that the result won't
        // compile. We're going to try it and see what happens.
        version = Version.getHigherVersion(version, existingVersion);
      }

      testElmJson['dependencies']['indirect'][name] = version;
    }
  });
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
  return `"${string.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

module.exports = { prepareCompiledJsFile, generateElmJson, generateMainModule };
