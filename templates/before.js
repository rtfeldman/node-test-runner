// Apply Node polyfills as necessary.
var window = {
  Date: Date,
  addEventListener: function() {},
  removeEventListener: function() {}
};

var document = { body: {}, createTextNode: function() {} };

if (typeof XMLHttpRequest === "undefined") {
  XMLHttpRequest = function() {
    return {
      addEventListener: function() {},
      open: function() {},
      send: function() {}
    };
  };
}

if (typeof FormData === "undefined") {
  FormData = function() {
    this._data = [];
  };
  FormData.prototype.append = function() {
    this._data.push(Array.prototype.slice.call(arguments));
  };
}
