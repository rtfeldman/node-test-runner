const fs = require('fs');

const dir = process.argv[2];

console.log(dir);

try {
  console.log(fs.readdirSync(dir));
} catch (error) {
  console.error(error);
}

process.exit(0);
