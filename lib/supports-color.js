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
  if (!('FORCE_COLOR' in env)) {
    return;
  }

  if (env.FORCE_COLOR === 'true') {
    return true;
  }

  if (env.FORCE_COLOR === 'false') {
    return false;
  }

  if (env.FORCE_COLOR.length === 0) {
    return true;
  }

  const level = Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);

  if (![0, 1, 2, 3].includes(level)) {
    return;
  }

  return level !== 0;
}

function _supportsColor(streamIsTTY) {
  let forceColor = envForceColor();
  if (forceColor === undefined) {
    if (
      process.argv.includes('--no-color') ||
      process.argv.includes('--no-colors') ||
      process.argv.includes('--color=false') ||
      process.argv.includes('--color=never')
    ) {
      return false;
    } else if (
      process.argv.includes('--color') ||
      process.argv.includes('--colors') ||
      process.argv.includes('--color=true') ||
      process.argv.includes('--color=always')
    ) {
      forceColor = true;
    }
  }

  if (forceColor === false) {
    return false;
  }

  if (
    process.argv.includes('--color=16m') ||
    process.argv.includes('--color=full') ||
    process.argv.includes('--color=truecolor')
  ) {
    return true;
  }

  if (process.argv.includes('--color=256')) {
    return true;
  }

  // Check for Azure DevOps pipelines.
  // Has to be above the `!streamIsTTY` check.
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
    return true;
  }

  if (!streamIsTTY && forceColor === undefined) {
    return false;
  }

  const min = forceColor || false;

  if (env.TERM === 'dumb') {
    return min;
  }

  if (process.platform === 'win32') {
    // Windows 10 build 10586 is the first Windows release that supports 256 colors.
    // Windows 10 build 14931 is the first release that supports 16m/TrueColor.
    const os = require('os');
    const osRelease = os.release().split('.');
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10_586) {
      return true;
    }

    return true;
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

    return min;
  }

  if ('TEAMCITY_VERSION' in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION);
  }

  if (env.COLORTERM === 'truecolor') {
    return true;
  }

  if (env.TERM === 'xterm-kitty') {
    return true;
  }

  if (env.TERM === 'xterm-ghostty') {
    return true;
  }

  if (env.TERM === 'wezterm') {
    return true;
  }

  if ('TERM_PROGRAM' in env) {
    const version = Number.parseInt(
      (env.TERM_PROGRAM_VERSION || '').split('.')[0],
      10
    );

    switch (env.TERM_PROGRAM) {
      case 'iTerm.app': {
        return version >= 3;
      }

      case 'Apple_Terminal': {
        return true;
      }
      // No default
    }
  }

  if (/-256(color)?$/i.test(env.TERM)) {
    return true;
  }

  if (
    /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)
  ) {
    return true;
  }

  if ('COLORTERM' in env) {
    return true;
  }

  return min;
}

module.exports = _supportsColor(tty.isatty(1));
