// @flow

const Report = require('./Report.js');

function help() /*: string */ {
  return `
elm-test init
    Create example tests

elm-test
    Run tests in the tests/ folder

elm-test TESTFILES
    Run TESTFILES, for example "src/**/*Tests.elm"

elm-test install PACKAGE
    Like \`elm install PACKAGE\`, except it installs to
    "test-dependencies" in your elm.json

Options:
    --compiler /path/to/compiler
        Use a custom path to an Elm executable. Default: elm
    --seed INT
        Run with a previous fuzzer seed. Default: A random seed
    --fuzz INT
        Run with each fuzz test performing this many iterations. Default: 100
    --report json
    --report junit
    --report console
        Print results to stdout in the given format. Default: console
    --version
        Print version and exit
    --watch
        Run tests on file changes
  `.trim();
}

const longOptionWithValue = /^(--[^-=][^=]*)=([^]*)$/;
const looksLikeOption = /^--?[^-]/;

// Poor man’s type alias. We can’t use /*:: type Command = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
const Command /*:
  | { tag: 'help' }
  | { tag: 'version' }
  | { tag: 'init' }
  | { tag: 'install', packageName: string }
  | { tag: 'make', testFileGlobs: Array<string> }
  | { tag: 'test', testFileGlobs: Array<string> } */ = { tag: 'help' };
void Command;

function parseArgv(
  argv /*: Array<string> */
) /*: Result<
  string,
  {
    command: typeof Command,
    options: {
      compiler: string | void,
      fuzz: number,
      report: typeof Report.Report,
      seed: number,
      watch: boolean,
    },
  }
> */ {
  const options = {
    help: false,
    version: false,
    watch: false,
    compiler: undefined,
    seed: Math.floor(Math.random() * 407199254740991) + 1000,
    fuzz: 100,
    report: 'console',
  };

  const rest = [];
  let raw = [];

  for (let index = 0; index < argv.length; index++) {
    const fullArg = argv[index];
    const match = longOptionWithValue.exec(fullArg);
    const arg = match === null ? fullArg : match[1];

    // Get the value passed to a long flag, or `fallback` if there is none.
    // This is either the part after the equal sign: `--flag=value`.
    // Or the next argument: `--flag value`.
    const getValue = (fallback /*: string */) /*: string */ => {
      if (match === null) {
        index++;
        return index >= argv.length ? fallback : argv[index];
      } else {
        return match[2];
      }
    };

    switch (arg) {
      case '-h':
      case '-help':
      case '--help':
        options.help = true;
        break;

      case '--version':
        options.version = true;
        break;

      case '--watch':
        options.watch = true;
        break;

      case '--compiler': {
        const value = getValue('');
        if (value === '') {
          return {
            tag: 'Error',
            error: `You must pass a path after ${arg}`,
          };
        }
        options.compiler = value;
        break;
      }

      case '--seed': {
        const result = parsePositiveInteger(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.seed = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              error: `You must pass a number after ${arg}: ${result.error}`,
            };
        }
        break;
      }

      case '--fuzz': {
        const result = parsePositiveInteger(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.fuzz = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              error: `You must pass a number after ${arg}: ${result.error}`,
            };
        }
        break;
      }

      case '--report': {
        const result = Report.parse(getValue('nothing'));
        switch (result.tag) {
          case 'Ok':
            options.report = result.value;
            break;
          case 'Error':
            return {
              tag: 'Error',
              error: `You must pass a reporter after ${arg}: ${result.error}`,
            };
        }
        break;
      }

      case '--':
        raw = argv.slice(index + 1);
        index = argv.length;
        break;

      default:
        if (looksLikeOption.test(arg)) {
          return { tag: 'Error', error: `Unknown option: ${arg}` };
        }
        rest.push(arg);
    }
  }

  const command =
    options.help || rest[0] === 'help'
      ? { tag: 'Ok', value: { tag: 'help' } }
      : options.version
      ? { tag: 'Ok', value: { tag: 'version' } }
      : parseCommand(rest, raw);

  if (command.tag === 'Error') {
    return command;
  }

  return {
    tag: 'Ok',
    value: {
      command: command.value,
      options: {
        // fuzz, seed and report don’t make sense for _all_ commands, but I’m
        // not sure we gain anything by disallowing them rather than ignoring
        // them.
        compiler: options.compiler,
        fuzz: options.fuzz,
        report: options.report,
        seed: options.seed,
        watch: options.watch,
      },
    },
  };
}

function parsePositiveInteger(
  string /*: string */
) /*: Result<string, number> */ {
  const number = Number(string);
  return !/^\d+$/.test(string)
    ? {
        tag: 'Error',
        error: `Expected one or more digits, but got: ${string}`,
      }
    : !Number.isFinite(number)
    ? {
        tag: 'Error',
        error: `Expected a finite number, but got: ${number}`,
      }
    : { tag: 'Ok', value: number };
}

function parseCommand(
  args /*: Array<string> */,
  raw /*: Array<string> */
) /*: Result<string, typeof Command> */ {
  const first = args[0];
  const rest = args.slice(1).concat(raw);
  const got = `${rest.length}: ${rest.join(' ')}`;

  switch (first) {
    case 'init':
      return rest.length > 0
        ? {
            tag: 'Error',
            error: `init takes no arguments, but got ${got}`,
          }
        : { tag: 'Ok', value: { tag: 'init' } };

    case 'install':
      return rest.length === 0
        ? {
            tag: 'Error',
            error:
              'You need to provide the package you want to install. For example: elm-test install elm/regex',
          }
        : rest.length === 1
        ? { tag: 'Ok', value: { tag: 'install', packageName: rest[0] } }
        : {
            tag: 'Error',
            error: `install takes one single argument, but got ${got}`,
          };

    case 'make':
      return { tag: 'Ok', value: { tag: 'make', testFileGlobs: rest } };

    default:
      return {
        tag: 'Ok',
        value: { tag: 'test', testFileGlobs: args.concat(raw) },
      };
  }
}

module.exports = {
  help,
  parseArgv,
};
