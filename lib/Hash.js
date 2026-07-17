const crypto = require('crypto');
const Tarjan = require('./Tarjan');

/**
 * Pass in an array of definition names, such as `["$author$project$MyTest$suite"]`,
 * which may be tests. For each definition name, find the corresponding
 * JavaScript definition in the compiled Elm JavaScript code, and return a
 * hash of the code of that definition. If the definition refers to other
 * definitions (it calls other functions), the hash is based on both the hash
 * of the code of the definition, and of the hashes of all referenced definitions.
 *
 * This way we can tell if the code that will be running via an exposed `Test`
 * value has changed or not, and thus if we need to re-run it or not.
 *
 * @param { Array<string> } names
 * @param { string } code
 * @returns { Record<string, string> }
 */
function calculateHashes(names, code) {
  const chunks = parseStep(code);
  const graph = graphStep(chunks);
  makeAcyclicStep(graph);
  return hashStep(names, chunks, graph);
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
 * A more exact regex for identifiers is `/[$_][$_\u200C\u200D\p{ID_Continue}]+/gu`,
 * but the one we’re using is about twice as fast. We match ASCII identifier chars,
 * and then _anything_ non-ASCII, because the only non-ASCII characters outside strings
 * and comments are going to be identifiers.
 */
const REFERENCES_REGEX =
  /(['"])(?:[^'"\\\n\r]+|(?!\1)['"]|\\(?:\r\n|[^]))*(\1)?|\/\*(?:[^*]+|\*(?!\/))*(\*\/)?|\/\/.*|[$_][$\w\u0080-\uffff]+/g;

/**
 * Splits `code` into chunks as defined by `CHUNK_REGEX`.
 * Returns the chunks that contain a definition (variable or function),
 * keyed by the definition name.
 *
 * @param { string } code
 * @returns { Record<string, string> }
 */
function parseStep(code) {
  /** @type { Record<string, string> } */
  const chunks = {};
  for (const chunk of code.split(CHUNK_REGEX)) {
    const match = CHUNK_DEFINITION_NAME_REGEX.exec(chunk);
    // Not all chunks contain a definition.
    if (match !== null) {
      const name = match[1];
      chunks[name] = chunk;
    }
  }
  return chunks;
}

/**
 * Parses references in all `chunks`.
 *
 * @typedef { {
    definitions: Set<string>,
    references: Set<string>,
  } } Node
 *
 * @param { Record<string, string> } chunks
 * @returns { Record<string, Node> }
 */
function graphStep(chunks) {
  /** @type { Record<string, Node> } */
  const graph = {};

  for (const name in chunks) {
    const chunk = chunks[name];
    const tokens = chunk.match(REFERENCES_REGEX);
    graph[name] = {
      definitions: new Set([name]),
      references:
        // Not all chunks contains any tokens that we care about (such as the `F` helper).
        tokens === null
          ? new Set()
          : new Set(
              tokens.filter(
                (token) =>
                  // Skip string literals and comments and take only identifiers – see `REFERENCES_REGEX`.
                  (token.startsWith('$') || token.startsWith('_')) &&
                  // Skip direct recursion.
                  token !== name &&
                  // Only care about references to stuff defined in `chunks`.
                  token in chunks
              )
            ),
    };
  }

  return graph;
}

/**
 * Merges recursive chains into single items, so that the output is an acyclic graph.
 *
 * @param { Record<string, Node> } graph
 * @returns { void }
 */
function makeAcyclicStep(graph) {
  const scc = Tarjan.stronglyConnectedComponents({
    keys: () => Object.keys(graph),
    get: (key) => graph[key].references,
  });

  for (const chain of scc) {
    if (chain.size > 1) {
      // A chain of indirect recursion was found!
      // Replace all the involved functions with the same node,
      // containing the definitions and references of all the involved functions.
      // This is how we make the graph acyclic.
      /** @type { Set<string> } */
      const references = new Set();
      for (const chainName of chain) {
        // Note: `chainName` comes from keys in the graph.
        const chainNode = graph[chainName];
        for (const chainReference of chainNode.references) {
          // Skip direct recursion.
          if (!chain.has(chainReference)) {
            references.add(chainReference);
          }
        }
        graph[chainName] = {
          definitions: chain,
          references,
        };
      }
    }
  }
}

/**
 * @param { Array<string> } names
 * @param { Record<string, string> } chunks
 * @param { Record<string, Node> } graph
 * @returns { Record<string, string> }
 */
function hashStep(names, chunks, graph) {
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
    for (const name of Array.from(node.definitions).sort()) {
      // Note: Nodes in `graph` only refer to things that exist in `chunks`.
      hashObject.update(chunks[name]);
    }
    for (const reference of Array.from(node.references).sort()) {
      hashObject.update(getOrCalculateHash(reference));
    }

    const newHash = hashObject.digest('hex');
    hashes[name] = newHash;
    return newHash;
  };

  /** @type { Record<string, string> } */
  const result = {};
  for (const name of names) {
    result[name] = getOrCalculateHash(name);
  }
  return result;
}

module.exports = {
  calculateHashes,
};
