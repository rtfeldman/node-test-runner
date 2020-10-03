// @flow

const fs = require('fs-extra');

const LOG_ERRORS = 'ELM_TEST_LOG_PARSE_ERRORS' in process.env;

// For valid Elm files, this extracts _all_ (no more, no less) names that:
// 1. Are exposed.
// 2. _Might_ be tests. So capitalized names are excluded, for example.
//
// For invalid Elm files, this probably returns an empty list. It could also
// return a list of things it _thinks_ are exposed values, but it doesn’t
// matter. The idea is to bail early and still import the file. Then Elm gets a
// chance to show its nice error messages.
//
// The tokenizer reads the file character by character. As soon as it’s produced
// a whole token it feeds it to the parser, which works token by token. Both
// parse just enough to be able to extract all exposed names that could be tests
// without false positives.
function extractExposedPossiblyTests(
  filePath /*: string */,
  createReadStream /*: typeof fs.createReadStream */ = fs.createReadStream
) /*: Promise<Array<string>> */ {
  return new Promise((resolve, reject) => {
    const exposed /*: Array<string> */ = [];

    let tokenizerState /*: typeof TokenizerState */ = {
      tag: 'Initial',
      otherTokenChars: '',
    };

    let parserState /*: typeof ParserState */ = {
      tag: 'ModuleDeclaration',
      lastToken: 'Nothing',
    };

    let newChunk = true;

    let lastLowerName = '';

    let index = 0;

    const readable = createReadStream(filePath, {
      encoding: 'utf8',
      highWaterMark: 4096,
    });
    readable.on('error', reject);

    readable.on('data', (chunk /*: string */) => {
      for (index = 0; index < chunk.length; index++) {
        const char = chunk[index];
        const result = tokenize(char, tokenizerState);
        if (result instanceof SyntaxError) {
          if (LOG_ERRORS) {
            console.error(result);
          }
          resolve([]);
          readable.close();
          break;
        }
        const [nextTokenizerState, flushCommand] = result;
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
        tokenizerState = nextTokenizerState;
        if (tokenizerState.tag === 'Initial' && char === '\n') {
          newChunk = true;
        }
      }
    });

    readable.on('close', () => {
      // There’s no need to flush here. It can’t result in more exposed names.
      resolve(exposed);
    });

    const flush = (token) => {
      try {
        if (
          tokenizerState.tag === 'Initial' &&
          tokenizerState.otherTokenChars !== ''
        ) {
          const value = tokenizerState.otherTokenChars;
          if (newChunk) {
            onParserToken({ tag: 'NewChunk' });
          }
          onParserToken(
            isLowerName(value)
              ? { tag: 'LowerName', value }
              : isUpperName(value)
              ? { tag: 'UpperName', value }
              : { tag: 'Other', value }
          );
          tokenizerState.otherTokenChars = '';
        }
        if (token !== undefined) {
          onParserToken(token);
        }
        newChunk = false;
      } catch (error) {
        if (error instanceof SyntaxError) {
          if (LOG_ERRORS) {
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

    const onParserToken = (token /*: typeof Token */) => {
      if (token.tag === 'LowerName') {
        lastLowerName = token.value;
      }
      switch (parserState.tag) {
        case 'ModuleDeclaration': {
          const result = parseModuleDeclaration(token, parserState.lastToken);
          if (result instanceof SyntaxError) {
            throw result;
          }
          switch (result) {
            case 'StopParsing':
              throw new StopParsing();
            case 'NextParserState':
              parserState = { tag: 'Rest', lastToken: 'Initial' };
              break;
            default:
              parserState.lastToken = result;
              break;
          }
          if (parserState.lastToken === 'LowerName') {
            exposed.push(lastLowerName);
          }
          break;
        }

        case 'Rest': {
          const result = parseRest(token, parserState.lastToken);
          if (result instanceof SyntaxError) {
            throw result;
          }
          parserState.lastToken = result;
          if (parserState.lastToken === 'PotentialTestDeclaration=') {
            exposed.push(lastLowerName);
          }
          break;
        }

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

const validNewChunkKeywordsAfterModuleDeclaration = new Set([
  'import',
  'port',
  'type',
]);

// https://github.com/elm/compiler/blob/2860c2e5306cb7093ba28ac7624e8f9eb8cbc867/compiler/src/Parse/String.hs#L279-L285
const backslashableChars = new Set([
  'n',
  'r',
  't',
  '"',
  "'",
  '\\',
  // `u` must be followed by `{1234}` but we don’t bother.
  'u',
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

function expected(expectedDescription, actual) {
  return new SyntaxError(
    `Expected ${expectedDescription} but got: ${JSON.stringify(actual)}`
  );
}

function backslashError(actual) {
  return expected(
    `one of \`${Array.from(backslashableChars).join(' ')}\``,
    actual
  );
}

// Poor man’s type alias. We can’t use /*:: type Token = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
// There are a couple of more of this workaround throughout the file.
const Token /*:
  | { tag: '(' }
  | { tag: ')' }
  | { tag: ',' }
  | { tag: '=' }
  | { tag: '.' }
  | { tag: '..' }
  | { tag: 'Char' }
  | { tag: 'String' }
  | { tag: 'NewChunk' }
  | { tag: 'LowerName', value: string }
  | { tag: 'UpperName', value: string }
  | { tag: 'Other', value: string } */ = { tag: '(' };
void Token;

const TokenizerState /*:
  | { tag: 'Initial', otherTokenChars: string }
  | { tag: 'MaybeMultilineComment{' }
  | { tag: 'MultilineComment', level: number }
  | { tag: 'MultilineComment{', level: number }
  | { tag: 'MultilineComment-', level: number }
  | { tag: 'MaybeSinglelineComment-' }
  | { tag: 'SinglelineComment' }
  | { tag: 'Maybe..' }
  | { tag: 'CharStart' }
  | { tag: 'CharBackslash' }
  | { tag: 'CharEnd' }
  | { tag: 'StringStart' }
  | { tag: 'StringContent' }
  | { tag: 'StringBackslash' }
  | { tag: 'EmptyStringMaybeTriple' }
  | { tag: 'MultilineString' }
  | { tag: 'MultilineStringBackslash' }
  | { tag: 'MultilineString"' }
  | { tag: 'MultilineString""' } */ = {
  tag: 'Initial',
  otherTokenChars: '',
};
void TokenizerState;

function tokenize(
  char /*: string */,
  tokenizerState /*: typeof TokenizerState */
) /*:
  | [
      typeof TokenizerState,
      (
        | { tag: 'NoFlush' }
        | { tag: 'Flush' }
        | { tag: 'FlushToken', token: typeof Token }
      )
    ]
  | SyntaxError */ {
  switch (tokenizerState.tag) {
    case 'Initial':
      switch (char) {
        case ' ':
        case '\n':
          return [tokenizerState, { tag: 'Flush' }];
        case '{':
          return [{ tag: 'MaybeMultilineComment{' }, { tag: 'Flush' }];
        case '-':
          return [{ tag: 'MaybeSinglelineComment-' }, { tag: 'Flush' }];
        case '.':
          return [{ tag: 'Maybe..' }, { tag: 'Flush' }];
        case '(':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: '(' } }];
        case ')':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: ')' } }];
        case ',':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: ',' } }];
        case '=':
          return [tokenizerState, { tag: 'FlushToken', token: { tag: '=' } }];
        case "'":
          return [{ tag: 'CharStart' }, { tag: 'Flush' }];
        case '"':
          return [{ tag: 'StringStart' }, { tag: 'Flush' }];
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
          return [{ tag: 'MultilineComment', level: 1 }, { tag: 'NoFlush' }];
        default:
          return [
            { tag: 'Initial', otherTokenChars: `{${char}` },
            { tag: 'NoFlush' },
          ];
      }

    case 'MultilineComment':
      switch (char) {
        case '{':
          return [
            { tag: 'MultilineComment{', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
        case '-':
          return [
            { tag: 'MultilineComment-', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
        default:
          return [tokenizerState, { tag: 'NoFlush' }];
      }

    case 'MultilineComment{':
      switch (char) {
        case '-':
          return [
            { tag: 'MultilineComment', level: tokenizerState.level + 1 },
            { tag: 'NoFlush' },
          ];
        case '{':
          return [
            { tag: 'MultilineComment{', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
        default:
          return [
            { tag: 'MultilineComment', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
      }

    case 'MultilineComment-':
      switch (char) {
        case '}':
          return [
            tokenizerState.level <= 1
              ? { tag: 'Initial', otherTokenChars: '' }
              : { tag: 'MultilineComment', level: tokenizerState.level - 1 },
            { tag: 'NoFlush' },
          ];
        case '{':
          return [
            { tag: 'MultilineComment{', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
        case '-':
          return [
            { tag: 'MultilineComment-', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
        default:
          return [
            { tag: 'MultilineComment', level: tokenizerState.level },
            { tag: 'NoFlush' },
          ];
      }

    case 'MaybeSinglelineComment-':
      switch (char) {
        case '-':
          return [{ tag: 'SinglelineComment' }, { tag: 'NoFlush' }];
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
              otherTokenChars: char,
            },
            { tag: 'FlushToken', token: { tag: '.' } },
          ];
      }

    case 'CharStart':
      switch (char) {
        case '\n':
        case '\r':
          return expected('a non-newline', char);
        case '\\':
          return [{ tag: 'CharBackslash' }, { tag: 'NoFlush' }];
        default:
          return [{ tag: 'CharEnd' }, { tag: 'NoFlush' }];
      }

    case 'CharBackslash':
      if (backslashableChars.has(char)) {
        return [{ tag: 'CharEnd' }, { tag: 'NoFlush' }];
      } else {
        return backslashError(char);
      }

    case 'CharEnd':
      switch (char) {
        case "'":
          return [
            { tag: 'Initial', otherTokenChars: '' },
            { tag: 'FlushToken', token: { tag: 'Char' } },
          ];
        default:
          return expected("`'`", char);
      }

    case 'StringStart':
      switch (char) {
        case '\n':
        case '\r':
          return expected('a non-newline', char);
        case '\\':
          return [{ tag: 'StringBackslash' }, { tag: 'NoFlush' }];
        case '"':
          return [{ tag: 'EmptyStringMaybeTriple' }, { tag: 'NoFlush' }];
        default:
          return [{ tag: 'StringContent' }, { tag: 'NoFlush' }];
      }

    case 'StringContent':
      switch (char) {
        case '\n':
        case '\r':
          return expected('a non-newline', char);
        case '\\':
          return [{ tag: 'StringBackslash' }, { tag: 'NoFlush' }];
        case '"':
          return [
            { tag: 'Initial', otherTokenChars: '' },
            { tag: 'FlushToken', token: { tag: 'String' } },
          ];
        default:
          return [{ tag: 'StringContent' }, { tag: 'NoFlush' }];
      }

    case 'StringBackslash':
      if (backslashableChars.has(char)) {
        return [{ tag: 'StringContent' }, { tag: 'NoFlush' }];
      } else {
        return backslashError(char);
      }

    case 'EmptyStringMaybeTriple':
      switch (char) {
        case '"':
          return [{ tag: 'MultilineString' }, { tag: 'NoFlush' }];
        default:
          return [
            { tag: 'Initial', otherTokenChars: char },
            { tag: 'FlushToken', token: { tag: 'String' } },
          ];
      }

    case 'MultilineString':
      switch (char) {
        case '"':
          return [{ tag: 'MultilineString"' }, { tag: 'NoFlush' }];
        case '\\':
          return [{ tag: 'MultilineStringBackslash' }, { tag: 'NoFlush' }];
        default:
          return [{ tag: 'MultilineString' }, { tag: 'NoFlush' }];
      }

    case 'MultilineString"':
      switch (char) {
        case '"':
          return [{ tag: 'MultilineString""' }, { tag: 'NoFlush' }];
        case '\\':
          return [{ tag: 'MultilineStringBackslash' }, { tag: 'NoFlush' }];
        default:
          return [{ tag: 'MultilineString' }, { tag: 'NoFlush' }];
      }

    case 'MultilineString""':
      switch (char) {
        case '"':
          return [
            { tag: 'Initial', otherTokenChars: '' },
            { tag: 'FlushToken', token: { tag: 'String' } },
          ];
        case '\\':
          return [{ tag: 'MultilineStringBackslash' }, { tag: 'NoFlush' }];
        default:
          return [{ tag: 'MultilineString' }, { tag: 'NoFlush' }];
      }

    case 'MultilineStringBackslash':
      if (backslashableChars.has(char)) {
        return [{ tag: 'MultilineString' }, { tag: 'NoFlush' }];
      } else {
        return backslashError(char);
      }

    default:
      return unreachable(tokenizerState.tag);
  }
}

const ParserState /*:
  | {
      tag: 'ModuleDeclaration',
      lastToken: typeof ModuleDeclarationLastToken,
    }
  | {
      tag: 'Rest',
      lastToken: typeof RestLastToken,
    } */ = { tag: 'ModuleDeclaration', lastToken: 'Nothing' };
void ParserState;

const ModuleDeclarationLastToken /*:
  | 'Nothing'
  | 'NewChunk'
  | 'port/effect'
  | 'module'
  | 'ModuleName'
  | 'ModuleName.'
  | 'exposing'
  | 'exposing('
  | 'exposing..'
  | 'LowerName'
  | 'UpperName'
  | 'UpperName('
  | 'UpperName..'
  | 'UpperName)'
  | ',' */ = 'Nothing';
void ModuleDeclarationLastToken;

function parseModuleDeclaration(
  token /*: typeof Token */,
  lastToken /*: typeof ModuleDeclarationLastToken */
) /*:
  | typeof ModuleDeclarationLastToken
  | 'StopParsing'
  | 'NextParserState'
  | SyntaxError */ {
  switch (lastToken) {
    case 'Nothing':
      if (token.tag === 'NewChunk') {
        return 'NewChunk';
      }
      return expected('a new chunk', token);

    case 'NewChunk':
      if (token.tag === 'Other') {
        switch (token.value) {
          case 'port':
          case 'effect':
            return 'port/effect';
          case 'module':
            return 'module';
        }
      }
      return expected('`port`, `effect` or `module`', token);

    case 'port/effect':
      if (token.tag === 'Other' && token.value === 'module') {
        return 'module';
      }
      return expected('`module`', token);

    case 'module':
      if (token.tag === 'UpperName') {
        return 'ModuleName';
      }
      return expected('a module name', token);

    case 'ModuleName':
      switch (token.tag) {
        case '.':
          return 'ModuleName.';
        case 'Other':
          if (token.value === 'exposing') {
            return 'exposing';
          }
      }
      return expected('`.` or `exposing`', token);

    case 'ModuleName.':
      if (token.tag === 'UpperName') {
        return 'ModuleName';
      }
      return expected('a module name', token);

    case 'exposing':
      if (token.tag === '(') {
        return 'exposing(';
      }
      return expected('`(`', token);

    case 'exposing(':
      switch (token.tag) {
        case '..':
          return 'exposing..';
        case 'LowerName':
          return 'LowerName';
        case 'UpperName':
          return 'UpperName';
      }
      return expected('an exposed name or `..`', token);

    case 'exposing..':
      if (token.tag === ')') {
        return 'NextParserState';
      }
      return expected('`)`', token);

    case 'LowerName':
      switch (token.tag) {
        case ',':
          return ',';
        case ')':
          return 'StopParsing';
      }
      return expected('`)` or `,`', token);

    case 'UpperName':
      switch (token.tag) {
        case ',':
          return ',';
        case '(':
          return 'UpperName(';
        case ')':
          return 'StopParsing';
      }
      return expected('`(`, `)` or `,`', token);

    case 'UpperName(':
      if (token.tag === '..') {
        return 'UpperName..';
      }
      return expected('`..`', token);

    case 'UpperName..':
      if (token.tag === ')') {
        return 'UpperName)';
      }
      return expected('`)`', token);

    case 'UpperName)':
      switch (token.tag) {
        case ',':
          return ',';
        case ')':
          return 'StopParsing';
      }
      return expected('`)` or `,`', token);

    case ',':
      switch (token.tag) {
        case 'LowerName':
          return 'LowerName';
        case 'UpperName':
          return 'UpperName';
      }
      return expected('an exposed name', token);

    default:
      return unreachable(lastToken);
  }
}

const RestLastToken /*:
  | 'Initial'
  | 'NewChunk'
  | 'PotentialTestDeclarationName'
  | 'PotentialTestDeclaration='
  | 'Ignore' */ = 'Initial';
void RestLastToken;

function parseRest(
  token /*: typeof Token */,
  lastToken /*: typeof RestLastToken */
) /*: typeof RestLastToken | SyntaxError */ {
  switch (lastToken) {
    case 'Initial':
      if (token.tag === 'NewChunk') {
        return 'NewChunk';
      }
      return expected('a new chunk', token);

    case 'NewChunk':
      switch (token.tag) {
        case 'LowerName':
          return 'PotentialTestDeclarationName';
        case 'Other':
          if (validNewChunkKeywordsAfterModuleDeclaration.has(token.value)) {
            return 'Ignore';
          }
          break;
      }
      return expected(
        `${Array.from(
          validNewChunkKeywordsAfterModuleDeclaration,
          (keyword) => `\`${keyword}\``
        ).join(', ')} or a name`,
        token
      );

    case 'PotentialTestDeclarationName':
      if (token.tag === '=') {
        return 'PotentialTestDeclaration=';
      }
      return 'Ignore';

    case 'PotentialTestDeclaration=':
      if (token.tag === 'NewChunk') {
        return expected('a definition', token);
      }
      return 'Ignore';

    case 'Ignore':
      if (token.tag === 'NewChunk') {
        return 'NewChunk';
      }
      return 'Ignore';

    default:
      return unreachable(lastToken);
  }
}

module.exports = {
  extractExposedPossiblyTests: extractExposedPossiblyTests,
};
