/**
Based on https://github.com/chalk/supports-color v10.2.2
but adapted to use CommonJs and simplified to our needs (only knowing whether stdout supports colors).

MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const { env } = process;

/**
 * @returns { boolean }
 */
function supportsColor() {
  if ('FORCE_COLOR' in env && env['FORCE_COLOR'] !== '') {
    return env['FORCE_COLOR'] !== 'false' && env['FORCE_COLOR'] !== '0';
  }

  if (process.argv.includes('--no-color')) {
    return false;
  } else if (process.argv.includes('--color')) {
    return true;
  }

  // Here’s the original comment from the supports-color package:
  // “Check for Azure DevOps pipelines. Has to be above the tty check.”
  // This is pretty weird. CI systems typically redirect the output to a non-terminal
  // to be able to capture it and display it on the web. This means that `isTTY` is false.
  // However, many CI systems support terminal colors on the web to some extent.
  // Apparently Azure DevOps does and the supports-color authors decided to let it show
  // colors even when `isTTY` is false. But a weird thing with that is that if you
  // run `elm-test | some-program` locally and in CI, `some-program` will _not_ see
  // color escape codes locally (as expected), but _will_ see them in CI!
  // GitHub Actions also supports colors. But the color support as of 2026-07-06 was
  // pretty broken: Colors were lost at newlines (while they should keep going until
  // the next color escape code). Anyways, there is a `'CI' in env` check below,
  // and GitHub Actions does set `CI`, but it is _after_ the `isTTY` check, so it
  // does not make any difference. At least for GitHub Actions. There might be _some_
  // CI system out there which _does_ use a (pseudo) TTY and also sets `CI`.
  // All in all, the logic here is copied from the supports-color package since we
  // depended on it for such a long time and didn’t want to break anything when vendoring
  // and simplifying a bit. But if we ever rethink color support and CI systems in the future,
  // at least we have some of the weirdness documented now!
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
    return true;
  }

  if (process.stdout.isTTY !== true) {
    return false;
  }

  if (process.platform === 'win32' || 'CI' in env) {
    return true;
  }

  if (env['TERM'] === 'dumb') {
    return false;
  }

  if (
    'TERM' in env ||
    'COLORTERM' in env ||
    'TERM_PROGRAM' in env ||
    'TEAMCITY_VERSION' in env
  ) {
    return true;
  }

  return false;
}

module.exports = supportsColor();
