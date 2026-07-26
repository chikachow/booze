/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-member-access -- Node executes this script with its built-in test runner. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bundleBudgetFailures, bundleBudgets } from "./check-client-bundle.mjs";

describe("bundleBudgetFailures", () => {
  it("accepts measurements at every limit", () => {
    assert.deepEqual(
      bundleBudgetFailures({
        initial: {
          bytes: bundleBudgets.initialJavaScriptBytes,
          gzipBytes: bundleBudgets.initialJavaScriptGzipBytes,
        },
        largest: { bytes: bundleBudgets.largestJavaScriptBytes },
        totalJavaScriptGzipBytes: bundleBudgets.totalJavaScriptGzipBytes,
      }),
      [],
    );
  });

  it("reports each independently exceeded budget", () => {
    const failures = bundleBudgetFailures({
      initial: {
        bytes: bundleBudgets.initialJavaScriptBytes + 1,
        gzipBytes: bundleBudgets.initialJavaScriptGzipBytes + 1,
      },
      largest: { bytes: bundleBudgets.largestJavaScriptBytes + 1 },
      totalJavaScriptGzipBytes: bundleBudgets.totalJavaScriptGzipBytes + 1,
    });
    assert.equal(failures.length, 4);
  });
});
