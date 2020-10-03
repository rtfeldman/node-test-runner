// @flow

const fs = require('fs-extra');

// First char lowercase: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L296-L300
// First char uppercase: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L263-L267
// Rest: https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L328-L335
// https://hackage.haskell.org/package/base-4.14.0.0/docs/Data-Char.html#v:isLetter
const lowerName = /^\p{Ll}[_\d\p{L}]*$/u;
const upperName = /^\p{Lu}[_\d\p{L}]*$/u;

// https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/Variable.hs#L71-L81
const reservedWords = new Set([
  'if',
  'then',
  'else',
  'case',
  'of',
  'let',
  'in',
  'type',
  'module',
  'where',
  'import',
  'exposing',
  'as',
  'port',
]);

function isLowerName(string) {
  return lowerName.test(string) && !reservedWords.has(string);
}

function isUpperName(string) {
  return upperName.test(string);
}

function unreachable(value /*: empty */) /*: empty */ {
  throw new Error(`Unreachable: ${value}`);
}

class StopParsing extends Error {}

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
        if (error instanceof SyntaxError) {
          if (process.env.ELM_TEST_LOG_PARSE_ERRORS) {
            console.error(error);
          }
          resolve([]);
        } else if (error instanceof StopParsing) {
          resolve(exposed);
        } else {
          reject(error);
        }
        index = Infinity;
        readable.close();
      }
    };

    const readable = fs.createReadStream(filePath, { encoding: 'utf8' });
    readable.on('error', reject);

    readable.on('data', (chunk /*: string */) => {
      for (index = 0; index < chunk.length; index++) {
        const char = chunk[index];
        switch (tokenizerState.tag) {
          case 'Initial':
            switch (char) {
              case ' ':
                flush();
                break;
              case '\n':
                newChunk = true;
                flush();
                break;
              case '{':
                tokenizerState = { tag: 'MaybeMultilineComment{' };
                break;
              case '-':
                tokenizerState = { tag: 'MaybeSinlelineComment-' };
                break;
              case '.':
                tokenizerState = { tag: 'Maybe..' };
                break;
              case '(':
                flush({ tag: '(' });
                break;
              case ')':
                flush({ tag: ')' });
                break;
              case ',':
                flush({ tag: ',' });
                break;
              case '=':
                flush({ tag: '=' });
                break;
              default:
                tokenizerState.otherTokenChars += char;
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
                flush();
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `{${char}`,
                };
                break;
            }
            break;

          case 'MultilineComment':
            switch (char) {
              case '-':
                if (tokenizerState.previousChar === '{') {
                  tokenizerState.level++;
                }
                tokenizerState.previousChar = char;
                break;
              case '}':
                if (tokenizerState.previousChar === '-') {
                  if (tokenizerState.level <= 1) {
                    tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                  } else {
                    tokenizerState.level--;
                    tokenizerState.previousChar = char;
                  }
                }
                break;
              default:
                tokenizerState.previousChar = char;
                break;
            }
            break;

          case 'MaybeSinlelineComment-':
            switch (char) {
              case '-':
                tokenizerState = { tag: 'SinlelineComment' };
                flush();
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `-${char}`,
                };
                break;
            }
            break;

          case 'SinlelineComment':
            switch (char) {
              case '\n':
                tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                break;
              default:
                break;
            }
            break;

          case 'Maybe..':
            switch (char) {
              case '.':
                tokenizerState = { tag: 'Initial', otherTokenChars: '' };
                flush({ tag: '..' });
                break;
              default:
                tokenizerState = {
                  tag: 'Initial',
                  otherTokenChars: `.${char}`,
                };
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
        | 'exposing'
        | 'exposing('
        | 'exposing..'
        | 'LowerName'
        | 'UpperName'
        | 'UpperName('
        | 'UpperName..'
        | 'UpperName)'
        | ',',
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
                parserState.lastToken = 'exposing(';
              } else {
                throw unexpectedToken('(', token);
              }
              break;

            case 'exposing(':
              switch (token.tag) {
                case '..':
                  parserState.lastToken = 'exposing..';
                  break;
                case 'Other':
                  if (isLowerName(token.value)) {
                    exposed.push(token.value);
                    parserState.lastToken = 'LowerName';
                  } else if (isUpperName(token.value)) {
                    parserState.lastToken = 'UpperName';
                  } else {
                    throw unexpectedToken('an exposed name or ..', token);
                  }
                  break;
                default:
                  throw unexpectedToken('an exposed name or ..', token);
              }
              break;

            case 'exposing..':
              if (token.tag === ')') {
                // TODO: Switch to next parser state.
              } else {
                throw unexpectedToken(')', token);
              }
              break;

            case 'LowerName':
              switch (token.tag) {
                case ',':
                  parserState.lastToken = ',';
                  break;
                case ')':
                  throw new StopParsing();
                default:
                  throw unexpectedToken(', or )', token);
              }
              break;

            case 'UpperName':
              switch (token.tag) {
                case ',':
                  parserState.lastToken = ',';
                  break;
                case '(':
                  parserState.lastToken = 'UpperName(';
                  break;
                case ')':
                  throw new StopParsing();
                default:
                  throw unexpectedToken(', or ( or )', token);
              }
              break;

            case 'UpperName(':
              if (token.tag === '..') {
                parserState.lastToken = 'UpperName..';
              } else {
                throw unexpectedToken('..', token);
              }
              break;

            case 'UpperName..':
              if (token.tag === ')') {
                parserState.lastToken = 'UpperName)';
              } else {
                throw unexpectedToken(')', token);
              }
              break;

            case 'UpperName)':
              switch (token.tag) {
                case ',':
                  parserState.lastToken = ',';
                  break;
                case ')':
                  throw new StopParsing();
                default:
                  throw unexpectedToken(', or ( or )', token);
              }
              break;

            case ',':
              switch (token.tag) {
                case 'Other':
                  if (isLowerName(token.value)) {
                    exposed.push(token.value);
                    parserState.lastToken = 'LowerName';
                  } else if (isUpperName(token.value)) {
                    parserState.lastToken = 'UpperName';
                  } else {
                    throw unexpectedToken('an exposed name', token);
                  }
                  break;
                default:
                  throw unexpectedToken('an exposed name', token);
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
  });
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
