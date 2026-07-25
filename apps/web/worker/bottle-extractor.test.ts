import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCaptureImportCandidate, decideCaptureImport } from "./bottle-extractor.ts";
import type { BottleCombinedExtraction } from "./bottle-ocr.ts";

type CombinedOptions = {
  readonly disagreements?: readonly string[];
  readonly displayNameConfidence?: number;
  readonly humanReviewReasons?: readonly string[];
  readonly overallConfidence?: number;
  readonly requiresHumanReview?: boolean;
  readonly vintageConfidence?: number;
  readonly vintageValue?: string | null;
  readonly wineryConfidence?: number;
  readonly wineryValue?: string | null;
};

await describe("capture OCR import review decision", async () => {
  await it("auto-imports only when every threshold is met", () => {
    assert.deepEqual(
      decideCaptureImport({
        combined: combinedExtraction({
          overallConfidence: 0.85,
          vintageConfidence: 0.75,
          wineryConfidence: 0.8,
        }),
        extractors: {},
      }),
      { kind: "auto_import", reasons: [] },
    );
  });

  await it("requires review below the overall-confidence threshold", () => {
    const decision = decideCaptureImport({
      combined: combinedExtraction({ overallConfidence: 0.849 }),
      extractors: {},
    });
    assert.equal(decision.kind, "needs_review");
    assert.match(decision.reasons.join(" "), /Overall OCR confidence/u);
  });

  await it("requires review for missing or low-confidence producer identity", () => {
    for (const options of [
      { wineryValue: null },
      { wineryConfidence: 0.799 },
    ] satisfies readonly CombinedOptions[]) {
      assert.equal(
        decideCaptureImport({
          combined: combinedExtraction(options),
          extractors: {},
        }).kind,
        "needs_review",
      );
    }
  });

  await it("preserves an incomplete candidate for manual review instead of throwing", () => {
    const extracted = buildCaptureImportCandidate({
      combined: combinedExtraction({ wineryValue: null }),
      extractors: {},
    });
    assert.equal(extracted.reviewDecision.kind, "needs_review");
    assert.equal(extracted.candidate.wine.wineryName, "");
  });

  await it("requires one confident vintage, wine name, or appellation", () => {
    const decision = decideCaptureImport({
      combined: combinedExtraction({
        displayNameConfidence: 0.74,
        vintageConfidence: 0.74,
        vintageValue: "2020",
      }),
      extractors: {},
    });
    assert.equal(decision.kind, "needs_review");
    assert.match(decision.reasons.join(" "), /No vintage, wine name or cuvee/u);
  });

  await it("honours combiner review flags, reasons, and disagreements", () => {
    for (const options of [
      { requiresHumanReview: true },
      { humanReviewReasons: ["Label is obscured."] },
      { disagreements: ["vintage differs between extractors"] },
    ] satisfies readonly CombinedOptions[]) {
      assert.equal(
        decideCaptureImport({
          combined: combinedExtraction(options),
          extractors: {},
        }).kind,
        "needs_review",
      );
    }
  });

  await it("requires review when any extractor sees different bottles", () => {
    const decision = decideCaptureImport({
      combined: combinedExtraction(),
      extractors: {
        first: { bottle_same_across_images: true },
        second: { bottle_same_across_images: false },
      },
    });
    assert.equal(decision.kind, "needs_review");
    assert.match(decision.reasons.join(" "), /different bottles/u);
  });
});

function combinedExtraction(options: CombinedOptions = {}): BottleCombinedExtraction {
  return {
    model_role: "combiner",
    canonical_fields: {
      wineryName: textField(
        "wineryValue" in options ? (options.wineryValue ?? null) : "Example Estate",
        options.wineryConfidence ?? 0.9,
      ),
      brandName: textField(null),
      displayName: textField("Reserve", options.displayNameConfidence ?? 0.9),
      vintage: textField(
        "vintageValue" in options ? (options.vintageValue ?? null) : "2020",
        options.vintageConfidence ?? 0.9,
      ),
      wineType: textField("red wine"),
      wineColor: textField("red"),
      grapeVarieties: {
        value: ["Shiraz"],
        confidence: 0.9,
        supported_by: ["first", "second"],
        evidence: ["Shiraz"],
        decision_reason: null,
      },
      country: textField("Australia"),
      region: textField("Barossa Valley"),
      appellation: textField(null),
      classification: textField(null),
      alcoholPercent: textField("14.5%"),
      bottleVolumeMl: textField("750 mL"),
      addressQualification: textField(null),
      barcode: textField(null),
      lotCode: textField(null),
      description: textField(null),
      drinkingAdvice: textField(null),
    },
    canonical_label_text_lines: ["Example Estate", "Reserve", "2020"],
    field_disagreements: [...(options.disagreements ?? [])],
    requires_human_review: options.requiresHumanReview ?? false,
    human_review_reasons: [...(options.humanReviewReasons ?? [])],
    overall_confidence: options.overallConfidence ?? 0.9,
  };
}

function textField(value: string | null, confidence = 0.9) {
  return {
    value,
    confidence,
    supported_by: ["first", "second"],
    evidence: value === null ? [] : [value],
    decision_reason: null,
  };
}
