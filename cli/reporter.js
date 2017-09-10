//@flow
module.exports = {
  isMachineReadable: function isMachineReadable(reporter /*:string */) {
    return reporter === "json" || reporter === "junit";
  }
};
