// @flow

const fs = require('fs-extra');

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

    let tokenizerState /*: typeof TokenizerState */ = {
      tag: 'Initial',
      otherTokenChars: '',
    };

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
        if (tokenizerState.tag === 'Initial' && char === '\n') {
          newChunk = true;
        }
        const [nextTokenizerState, flushCommand] = tokenize(
          char,
          tokenizerState
        );
        tokenizerState = nextTokenizerState;
        switch (flushCommand.tag) {
          case 'NoFlush':
            break;
          case 'Flush':
            flush();
            break;
          case 'FlushToken':
            flush(flushCommand.token);
            break;
          default:
            unreachable(flushCommand.tag);
        }
      }
    });

    readable.on('close', () => {
      resolve(exposed);
    });

    let parserState /*: typeof ParserState */ = {
      tag: 'ModuleDeclaration',
      lastToken: 'Nothing',
    };

    const onParserToken = (token /*: typeof Token */) => {
      const parseResult = parse(token, parserState);
      if (parseResult instanceof Error) {
        throw parseResult;
      }
      parserState = parseResult;
      switch (parserState.tag) {
        case 'ModuleDeclaration':
          if (parserState.lastToken === 'LowerName' && token.tag === 'Other') {
            exposed.push(token.value);
          }
          break;
        default:
          unreachable(parserState.tag);
      }
    };
  });
}

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

function unexpectedToken(expected, token) {
  return new SyntaxError(
    `Expected '${expected}' but got: ${JSON.stringify(token)}`
  );
}

// Poor man’s type alias. We can’t use /*:: type Token = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
// There are a couple of more of this workaround through the file.
const Token /*:
  | { tag: '(' }
  | { tag: ')' }
  | { tag: ',' }
  | { tag: '=' }
  | { tag: '..' }
  | { tag: 'NewChunk' }
  | { tag: 'Other', value: string } */ = { tag: '(' };
void Token;

const TokenizerState /*:
  | { tag: 'Initial', otherTokenChars: string }
  | { tag: 'MaybeMultilineComment{' }
  | { tag: 'MultilineComment', level: number, previousChar: string }
  | { tag: 'MaybeSinglelineComment-' }
  | { tag: 'SinglelineComment' }
  | { tag: 'Maybe..' } */ = { tag: 'Initial', otherTokenChars: '' };
void TokenizerState;

function tokenize(
  char /*: string */,
  tokenizerState /*: typeof TokenizerState */
) /*: [
  typeof TokenizerState,
  (
    | { tag: 'NoFlush' }
    | { tag: 'Flush' }
    | { tag: 'FlushToken', token: typeof Token }
  )
] */ {
  switch (tokenizerState.tag) {
    case 'Initial':
      switch (char) {
        case ' ':
        case '\n':
          return [tokenizerState, { tag: 'Flush' }];
        case '{':
          return [{ tag: 'MaybeMultilineComment{' }, { tag: 'NoFlush' }];
        case '-':
          return [{ tag: 'MaybeSinglelineComment-' }, { tag: 'NoFlush' }];
        case '.':
          return [{ tag: 'Maybe..' }, { tag: 'NoFlush' }];
        case '(':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: '(' } }];
        case ')':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: ')' } }];
        case ',':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: ',' } }];
        case '=':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: '=' } }];
        default:
          return [
            {
              tag: 'Initial',
              otherTokenChars: tokenizerState.otherTokenChars + char,
            },
            { tag: 'NoFlush' },
          ];
      }

    case 'MaybeMultilineComment{':
      switch (char) {
        case '-':
          return [
            {
              tag: 'MultilineComment',
              level: 1,
              previousChar: '',
            },
            { tag: 'Flush' },
          ];
        default:
          return [
            {
              tag: 'Initial',
              otherTokenChars: `{${char}`,
            },
            { tag: 'NoFlush' },
          ];
      }

    case 'MultilineComment':
      switch (char) {
        case '-':
          return [
            tokenizerState.previousChar === '{'
              ? {
                  tag: 'MultilineComment',
                  level: tokenizerState.level + 1,
                  previousChar: '',
                }
              : {
                  tag: 'MultilineComment',
                  level: tokenizerState.level,
                  previousChar: char,
                },
            { tag: 'NoFlush' },
          ];
        case '}':
          return [
            tokenizerState.previousChar === '-'
              ? tokenizerState.level <= 1
                ? { tag: 'Initial', otherTokenChars: '' }
                : {
                    tag: 'MultilineComment',
                    level: tokenizerState.level - 1,
                    previousChar: '',
                  }
              : {
                  tag: 'MultilineComment',
                  level: tokenizerState.level,
                  previousChar: char,
                },
            { tag: 'NoFlush' },
          ];
        default:
          return [
            {
              tag: 'MultilineComment',
              level: tokenizerState.level,
              previousChar: char,
            },
            { tag: 'NoFlush' },
          ];
      }

    case 'MaybeSinglelineComment-':
      switch (char) {
        case '-':
          return [{ tag: 'SinglelineComment' }, { tag: 'Flush' }];
        default:
          return [
            {
              tag: 'Initial',
              otherTokenChars: `-${char}`,
            },
            { tag: 'NoFlush' },
          ];
      }

    case 'SinglelineComment':
      switch (char) {
        case '\n':
          return [{ tag: 'Initial', otherTokenChars: '' }, { tag: 'NoFlush' }];
        default:
          return [tokenizerState, { tag: 'NoFlush' }];
      }

    case 'Maybe..':
      switch (char) {
        case '.':
          return [
            { tag: 'Initial', otherTokenChars: '' },
            { tag: 'FlushToken', token: { tag: '..' } },
          ];
        default:
          return [
            {
              tag: 'Initial',
              otherTokenChars: `.${char}`,
            },
            { tag: 'NoFlush' },
          ];
      }

    default:
      return unreachable(tokenizerState.tag);
  }
}

const ParserState /*: {
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
void ParserState;

function parse(
  token /*: typeof Token */,
  parserState /*: typeof ParserState */
) /*: typeof ParserState | Error */ {
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
  return parserState;
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
