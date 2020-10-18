const spawn = require('cross-spawn');

function get_dependencies(pathToElmJson) {
  var result = spawn.sync(
    'elm-json',
    [
      'solve',
      '--test',
      '--extra',
      'elm/core',
      'elm/json',
      'elm/time',
      'elm/random',
      '--',
      pathToElmJson,
    ],
    {
      silent: true,
      env: process.env,
    }
  );

  if (result.status != 0) {
    console.error(result.stderr.toString());
    process.exit(1);
  }

  return JSON.parse(result.stdout.toString());
}

module.exports = { get_dependencies };
