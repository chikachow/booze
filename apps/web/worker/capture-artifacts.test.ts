import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { captureRunArtifactKey, putCaptureRunArtifact } from "./capture-artifacts.ts";

await describe("capture artifacts", async () => {
  await it("generates deterministic capture run artifact keys", () => {
    assert.equal(
      captureRunArtifactKey({
        captureId: "capture-1",
        kind: "extraction",
        runId: "run-1",
        siteId: "site-1",
      }),
      "sites/site-1/captures/capture-1/runs/run-1/extraction.json",
    );
  });

  await it("writes JSON artifacts with metadata", async () => {
    const writes: {
      readonly key: string;
      readonly value: string;
      readonly contentType: string | undefined;
    }[] = [];
    const bucket = {
      async put(
        key: string,
        value: string,
        options: { readonly httpMetadata: { readonly contentType: string } },
      ): Promise<null> {
        writes.push({
          key,
          value,
          contentType: options.httpMetadata.contentType,
        });
        return null;
      },
    };

    const artifact = await putCaptureRunArtifact({
      bucket,
      captureId: "capture-1",
      kind: "error",
      runId: "run-1",
      siteId: "site-1",
      value: { error: "failed" },
    });

    assert.deepEqual(writes, [
      {
        contentType: "application/json",
        key: "sites/site-1/captures/capture-1/runs/run-1/error.json",
        value: '{"error":"failed"}',
      },
    ]);
    assert.deepEqual(artifact, {
      contentType: "application/json",
      r2Key: "sites/site-1/captures/capture-1/runs/run-1/error.json",
      sizeBytes: 18,
    });
  });
});
