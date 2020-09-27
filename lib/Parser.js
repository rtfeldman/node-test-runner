const fs = require('fs-extra');

// First char: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L296-L300
// Rest: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L328-L335
// https://hackage.haskell.org/package/base-4.14.0.0/docs/Data-Char.html#v:isLetter
const nonCapitalizedNamePart = /\p{Ll}[_\d\p{L}]*/u;
const nonCapitalizedName = new RegExp(
  `^${nonCapitalizedNamePart.source}$`,
  'u'
);

const moduleDefinition = /^(?:port\s+|effect\s+)?module\s+\S+\s+exposing\s+\(((?:[^()]|\(\s*\.\.\s*\))+)\)/;

const possiblyTestDefinitionStart = new RegExp(
  `^${nonCapitalizedNamePart.source}(?=\\s*=)`,
  'mu'
);

// For valid Elm files, this extracts _all_ (no more, no less) names that:
// 1. Are exposed.
// 2. _Might_ be tests. So capitalized names are excluded, for example.
//
// For invalid Elm files, this probably returns an empty list. It could also
// return a list of things it _thinks_ are exposed values, but it doesn’t
// matter. The idea is to bail early and still import the file. Then Elm gets a
// chance to show its nice error messages.
function extractExposedPossiblyTests(
  filePath /*: string */
) /*: Promise<Array<string>> */ {
  return new Promise((resolve) => {
    //   const readable = fs.createReadStream(filePath);
    //   const reader = readline.createInterface({
    //     input: readable,
    //     crlfDelay: Infinity,
    //   });
    //   readable.on('error', reject);
    //   reader.on('error', reject);
    //   const stop = () => {
    //     readable.close();
    //     reader.close();
    //   };
    //   const exposed = [];
    //   reader.on('line', (line) => {
    //     if (something(line)) {
    //       exposed.push('something');
    //     } else {
    //       stop();
    //     }
    //   });
    //   reader.on('close', () => {
    //     resolve(exposed);
    //   });

    // TODOx: POC parser for now. Does not support comments and multiline strings and is too liberal.
    const content = fs.readFileSync(filePath, 'utf8');

    const moduleDefinitionMatch = moduleDefinition.exec(content);

    if (moduleDefinitionMatch === null) {
      resolve([]);
      return;
    }

    const exposing = moduleDefinitionMatch[1].trim();

    if (exposing !== '..') {
      resolve(
        exposing
          .split(/(?:[ ,]|\{-[^{}]*-\})+/)
          .filter((part) => nonCapitalizedName.test(part))
      );
      return;
    }

    resolve(content.match(possiblyTestDefinitionStart) || []);
  });
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
