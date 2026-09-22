import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BottleOcrError, extractBottleLabelEvidenceWithExtractor } from "./bottle-ocr.ts";

const textFields = [
  "brandName",
  "displayName",
  "vintage",
  "wineType",
  "wineColor",
  "country",
  "region",
  "appellation",
  "classification",
  "alcoholPercent",
  "bottleVolumeMl",
  "addressQualification",
  "barcode",
  "lotCode",
  "description",
  "drinkingAdvice",
];

function extraction() {
  return {
    model_role: "extractor",
    bottle_same_across_images: true,
    raw_text_by_image: [
      { image_index: 1, text: "Front label", notes: [] as unknown[] },
      { image_index: 2, text: "Back label", notes: [] as unknown[] },
    ],
    canonical_label_text_lines: ["Front label", "Back label"],
    fields: {
      ...Object.fromEntries(
        textFields.map((field) => [
          field,
          {
            value: null,
            confidence: 0,
            evidence: [],
            notes: [] as unknown[],
          },
        ]),
      ),
      wineryName: { value: null, confidence: 0, evidence: [], notes: [] as unknown[] },
      grapeVarieties: { value: [], confidence: 0, evidence: [], notes: [] as unknown[] },
    },
    overall_confidence: 0,
    warnings: [],
  };
}

await describe("OCR extractor response validation", async () => {
  await it("preserves nine notes on the second image instead of failing the capture", async (t) => {
    const payload = extraction();
    const notes = Array.from({ length: 9 }, (_, i) => `Observation ${i + 1}`);
    const secondImage = payload.raw_text_by_image[1];
    assert.ok(secondImage);
    secondImage.notes = notes;
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    );

    const { result } = await extractBottleLabelEvidenceWithExtractor({
      extractor: { model: "anthropic/claude-sonnet-4.5", responseFormat: "json_schema" },
      gatewayToken: "test-token",
      gatewayUrl: "https://ocr.invalid/chat/completions",
      imageContent: [],
    });
    assert.deepEqual(result.raw_text_by_image[1]?.notes, notes);
  });
  await it("preserves field notes beyond the old local limit", async (t) => {
    const payload = extraction();
    const notes = Array.from({ length: 17 }, (_, i) => `Uncertainty ${i + 1}`);
    payload.fields.wineryName.notes = notes;
    payload.fields.grapeVarieties.notes = notes;
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    );
    const { result } = await extractBottleLabelEvidenceWithExtractor({
      extractor: { model: "anthropic/claude-sonnet-4.5", responseFormat: "json_schema" },
      gatewayToken: "test-token",
      gatewayUrl: "https://ocr.invalid/chat/completions",
      imageContent: [],
    });
    assert.deepEqual(result.fields.wineryName.notes, notes);
    assert.deepEqual(result.fields.grapeVarieties.notes, notes);
  });

  await it("still rejects non-text notes and invalid confidence", async (t) => {
    for (const malformed of ["notes", "confidence"]) {
      const payload = extraction();
      const image = payload.raw_text_by_image[1];
      assert.ok(image);
      if (malformed === "notes") image.notes = [42];
      else payload.overall_confidence = 1.1;
      t.mock.method(globalThis, "fetch", async () =>
        Response.json({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
      );
      await assert.rejects(
        extractBottleLabelEvidenceWithExtractor({
          extractor: { model: "anthropic/claude-sonnet-4.5", responseFormat: "json_schema" },
          gatewayToken: "test-token",
          gatewayUrl: "https://ocr.invalid/chat/completions",
          imageContent: [],
        }),
        (error: unknown) =>
          error instanceof BottleOcrError &&
          error.status === 502 &&
          error.message.includes(
            malformed === "notes" ? "raw_text_by_image.1.notes.0" : "overall_confidence",
          ),
      );
      t.mock.restoreAll();
    }
  });
});
