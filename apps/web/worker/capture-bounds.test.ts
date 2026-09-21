import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { captureImageContent } from "./bottle-extractor.ts";
import { readCaptureFormData } from "./routes/bottle-captures.ts";

await describe("capture resource bounds", async () => {
  await it("accepts multipart input within the limit", async () => {
    const form = new FormData();
    form.set("images", new File(["photo"], "label.jpg", { type: "image/jpeg" }));
    const parsed = await readCaptureFormData(
      new Request("http://localhost/", { method: "POST", body: form }),
    );
    const file = parsed.get("images");
    assert.ok(file instanceof File);
    assert.equal(await file.text(), "photo");
  });

  await it("enforces the upload limit even when Content-Length understates a streamed body", async () => {
    let chunks = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/", {
      method: "POST",
      body,
      duplex: "half",
      headers: { "content-type": "multipart/form-data; boundary=photo", "content-length": "1" },
    } as RequestInit);
    await assert.rejects(
      readCaptureFormData(request),
      (error: unknown) => error instanceof Error && error.message === "Capture upload exceeds 33MB",
    );
    assert.ok(chunks <= 36);
    assert.equal(cancelled, true);
  });

  await it("resizes inference copies and leaves stored originals untouched", async () => {
    const transforms: unknown[] = [];
    let consumed = 0;
    // oxlint-disable typescript/no-unsafe-type-assertion -- Test double only reads one stored original.
    const bucket = {
      async get() {
        return { body: byteStream(new Uint8Array(8 * 1024 * 1024)) };
      },
    } as unknown as R2Bucket;
    // oxlint-enable typescript/no-unsafe-type-assertion
    // oxlint-disable typescript/no-unsafe-type-assertion -- Test double models only the transformation API used by capture inference.
    const images = {
      input(stream: ReadableStream<Uint8Array>) {
        const transformer = {
          transform(options: unknown) {
            transforms.push(options);
            return transformer;
          },
          async output() {
            consumed = (await new Response(stream).arrayBuffer()).byteLength;
            return {
              contentType: () => "image/jpeg",
              image: () => byteStream(new Uint8Array([1, 2, 3])),
            };
          },
        };
        return transformer;
      },
    } as unknown as ImagesBinding;
    // oxlint-enable typescript/no-unsafe-type-assertion
    const content = await captureImageContent({ bucket, capture: capture(), images });
    assert.equal(consumed, 8 * 1024 * 1024);
    assert.deepEqual(transforms, [{ width: 2048, height: 2048, fit: "scale-down" }]);
    assert.deepEqual(content, [
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } },
    ]);
  });

  await it("rejects inference payloads above the bound instead of encoding them", async () => {
    // oxlint-disable typescript/no-unsafe-type-assertion -- Test double only implements reading the original image stream.
    const bucket = {
      async get() {
        return { body: byteStream(new Uint8Array(2 * 1024 * 1024 + 1)) };
      },
    } as unknown as R2Bucket;
    // oxlint-enable typescript/no-unsafe-type-assertion
    await assert.rejects(
      captureImageContent({ bucket, capture: capture() }),
      /original photo remains saved/u,
    );
  });
});

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function capture() {
  return {
    id: "capture",
    siteId: "site",
    userId: "user",
    quantity: 1,
    storageLocationId: null,
    positionHint: null,
    images: [{ imageAssetId: "image", r2Key: "original", contentType: "image/heic", sortOrder: 0 }],
  };
}
