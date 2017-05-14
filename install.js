var path = require("path");
var install = require(path.join(__dirname, "installer"));

install().then(function(successMessage) {
    console.log(successMessage);
  }, function(errorMessage) {
    console.error(errorMessage);
    process.exit(1);
  }
);
