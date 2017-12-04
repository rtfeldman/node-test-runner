//@flow
module.exports =
  process.platform === "win32"
    ? "\\\\.\\pipe\\elm_test-" + process.pid
    : "/tmp/elm_test-" + process.pid + ".sock";
