'use strict';
/**
Based on https://github.com/chalk/supports-color v10.2.2
but adapted to use CommonJs and simplified to our needs (only knowing whether stdout supports colors).

MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const tty = require('tty');

const { env } = process;

function supportsColor() {
  if ('FORCE_COLOR' in env && env.FORCE_COLOR !== '') {
    if (env.FORCE_COLOR === 'false' || env.FORCE_COLOR === '0') {
      return false;
    }

    return true;
  }

  if (process.argv.includes('--no-color')) {
    return false;
  } else if (process.argv.includes('--color')) {
    return true;
  }

  // Check for Azure DevOps pipelines.
  // Has to be above the tty check.
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
    return true;
  }

  if (!tty.isatty(1)) {
    return false;
  }

  if (process.platform === 'win32') {
    return true;
  }

  if ('CI' in env) {
    return true;
  }

  if (env.TERM === 'dumb') {
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
