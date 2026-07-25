/* oxlint-disable eslint/no-use-before-define */

import type { BottleInput, WineInput } from "./api/catalogue.ts";
import {
  BottleOcrError,
  combineBottleLabelEvidence,
  defaultBottleCombinerConfig,
  defaultBottleExtractorConfigs,
  extractBottleLabelEvidenceWithExtractor,
  suggestionFromBottleCombination,
  type BottleCombinedExtraction,
  type BottleExtractorConfig,
  type BottleExtractorResult,
  type BottleExtractorsResult,
  type BottleOcrImageContent,
  type BottleOcrDiagnostic,
  type BottleOcrSuggestion,
} from "./bottle-ocr.ts";
import type { CaptureWorkflowRecord } from "./capture-store.ts";

export type ImportCandidate = {
  readonly wine: WineInput;
  readonly bottle: BottleInput;
  readonly rawSuggestion: unknown;
};

export type CaptureExtractorResult = {
  readonly diagnostics: readonly BottleOcrDiagnostic[];
  readonly extractorId: string;
  readonly model: string;
  readonly result: BottleExtractorResult;
};

export type CaptureReconciliationResult = {
  readonly combined: BottleCombinedExtraction;
  readonly diagnostics: readonly BottleOcrDiagnostic[];
  readonly model: string;
};

export async function extractCaptureLabelEvidence({
  bucket,
  capture,
  diagnostics,
  extractor,
  gatewayToken,
  gatewayUrl,
}: {
  readonly bucket: R2Bucket;
  readonly capture: CaptureWorkflowRecord;
  readonly diagnostics?: BottleOcrDiagnostic[] | undefined;
  readonly extractor: BottleExtractorConfig;
  readonly gatewayToken: string | undefined;
  readonly gatewayUrl: string | undefined;
}): Promise<Omit<CaptureExtractorResult, "diagnostics">> {
  const extracted = await extractBottleLabelEvidenceWithExtractor({
    diagnostics,
    extractor,
    gatewayToken,
    ...(gatewayUrl === undefined ? {} : { gatewayUrl }),
    imageContent: await captureImageContent({ bucket, capture }),
  });
  return {
    extractorId: extracted.extractorId,
    model: extracted.model,
    result: extracted.result,
  };
}

export async function reconcileCaptureLabelEvidence({
  diagnostics,
  extractors,
  gatewayToken,
  gatewayUrl,
}: {
  readonly diagnostics?: BottleOcrDiagnostic[] | undefined;
  readonly extractors: BottleExtractorsResult;
  readonly gatewayToken: string | undefined;
  readonly gatewayUrl: string | undefined;
}): Promise<Omit<CaptureReconciliationResult, "diagnostics">> {
  const combiner = defaultBottleCombinerConfig({
    gatewayToken,
    ...(gatewayUrl === undefined ? {} : { gatewayUrl }),
  });
  return {
    combined: await combineBottleLabelEvidence({
      combiner,
      diagnostics,
      extractors,
    }),
    model: combiner.model,
  };
}

export function extractorsFromCaptureResults(
  results: readonly Pick<CaptureExtractorResult, "extractorId" | "result">[],
): BottleExtractorsResult {
  return Object.fromEntries(results.map((result) => [result.extractorId, result.result]));
}

export function buildCaptureImportCandidate({
  combined,
  extractors,
}: {
  readonly combined: BottleCombinedExtraction;
  readonly extractors: BottleExtractorsResult;
}): {
  readonly candidate: ImportCandidate;
  readonly imageText: unknown;
  readonly model: string;
} {
  const suggestion = suggestionFromBottleCombination({ combined, extractors });
  return importCandidateFromSuggestion(suggestion);
}

export { defaultBottleExtractorConfigs };

async function captureImageContent({
  bucket,
  capture,
}: {
  readonly bucket: R2Bucket;
  readonly capture: CaptureWorkflowRecord;
}): Promise<readonly BottleOcrImageContent[]> {
  return Promise.all(
    capture.images.map(async (image): Promise<BottleOcrImageContent> => {
      const object = await bucket.get(image.r2Key);
      if (object === null) {
        throw new BottleOcrError(503, `Stored image ${image.imageAssetId} is missing`);
      }
      return {
        type: "image_url",
        image_url: {
          url: await objectToDataUrl({
            contentType: image.contentType,
            object,
          }),
        },
      };
    }),
  );
}

function importCandidateFromSuggestion(suggestion: BottleOcrSuggestion): {
  readonly candidate: ImportCandidate;
  readonly imageText: unknown;
  readonly model: string;
} {
  return {
    candidate: candidateFromSuggestion(suggestion),
    imageText: suggestion.structuredExtraction ?? suggestion,
    model: "multi-extractor-combiner",
  };
}

function candidateFromSuggestion(suggestion: BottleOcrSuggestion): ImportCandidate {
  const wineryName = text(suggestion.wineryName);
  const displayName = text(suggestion.displayName);
  if (wineryName === null || displayName === null) {
    throw new BottleOcrError(502, "Extraction did not identify enough wine details to import");
  }

  return {
    wine: {
      wineryName,
      brandName: text(suggestion.brandName) ?? undefined,
      baseName: displayName,
      designation: displayName,
      displayName,
      vintageYear: parseYear(suggestion.vintageYear),
      grapeVarieties: grapeVarietiesFromText(suggestion.grapeVarieties),
      country: text(suggestion.country) ?? "",
      region: text(suggestion.region) ?? "",
      appellation: text(suggestion.appellation) ?? "",
      classification: text(suggestion.classification) ?? "",
      wineType: text(suggestion.wineType) ?? "",
      wineColor: text(suggestion.wineColor) ?? "",
      alcoholPercent: parseDecimal(suggestion.alcoholPercent),
      drinkFromYear: parseYear(suggestion.drinkFromYear),
      drinkToYear: parseYear(suggestion.drinkToYear),
      description: text(suggestion.description) ?? "",
      drinkingAdvice: text(suggestion.drinkingAdvice) ?? "",
      labelText: text(suggestion.labelText) ?? "",
      sourceUrl: text(suggestion.sourceUrl) ?? "",
      notes: text(suggestion.wineNotes) ?? "",
    },
    bottle: {
      volumeMl: parseVolumeMl(suggestion.bottleVolumeMl),
      barcode: text(suggestion.barcode) ?? "",
      lotCode: text(suggestion.lotCode) ?? "",
    },
    rawSuggestion: suggestion,
  };
}

async function objectToDataUrl({
  contentType,
  object,
}: {
  readonly contentType: string;
  readonly object: R2ObjectBody;
}): Promise<string> {
  const bytes = new Uint8Array(await object.arrayBuffer());
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCodePoint(...chunk);
  }
  return btoa(binary);
}

function text(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseYear(value: string | undefined): number | undefined {
  const matched = value?.match(/\b(18|19|20|21|22)\d{2}\b/u);
  if (matched === undefined || matched === null) {
    return undefined;
  }
  const year = Number.parseInt(matched[0], 10);
  return Number.isNaN(year) ? undefined : year;
}

function parseDecimal(value: string | undefined): number | undefined {
  const matched = value?.match(/\d+(?:\.\d+)?/u);
  if (matched === undefined || matched === null) {
    return undefined;
  }
  const decimal = Number.parseFloat(matched[0]);
  return Number.isNaN(decimal) ? undefined : decimal;
}

function parseVolumeMl(value: string | undefined): number | undefined {
  const decimal = parseDecimal(value);
  if (decimal === undefined) {
    return undefined;
  }
  if (value?.toLowerCase().includes("l") === true && !value.toLowerCase().includes("ml")) {
    return Math.round(decimal * 1000);
  }
  return Math.round(decimal);
}

function grapeVarietiesFromText(value: string | undefined): readonly string[] {
  return (
    value
      ?.split(/[,;/+&]/u)
      .map((grape) => grape.trim())
      .filter((grape) => grape !== "") ?? []
  );
}
