/**
Based on @rtsao/scc@1.1.0
https://github.com/rtsao/scc/blob/317512b2b6615736ad9bd3f23e8cee739ff44cf6/index.js

MIT License

Copyright (c) 2019 Ryan Tsao

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * Find strongly connected components (SCC) of a directed graph using Tarjan's algorithm.
 *
 * Adapted from https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm#The_algorithm_in_pseudocode
 *
 * @typedef { {
    keys: () => Array<string>,
    get: (key: string) => Set<string>,
  } } Graph
 *
 * @param { Graph } graph 
 * @returns { Array<Set<string>> }
 */
function stronglyConnectedComponents(graph) {
  const indices = new Map();
  const lowLinks = new Map();
  const onStack = new Set();
  /** @type { Array<string> } */
  const stack = [];
  /** @type { Array<Set<string>> } */
  const scc = [];
  let idx = 0;

  /**
   * @param { string } v
   * @returns { void }
   */
  function strongConnect(v) {
    indices.set(v, idx);
    lowLinks.set(v, idx);
    idx++;
    stack.push(v);
    onStack.add(v);

    const deps = graph.get(v);
    for (const dep of deps) {
      if (!indices.has(dep)) {
        strongConnect(dep);
        lowLinks.set(v, Math.min(lowLinks.get(v), lowLinks.get(dep)));
      } else if (onStack.has(dep)) {
        lowLinks.set(v, Math.min(lowLinks.get(v), indices.get(dep)));
      }
    }

    if (lowLinks.get(v) === indices.get(v)) {
      const vertices = new Set();
      let w = null;
      while (v !== w) {
        w = stack.pop();
        onStack.delete(w);
        vertices.add(w);
      }
      scc.push(vertices);
    }
  }

  for (const v of graph.keys()) {
    if (!indices.has(v)) {
      strongConnect(v);
    }
  }

  return scc;
}

module.exports = {
  stronglyConnectedComponents,
};
