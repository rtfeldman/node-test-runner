// @flow

const fs = require('fs-extra');

// First char: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L296-L300
// Rest: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L328-L335
// https://hackage.haskell.org/package/base-4.14.0.0/docs/Data-Char.html#v:isLetter
// const nonCapitalizedNamePart = /\p{Ll}[_\d\p{L}]*/u;
// const nonCapitalizedName = new RegExp(
//   `^${nonCapitalizedNamePart.source}$`,
//   'u'
// );

// const moduleDefinition = /^(?:port\s+|effect\s+)?module\s+\S+\s+exposing\s+\(((?:[^()]|\(\s*\.\.\s*\))+)\)/;

// const possiblyTestDefinitionStart = new RegExp(
//   `^${nonCapitalizedNamePart.source}(?=\\s*=)`,
//   'mu'
// );

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

    let newChunk = true;

    let index = 0;

    const flush = (token) => {
      try {
        if (
          tokenizerState.tag === 'Initial' &&
          tokenizerState.otherTokenChars !== ''
        ) {
          if (newChunk) {
            onParserToken({ tag: 'NewChunk' });
          }
          onParserToken({
            tag: 'Other',
            value: tokenizerState.otherTokenChars,
          });
          tokenizerState.otherTokenChars = '';
        }
        if (token !== undefined) {
          onParserToken(token);
        }
        newChunk = false;
      } catch (error) {
        readable.close();
        index = Infinity;
        if (error instanceof SyntaxError) {
          if (process.env.ELM_TEST_LOG_PARSE_ERRORS) {
            console.error(error);
          }
        } else {
          reject(error);
        }
      }
    };

    const readable = fs.createReadStream(filePath, { encoding: 'utf8' });
    readable.on('error', reject);

    readable.on('data', (chunk /*: string */) => {
      index = 0;
      while (index < chunk.length) {
        const char = chunk[index];
        switch (tokenizerState.tag) {
          case 'Initial':
            switch (char) {
              case ' ':
                index++;
                flush();
                break;
              case '\n':
                newChunk = true;
                index++;
                flush();
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
                index++;
                flush({ tag: '(' });
                break;
              case ')':
                index++;
                flush({ tag: ')' });
                break;
              case ',':
                index++;
                flush({ tag: ',' });
                break;
              case '=':
                index++;
                flush({ tag: '=' });
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
                flush();
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
                flush();
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
                tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                index++;
                flush({ tag: '..' });
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

          default:
            unreachable(tokenizerState.tag);
        }
      }
    });

    readable.on('close', () => {
      resolve(exposed);
    });

    function unexpectedToken(expected, token) {
      return new SyntaxError(
        `Expected '${expected}' but got: ${JSON.stringify(token)}`
      );
    }

    let parserState /*: {
      tag: 'ModuleDeclaration',
      lastToken:
        | 'Nothing'
        | 'NewChunk'
        | 'port/effect'
        | 'module'
        | 'ModuleName'
        | 'exposing',
    } */ = { tag: 'ModuleDeclaration', lastToken: 'Nothing' };

    const onParserToken = (
      token /*:
        | { tag: '(' }
        | { tag: ')' }
        | { tag: ',' }
        | { tag: '=' }
        | { tag: '..' }
        | { tag: 'NewChunk' }
        | { tag: 'Other', value: string } */
    ) => {
      switch (parserState.tag) {
        case 'ModuleDeclaration':
          switch (parserState.lastToken) {
            case 'Nothing':
              if (token.tag === 'NewChunk') {
                parserState.lastToken = 'NewChunk';
              } else {
                throw unexpectedToken('NewChunk', token);
              }
              break;

            case 'NewChunk':
              if (token.tag === 'Other') {
                switch (token.value) {
                  case 'port':
                  case 'effect':
                    parserState.lastToken = 'port/effect';
                    break;
                  case 'module':
                    parserState.lastToken = 'module';
                    break;
                  default:
                    throw unexpectedToken('port/effect/module', token);
                }
              } else {
                throw unexpectedToken('port/effect/module', token);
              }
              break;

            case 'port/effect':
              if (token.tag === 'Other' && token.value === 'module') {
                parserState.lastToken = 'module';
              } else {
                throw unexpectedToken('module', token);
              }
              break;

            case 'module':
              if (token.tag === 'Other') {
                parserState.lastToken = 'ModuleName';
              } else {
                throw unexpectedToken('a module name', token);
              }
              break;

            case 'ModuleName':
              if (token.tag === 'Other' && token.value === 'exposing') {
                parserState.lastToken = 'exposing';
              } else {
                throw unexpectedToken('exposing', token);
              }
              break;

            case 'exposing':
              if (token.tag === '(') {
                TODO;
              } else {
                throw unexpectedToken('(', token);
              }
              break;

            default:
              unreachable(parserState.lastToken);
          }
          break;

        default:
          unreachable(parserState.tag);
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

function unreachable(value /*: empty */) /*: empty */ {
  throw new Error(`Unreachable: ${value}`);
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
