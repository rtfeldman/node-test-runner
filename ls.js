const fs = require('fs');

try {
  console.log(fs.readdirSync('/elm'));
} catch (error) {
  console.error(error);
}

process.exit(0);
