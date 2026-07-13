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
 * @param { Array<string> } fullyQualifiedName
 * @returns { string }
 */
function fullyQualifiedNameToVariableName(fullyQualifiedName) {
  return `$author$project$${fullyQualifiedName.join('$')}`;
}

/**
 * @param { string } code
 * @returns { Record<string, string> }
 */
function parseChunks(code) {
  return Object.fromEntries(
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
}

/**
 * Resolves references for everything reachable from `fullyQualifiedNames` in `chunks`.
 * Merges recursive chains into single items, so that the output is an acyclic graph.
 *
 * @typedef { { code: Array<string>, references: Set<string> } } Item
 * @param { Array<Array<string>> } fullyQualifiedNames
 * @param { Record<string, string> } chunks
 * @returns { Record<string, Item> }
 */
function toItems(fullyQualifiedNames, chunks) {
  /** @type { Record<string, Item> } */
  const items = {};

  /**
   * @param { string } name
   * @param { string } chunk
   * @param { Array<string> } seen
   * @returns { void }
   */
  const update = (name, chunk, seen) => {
    if (name in items) {
      return;
    }
    const references = chunk.match(REFERENCES_REGEX);
    if (references === null) {
      throw new Error(`No references found in chunk for ${name}:\n${chunk}`);
    }
    /** @type { Item } */
    const item = {
      code: [chunk],
      references: new Set(
        references.filter(
          (reference) =>
            (reference.startsWith('$') || reference.startsWith('_')) &&
            reference !== name &&
            reference in chunks
        )
      ),
    };
    items[name] = item;
    const newSeen = [...seen, name];
    for (const reference of item.references) {
      const referenceChunk = chunks[reference];
      // TODO: Check if undefined or not?
      let index = newSeen.indexOf(reference);
      if (index === -1) {
        update(reference, referenceChunk, newSeen);
      } else {
        const chain = newSeen.slice(index);
        /** @type { Item } */
        const newItem = { code: [], references: new Set() };
        for (const name2 of chain) {
          const item2 = items[name2];
          newItem.code.push(...item2.code);
          for (const n of item2.references) {
            if (!chain.includes(n)) {
              newItem.references.add(n);
            }
          }
          items[name2] = newItem;
        }
      }
    }
  };

  for (const fullyQualifiedName of fullyQualifiedNames) {
    const name = fullyQualifiedNameToVariableName(fullyQualifiedName);
    const chunk = chunks[name];
    if (chunk === undefined) {
      throw new Error(`Could not find ${name} in the compiled code!`);
    }
    update(name, chunk, []);
  }

  return items;
}

/**
 * @param { Array<Array<string>> } fullyQualifiedNames
 * @param { Record<string, Item> } items
 * @returns { Array<{ name: Array<string>, hash: string }> }
 */
function doHashing(fullyQualifiedNames, items) {
  /** @type { Record<string, string> } */
  const hashes = {};

  /**
   * @param { string } name
   * @returns { string }
   */
  const getOrCalculateHash = (name) => {
    const hash = hashes[name];
    if (hash !== undefined) {
      return hash;
    }
    const item = items[name];
    if (item === undefined) {
      throw new Error(`No item for ${name}!`);
    }
    // When testing on a large project, all hashes led to about the same
    // amount of time used by `getOrCalculateHash`. `sha256` is one of
    // the ones being about 10 ms faster than the slowest ones.
    const hashObject = crypto.createHash('sha256');
    for (const code of Array.from(item.code).sort()) {
      hashObject.update(code);
    }
    for (const reference of Array.from(item.references).sort()) {
      hashObject.update(getOrCalculateHash(reference));
    }
    const newHash = hashObject.digest('hex');
    hashes[name] = newHash;
    return newHash;
  };

  return fullyQualifiedNames.map((fullyQualifiedName) => {
    const name = fullyQualifiedNameToVariableName(fullyQualifiedName);
    return { name: fullyQualifiedName, hash: getOrCalculateHash(name) };
  });
}

/**
 * Pass in an array of fully qualified names (such as `[['MyTest', 'suite']]`)
 * which may be tests. For each fully qualified name, find the corresponding
 * JavaScript definition in the compiled Elm JavaScript code, and return a
 * hash of the code of that definition. If the definition refers to other
 * definitions (it calls other functions), the hash is based on both the hash
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
  const chunks = parseChunks(code);
  const items = toItems(fullyQualifiedNames, chunks);
  return doHashing(fullyQualifiedNames, items);
}

module.exports = {
  calculateHashes,
};
