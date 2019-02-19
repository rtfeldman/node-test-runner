var Version = require('../lib/version.js');
var assert = require('assert');

describe('Version.getHigherVersion', function() {
  it('Knows when the first major version is higher.', function() {
    assert.equal(Version.getHigherVersion('9.12.0', '10.0.0'), '10.0.0');
  });
  it('Knows when the second major version is higher.', function() {
    assert.equal(Version.getHigherVersion('9.14.0', '11.0.0'), '11.0.0');
  });
  it('Knows when the first minor version is higher.', function() {
    assert.equal(Version.getHigherVersion('1.12.3', '1.9.0'), '1.12.3');
  });
  it('Knows when the second minor version is higher.', function() {
    assert.equal(Version.getHigherVersion('2.2.0', '2.1.3'), '2.2.0');
  });
  it('Knows when the first patch version is higher.', function() {
    assert.equal(Version.getHigherVersion('3.0.3', '3.0.2'), '3.0.3');
  });
  it('Knows when the second patch version is higher.', function() {
    assert.equal(Version.getHigherVersion('3.2.2', '3.2.3'), '3.2.3');
  });
});
