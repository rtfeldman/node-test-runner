const childProcess = require('child_process');

/**
 *
 * @param { string } file
 * @param { Array<string> } args
 * @param { Omit<import('child_process').SpawnOptions, "shell"> } options
 * @returns { import('child_process').ChildProcess }
 */
function spawn(file, args, options) {
  return needsShell(file)
    ? childProcess.spawn(
        `${windowsEscape(file)} ${args.map(windowsEscape).join(' ')}`,
        // See `needsShell` for why we need `shell: true` on Windows. When using
        // that option we must pass everything as a single string and escape
        // stuff ourselves.
        { ...options, shell: true }
      )
    : childProcess.spawn(file, args, options);
}

/**
 * @param { string } file
 * @param { Array<string> } args
 * @param { Omit<import('child_process').SpawnOptions, 'shell'> } options
 * @returns { import('child_process').SpawnSyncReturns<string> }
 */
function spawnSync(file, args, options) {
  return needsShell(file)
    ? childProcess.spawnSync(
        `${windowsEscape(file)} ${args.map(windowsEscape).join(' ')}`,
        // See `spawn` above.
        { ...options, encoding: 'utf-8', shell: true }
      )
    : childProcess.spawnSync(file, args, { ...options, encoding: 'utf-8' });
}

/**
 * @param { string } file
 * @returns { boolean }
 */
function needsShell(file) {
  // If the Elm binary is `elm.exe`, we can spawn it directly. But when
  // installing Elm with npm or elm-tooling, we have `node_modules/.bin/elm.cmd`
  // which in turn calls an `elm.exe` elsewhere. `.cmd` files cannot be executed
  // directly with `child_process.spawn` – it requires a shell. Since we have
  // already resolved `elm` to its full path earlier with the `which` package,
  // we can avoid the shell by checking the file extension.
  return process.platform === 'win32' && !/\.exe$/i.test(file);
}

/**
 * @param { string } arg
 * @returns { string }
 */
function windowsEscape(arg) {
  // We use dynamic args passed to `elm` for:
  // - File paths. They cannot contain double quotes and newlines on Windows.
  // - Packages to install. They cannot contain double quotes and newlines either.
  // The above makes it much easier to escape: We just need to wrap in double quotes.
  // There is one exception: `%PATH%` expands to the `PATH` environment variable.
  // The solution is to turn `Hi %PATH%` into `"Hi "%"PATH"%""` (multiple double
  // quoted strings with bare percentage signs in between).
  // The easiest way to play around with escaping on Windows is to run the following:
  // child_process.spawn('node -p process.argv "put stuff here"', { shell: true, stdio: 'inherit' })
  // That prints an array of the arguments `node` receives. Check if the last argument
  // contains all the text you wrote within the double quotes unchanged.
  if (arg.includes('"') || arg.includes('\n') || arg.includes('\r')) {
    throw new Error(
      `The following string must not contain double quotes or newlines: ${JSON.stringify(
        arg
      )}`
    );
  }
  return `"${arg.replace(/%/g, '"%"')}"`;
}

module.exports = {
  spawn: spawn,
  spawnSync: spawnSync,
};
