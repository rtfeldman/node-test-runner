//@flow

// Incorporate the process PID into the socket name, so elm-test processes can
// be run parallel without accidentally sharing each others' sockets.
//
// See https://github.com/rtfeldman/node-test-runner/pull/231
module.exports =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\elm_test-' + process.pid
    : '/tmp/elm_test-' + process.pid + '.sock';
