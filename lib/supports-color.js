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

function envForceColor() {
  if (!('FORCE_COLOR' in env) || env.FORCE_COLOR === '') {
    return;
  }

  if (env.FORCE_COLOR === 'false' || env.FORCE_COLOR === '0') {
    return false;
  }

  return true;
}

function _supportsColor(streamIsTTY) {
  let forceColor = envForceColor();
  if (forceColor !== undefined) {
    return forceColor;
  }

  if (process.argv.includes('--no-color')) {
    return false;
  } else if (process.argv.includes('--color')) {
    return true;
  }

  // Check for Azure DevOps pipelines.
  // Has to be above the `!streamIsTTY` check.
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
    return true;
  }

  if (!streamIsTTY) {
    return false;
  }

  if (process.platform === 'win32') {
    return true;
  }

  if (env.TERM === 'dumb') {
    return false;
  }

  if ('CI' in env) {
    if (
      ['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI'].some((key) => key in env)
    ) {
      return true;
    }

    if (
      ['TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'].some(
        (sign) => sign in env
      ) ||
      env.CI_NAME === 'codeship'
    ) {
      return true;
    }

    return false;
  }

  if ('TEAMCITY_VERSION' in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION);
  }

  if (
    env.COLORTERM === 'truecolor' ||
    env.TERM === 'xterm-kitty' ||
    env.TERM === 'xterm-ghostty' ||
    env.TERM === 'wezterm'
  ) {
    return true;
  }
  if ('TERM_PROGRAM' in env) {
    switch (env.TERM_PROGRAM) {
      case 'iTerm.app':
      case 'Apple_Terminal': {
        return true;
      }
      // No default
    }
  }

  if (
    /-256(color)?$/i.test(env.TERM) ||
    /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
      env.TERM
    ) ||
    'COLORTERM' in env
  ) {
    return true;
  }

  return false;
}

module.exports = _supportsColor(tty.isatty(1));
