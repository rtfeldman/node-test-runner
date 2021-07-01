// @flow

'use strict';

var spawn = require('cross-spawn');

var defaultOptions = {
  spawn: spawn,
  cwd: undefined,
  pathToElm: 'elm',
  output: undefined,
  report: undefined,
  processOpts: undefined,
};

// Converts an object of key/value pairs to an array of arguments suitable
// to be passed to child_process.spawn for elm-make.
function compilerArgsFromOptions(options) {
  var args = [];

  if (options.output != null) {
    args.push('--output', options.output);
  }

  if (options.report != null) {
    args.push('--report', options.report);
  }

  return args;
}

function runCompiler(sources, options) {
  var pathToElm = options.pathToElm;
  var processArgs = ['make'].concat(sources, compilerArgsFromOptions(options));

  var processOpts = Object.assign(
    {},
    {
      env: Object.assign({ LANG: 'en_US.UTF-8' }, process.env),
      stdio: 'inherit',
      cwd: options.cwd,
    },
    options.processOpts
  );

  return options.spawn(pathToElm, processArgs, processOpts);
}

function compilerErrorToString(err, pathToElm) {
  if (typeof err === 'object' && typeof err.code === 'string') {
    switch (err.code) {
      case 'ENOENT':
        return (
          'Could not find Elm compiler "' + pathToElm + '". Is it installed?'
        );

      case 'EACCES':
        return (
          'Elm compiler "' +
          pathToElm +
          '" did not have permission to run. Do you need to give it executable permissions?'
        );

      default:
        return (
          'Error attempting to run Elm compiler "' + pathToElm + '":\n' + err
        );
    }
  } else if (typeof err === 'object' && typeof err.message === 'string') {
    return JSON.stringify(err.message);
  } else {
    return (
      'Exception thrown when attempting to run Elm compiler ' +
      JSON.stringify(pathToElm)
    );
  }
}

function compile(
  sources /*: Array<string> */,
  options /*: {|
    spawn?: (
      string,
      Array<string>,
      child_process$spawnOpts
    ) => child_process$ChildProcess,
    cwd?: string,
    pathToElm?: string,
    output?: string,
    report?: 'json',
    processOpts?: child_process$spawnOpts,
  |} */
) /*: child_process$ChildProcess */ {
  var optionsWithDefaults = Object.assign({}, defaultOptions, options);
  try {
    return runCompiler(sources, optionsWithDefaults).on(
      'error',
      function (err) {
        throw err;
      }
    );
  } catch (err) {
    throw new Error(compilerErrorToString(err, optionsWithDefaults.pathToElm));
  }
}

module.exports = {
  compile: compile,
};
