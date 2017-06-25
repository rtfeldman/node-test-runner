const assert = require("assert");
const runner = require("../lib/runner.js");

describe("mapping repository to native package name", () => {

  //assert.throws does not show the actually received error message when assert fails
  function assertThrowsErrorMessage(func, message) {
    try {
      func();
      assert.fail("Expected error message: " + message);
    } catch (e) {
      assert.equal(e, message);
    }
  }

  it('should map repository to native package name', () => {
    const repository = "https://github.com/rtfeldman/node-test-runner.git";
    const expectedNativePackageName = "rtfeldman$node_test_runner";

    assert.equal(runner.repositoryToNativePackageName(repository), expectedNativePackageName);
  });

  it("should throw error if user name and repository name cannot be parsed from repository", () => {
    const malformedRepository = "malformedRepository";
    const expectedErrorMessage = "Unable to convert repository malformedRepository to package name.";

    assertThrowsErrorMessage(() => runner.repositoryToNativePackageName(malformedRepository), expectedErrorMessage);
  });

  it("should throw error if repository name is empty", () => {
    const malformedRepositoryName = "https://github.com/rtfeldman/.git";
    const expectedErrorMessage = "Unable to convert repository " + malformedRepositoryName + " to package name.";

    assertThrowsErrorMessage(() => runner.repositoryToNativePackageName(malformedRepositoryName), expectedErrorMessage);
  });

  it("should throw error if user name is empty", () => {
    const malformedRepositoryName = "https://github.com//node-test-runner.git";
    const expectedErrorMessage = "Unable to convert repository " + malformedRepositoryName + " to package name.";

    assertThrowsErrorMessage(() => runner.repositoryToNativePackageName(malformedRepositoryName), expectedErrorMessage);
  });

  it("should throw error if user name includes dots", () => {
    const malformedRepositoryName = "https://github.com/user.with.dots/node-test-runner.git";
    const expectedErrorMessage = "Elm currently doesn't support having periods in the user/project part of the repository field of elm-package.json. Aborting test run.";

    assertThrowsErrorMessage(() => runner.repositoryToNativePackageName(malformedRepositoryName), expectedErrorMessage);
  });

  it("should throw error if repository name includes dots", () => {
    const malformedRepositoryName = "https://github.com/antivanov/underscore.elm.git";
    const expectedErrorMessage = "Elm currently doesn't support having periods in the user/project part of the repository field of elm-package.json. Aborting test run.";

    assertThrowsErrorMessage(() => runner.repositoryToNativePackageName(malformedRepositoryName), expectedErrorMessage);
  });
});