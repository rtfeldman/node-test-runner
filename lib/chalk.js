'use strict';
const { stdout } = require('./supports-color');

const colors = {
  blue: { open: '\x1B[34m', close: '\x1B[39m' },
  red: { open: '\x1B[31m', close: '\x1B[39m' },
};

const chalk = { supportsColor: !!stdout };

for (const [styleName, style] of Object.entries(colors)) {
  chalk[styleName] = (string) => {
    if (!supportsColor || !string) {
      return string;
    }

    return style.open + string + style.close;
  };
}

module.exports = chalk;
