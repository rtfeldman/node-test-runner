const crypto = require('crypto');

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
 * @typedef { Array<string> } FullyQualifiedName
 *
 * @param { Array<FullyQualifiedName> } fullyQualifiedNames
 * @param { string } code
 * @returns { Array<{ name: FullyQualifiedName, hash: string }> }
 */
function calculateHashes(fullyQualifiedNames, code) {
  const chunks = parseStep(code);
  const graph = referencesStep(fullyQualifiedNames, chunks);
  return hashStep(fullyQualifiedNames, graph);
}

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
 * @param { FullyQualifiedName } fullyQualifiedName
 * @returns { string }
 */
function fullyQualifiedNameToVariableName(fullyQualifiedName) {
  return `$author$project$${fullyQualifiedName.join('$')}`;
}

/**
 * Splits `code` into chunks as defined by `CHUNK_REGEX`.
 * Returns the chunks that contain a definition (variable or function),
 * keyed by the definition name.
 *
 * @param { string } code
 * @returns { Record<string, string> }
 */
function parseStep(code) {
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
 * @typedef { {
    code: Array<string>,
    references: Set<string>,
  } } Node
 *
 * @param { Array<FullyQualifiedName> } fullyQualifiedNames
 * @param { Record<string, string> } chunks
 * @returns { Record<string, Node> }
 */
function referencesStep(fullyQualifiedNames, chunks) {
  /** @type { Record<string, Node> } */
  const graph = {};

  /**
   * @param { string } name
   * @param { string } chunk
   * @param { Array<string> } seenPreviously
   * @returns { void }
   */
  const createNode = (name, chunk, seenPreviously) => {
    // Already processed.
    if (name in graph) {
      return;
    }

    // Create a node in the graph.
    const references = chunk.match(REFERENCES_REGEX);
    if (references === null) {
      throw new Error(`No references found in chunk for ${name}:\n${chunk}`);
    }
    /** @type { Node } */
    const node = {
      code: [chunk],
      references: new Set(
        references.filter(
          (reference) =>
            // Skip string literals and comments and take only identifiers – see `REFERENCES_REGEX`.
            (reference.startsWith('$') || reference.startsWith('_')) &&
            // Skip direct recursion.
            reference !== name &&
            // Only care about references to stuff defined in `chunks`.
            reference in chunks
        )
      ),
    };
    graph[name] = node;

    // Create nodes in the graph for all references.
    const seen = [...seenPreviously, name];
    for (const reference of node.references) {
      // Note: We already checked `reference in chunks` when constructing `node.references`.
      const referenceChunk = chunks[reference];
      let index = seen.indexOf(reference);
      if (index === -1) {
        createNode(reference, referenceChunk, seen);
      } else {
        // A chain of indirect recursion was found!
        // Replace all the involved functions with the same node,
        // containing the code and references of all the involved functions.
        // This is how we make the graph acyclic.
        const chain = seen.slice(index);
        /** @type { Node } */
        const newNode = {
          code: [],
          references: new Set(),
        };
        for (const chainName of chain) {
          const chainNode = graph[chainName];
          newNode.code.push(...chainNode.code);
          for (const chainReference of chainNode.references) {
            // Skip direct recursion.
            if (!chain.includes(chainReference)) {
              newNode.references.add(chainReference);
            }
          }
          graph[chainName] = newNode;
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
    createNode(name, chunk, []);
  }

  return graph;
}

/**
 * @param { Array<FullyQualifiedName> } fullyQualifiedNames
 * @param { Record<string, Node> } graph
 * @returns { Array<{ name: FullyQualifiedName, hash: string }> }
 */
function hashStep(fullyQualifiedNames, graph) {
  /** @type { Record<string, string> } */
  const hashes = {};

  /**
   * @param { string } name
   * @returns { string }
   */
  const getOrCalculateHash = (name) => {
    // Already processed.
    const hash = hashes[name];
    if (hash !== undefined) {
      return hash;
    }

    const node = graph[name];
    if (node === undefined) {
      throw new Error(
        `Could not find ${name} in the graph of the compiled code!`
      );
    }

    // When testing on a large project, all hashes led to about the same
    // amount of time used by `getOrCalculateHash`. `sha256` is one of
    // the ones being about 10 ms faster than the slowest ones.
    const hashObject = crypto.createHash('sha256');
    for (const code of Array.from(node.code).sort()) {
      hashObject.update(code);
    }
    for (const reference of Array.from(node.references).sort()) {
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

module.exports = {
  calculateHashes,
};
