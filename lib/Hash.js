const crypto = require('crypto');

/**
 * The compiled Elm JavaScript is basically just a long sequence of definitions.
 * Some are `function` statements, some are `var` assignments.
 *
 * Values that use themselves inside themselves in certain ways are defined
 * with `function $some$module$cyclic$functionName`, and wrapped in `try {}`
 * during development – that’s the only time a definition can be indented.
 *
 * We also need to support a `}` at the start of the line, because I’ve seen this
 * code being generated (in https://github.com/lydell/codebase-ui/tree/02eac5056da3283687e0b61fa94a30ca6f71e3fb):
 *
 *     function _Http_track(router, xhr, tracker)
 *     {
 *     	// stuff
 *     }var $author$project$PreApp$AppMsg = function (a) {
 *     	return {$: 'AppMsg', a: a};
 *     };
 */
const CHUNK_REGEX = /^(?=\}?(?:var|function|try))/m;

/**
 * Companion to `CHUNK_REGEX`. Extracts the name of the thing being defined a chunk.
 * Remember that the chunk may start with `try` and be indented.
 */
const CHUNK_DEFINITION_NAME_REGEX = /(?:var|function) ([^ (]+)/;

/**
 * Matches string literals, multiline comments, singleline comments and some identifiers -
 * which may be references to other chunks. Such references must start with either a
 * dollar sign or an underscore. We only care about out the identifiers, but match the
 * other literals too, so that we don’t get false positives for identifiers inside strings and comments.
 * Parts copied from: https://github.com/lydell/js-tokens/blob/895fb4d6804a287aecfb0e1009851f925d07b079/index.coffee
 */
const REFERENCES_REGEX =
  /(['"])(?:[^'"\\\n\r]+|(?!\1)['"]|\\(?:\r\n|[^]))*(\1)?|\/\*(?:[^*]+|\*(?!\/))*(\*\/)?|\/\/.*|[$_][$_\u200C\u200D\p{ID_Continue}]+/gu;

/**
 * Pass in an array of fully qualified names (such as `[['MyTest', 'suite']]`)
 * which may be tests. For each fully qualified name, find the corresponding
 * JavaScript definition in the compiled Elm JavaScript code, and return a
 * hash of the code of that definition. If the definition refers to other
 * definition (it calls other functions), the hash is based on both the hash
 * of the code of the definition, and of the hashes of all referenced definitions.
 *
 * This way we can tell if the code that will be running via an exposed `Test`
 * value has changed or not, and thus if we need to re-run it or not.
 *
 * @param { Array<Array<string>> } fullyQualifiedNames
 * @param { string } code
 * @returns { Array<{ name: Array<string>, hash: string }> }
 */
function calculateHashes(fullyQualifiedNames, code) {
  /** @type { Record<string, string> } */
  const chunks = Object.fromEntries(
    code.split(CHUNK_REGEX).flatMap((chunk) => {
      const match = CHUNK_DEFINITION_NAME_REGEX.exec(chunk);
      // Not all chunks contain a definition.
      if (match === null) {
        return [];
      }
      const name = match[1];
      return [[name, chunk]];
    })
  );

  /** @type { Record<string, string> } */
  const hashes = {};

  /**
   * @param { string } name
   * @param { Array<string> } seen
   * @returns { string }
   */
  const getOrCalculateHash = (name, seen) => {
    const hash = hashes[name];
    if (hash !== undefined) {
      return hash;
    }
    const chunk = chunks[name];
    if (chunk === undefined) {
      const newHash = '';
      hashes[name] = newHash;
      return newHash;
    }
    const references = chunk.match(REFERENCES_REGEX);
    if (references === null) {
      throw new Error(`No references found in chunk for ${name}:\n${chunk}`);
    }
    // When testing on a large project, all hashes led to about the same
    // amount of time used by `getOrCalculateHash`. `sha256` is one of
    // the ones being about 10 ms faster than the slowest ones.
    const hashObject = crypto.createHash('sha256');
    hashObject.update(chunk);
    for (const reference of references) {
      if (
        (reference.startsWith('$') || reference.startsWith('_')) &&
        !seen.includes(reference)
      ) {
        hashObject.update(getOrCalculateHash(reference, [reference, ...seen]));
      }
    }
    const newHash = hashObject.digest('hex');
    hashes[name] = newHash;
    return newHash;
  };

  return fullyQualifiedNames.map((fullyQualifiedName) => {
    const name = `$author$project$${fullyQualifiedName.join('$')}`;
    return { name: fullyQualifiedName, hash: getOrCalculateHash(name, [name]) };
  });
}

module.exports = {
  calculateHashes,
};
