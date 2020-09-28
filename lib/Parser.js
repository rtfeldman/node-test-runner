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
  return new Promise((resolve, reject) => {
    const exposed /*: Array<string> */ = [];

    let tokenizerState /*:
      | { tag: 'Initial', otherTokenChars: string }
      | { tag: 'MaybeMultilineComment{' }
      | { tag: 'MultilineComment', level: number, previousChar: string }
      | { tag: 'MaybeSinlelineComment-' }
      | { tag: 'SinlelineComment' }
      | { tag: 'Maybe..' } */ = { tag: 'Initial', otherTokenChars: '' };

    let parserState /*: { tag: 'ModuleDeclaration' } */ = {
      tag: 'ModuleDeclaration',
    };

    const onToken = (token) => {
      if (
        tokenizerState.tag === 'Initial' &&
        tokenizerState.otherTokenChars !== ''
      ) {
        // TODO: Also need to send this when entering whitespace or comment.
        onParserToken({ tag: 'Other', value: tokenizerState.otherTokenChars });
      }
      // TODO: Also new-chunk
      onParserToken(token);
    };

    const readable = fs.createReadStream(filePath, { encoding: 'utf8' });
    readable.on('error', reject);

    readable.on('data', (chunk) => {
      let index = 0;
      while (index < chunk.length) {
        const char = chunk[index];
        switch (tokenizerState.tag) {
          case 'Initial':
            switch (char) {
              case ' ':
                index++;
                break;
              case '{':
                tokenizerState = { tag: 'MaybeMultilineComment{' };
                index++;
                break;
              case '-':
                tokenizerState = { tag: 'MaybeSinlelineComment-' };
                index++;
                break;
              case '.':
                tokenizerState = { tag: 'Maybe..' };
                index++;
                break;
              case '(':
              case ')':
              case ',':
              case '=':
                index++;
                onToken({ tag: char });
                break;
              default:
                tokenizerState.otherTokenChars += char;
                index++;
                break;
            }
            break;

          case 'MaybeMultilineComment{':
            switch (char) {
              case '-':
                tokenizerState = {
                  tag: 'MultilineComment',
                  level: 1,
                  previousChar: '',
                };
                index++;
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `{${char}`,
                };
                index++;
                break;
            }
            break;

          case 'MultilineComment':
            switch (char) {
              case '-':
                if (tokenizerState.previousChar === '{') {
                  tokenizerState.level++;
                }
                index++;
                tokenizerState.previousChar = char;
                break;
              case '}':
                if (tokenizerState.previousChar === '-') {
                  if (tokenizerState.level <= 1) {
                    tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                    index++;
                  } else {
                    tokenizerState.level--;
                    index++;
                    tokenizerState.previousChar = char;
                  }
                }
                break;
              default:
                index++;
                tokenizerState.previousChar = char;
                break;
            }
            break;

          case 'MaybeSinlelineComment-':
            switch (char) {
              case '-':
                tokenizerState = { tag: 'SinlelineComment' };
                index++;
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `-${char}`,
                };
                index++;
                break;
            }
            break;

          case 'SinlelineComment':
            switch (char) {
              case '\n':
                tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                index++;
                break;
              default:
                index++;
                break;
            }
            break;

          case 'Maybe..':
            switch (char) {
              case '.':
                tokenizerState = { tag: 'Initial' };
                index++;
                onToken({ tag: '..' });
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `.${char}`,
                };
                index++;
                break;
            }
            break;
        }
      }
    });

    readable.on('close', () => {
      resolve(exposed);
    });

    const onParserToken = (token /*: { tag: '..' } */) => {
      switch (parserState.tag) {
        case 'ModuleDeclaration':
          switch (token.tag) {
            case '..':
              break;
          }
      }
    };

    //   const reader = readline.createInterface({
    //     input: readable,
    //     crlfDelay: Infinity,
    //   });
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
    // const content = fs.readFileSync(filePath, 'utf8');

    // const moduleDefinitionMatch = moduleDefinition.exec(content);

    // if (moduleDefinitionMatch === null) {
    //   resolve([]);
    //   return;
    // }

    // const exposing = moduleDefinitionMatch[1].trim();

    // if (exposing !== '..') {
    //   resolve(
    //     exposing
    //       .split(/(?:[ ,]|\{-[^{}]*-\})+/)
    //       .filter((part) => nonCapitalizedName.test(part))
    //   );
    //   return;
    // }

    // resolve(content.match(possiblyTestDefinitionStart) || []);
  });
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
