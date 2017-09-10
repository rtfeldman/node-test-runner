var path = require("path");
var install = require(path.join(__dirname, "installer"));

install(true).then(
  function(successMessage) {
    process.stdout.write(successMessage + "\n");
  },
  function(errorMessage) {
    console.error(errorMessage);
    process.exit(1);
  }
);
