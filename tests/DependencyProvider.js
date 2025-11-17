'use strict';

const assert = require('assert');
const { prioritizePinnedIndirectVersion } = require('../lib/DependencyProvider');

describe('DependencyProvider', () => {
  describe("prioritizePinnedIndirectVersion", () => {
    const versions = ["1.0.5", "1.0.4", "1.0.3", "1.0.2", "1.0.1", "1.0.0"];

    const testPinning = (pinnedVersion, expectedResult) => {
      assert.deepStrictEqual(
        prioritizePinnedIndirectVersion(versions, pinnedVersion),
        expectedResult
      );
    };

    it("retains order when no pinned indirect dependency", () => {
      testPinning(undefined, versions);
    });

    it("retains order when pinned version doesn't exist", () => {
      testPinning("1.0.6", versions);
    });

    it("retains order if already at latest", () => {
      testPinning("1.0.5", versions);
    });

    it("prioritizes a version in the middle, if we're pinned to it", () => {
      const expected = [
        // first, try the pinned version
        "1.0.3",
        // then, try upgrading
        "1.0.4",
        "1.0.5",
        // then, try downgrading
        "1.0.2",
        "1.0.1",
        "1.0.0"
      ];
      testPinning("1.0.3", expected);
    });

    it("prioritizes first version, if we're pinned to it", () => {
      testPinning("1.0.0", [...versions].sort());
    });
  });
});
