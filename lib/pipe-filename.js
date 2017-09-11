//@flow
module.exports =
  process.platform === "win32" ? "\\\\.\\pipe\\elm_test" : "/tmp/elm_test.sock";
