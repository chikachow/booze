import {
  awardInputsForItem,
  criticReviewInputsForItem,
  parseGrapeVarieties,
  validateAwards,
  validateCriticReviews,
} from "./bottle-metadata.ts";
import type { BottleModalSubmit } from "./BottleModal.tsx";
import {
  formStateForItem,
  parseOptionalDecimal,
  parseOptionalVolumeMl,
  parseOptionalYear,
  type BottlePatch,
  type InventoryItem,
} from "./inventory-model.ts";

export function bottleCreatePayload({
  awards,
  criticReviews,
  form,
}: BottleModalSubmit): BottlePatch & {
  readonly wine: NonNullable<BottlePatch["wine"]>;
  readonly bottle: NonNullable<BottlePatch["bottle"]>;
} {
  return {
    storageLocationId: form.storageLocationId === "" ? null : form.storageLocationId,
    positionHint: form.position,
    wine: {
      wineryName: form.wineryName,
      brandName: form.brandName,
      baseName: form.displayName,
      designation: form.displayName,
      displayName: form.displayName,
      vintageYear: parseOptionalYear(form.vintageYear),
      grapeVarieties: parseGrapeVarieties(form.grapeVarieties),
      country: form.country,
      region: form.region,
      appellation: form.appellation,
      classification: form.classification,
      wineType: form.wineType,
      wineColor: form.wineColor,
      addressQualification: form.addressQualification,
      alcoholPercent: parseOptionalDecimal(form.alcoholPercent),
      drinkFromYear: parseOptionalYear(form.drinkFromYear),
      drinkToYear: parseOptionalYear(form.drinkToYear),
      description: form.description,
      drinkingAdvice: form.drinkingAdvice,
      labelText: form.labelText,
      sourceUrl: form.sourceUrl,
      notes: form.wineNotes,
    },
    bottle: {
      volumeMl: parseOptionalVolumeMl(form.bottleVolumeMl),
      barcode: form.barcode,
      lotCode: form.lotCode,
      notes: form.bottleNotes,
    },
    labelExtraction:
      form.labelExtractionJson.trim() === ""
        ? undefined
        : { extractedFieldsJson: form.labelExtractionJson },
    criticReviews,
    awards,
  };
}

export function bottleEditPayload(submission: BottleModalSubmit, item: InventoryItem): BottlePatch {
  const originalReviews = validateCriticReviews(criticReviewInputsForItem(item));
  const originalAwards = validateAwards(awardInputsForItem(item));
  const original = editablePayload({
    awards: originalAwards.ok ? originalAwards.values : [],
    criticReviews: originalReviews.ok ? originalReviews.values : [],
    form: formStateForItem(item),
  });
  const current = editablePayload(submission);
  const wine = changedFields(current.wine, original.wine);
  const bottle = changedFields(current.bottle, original.bottle);
  return {
    ...changedFields(current, original),
    ...(current.storageLocationId === original.storageLocationId
      ? {}
      : { positionHint: current.positionHint }),
    ...(Object.keys(wine).length === 0 ? { wine: undefined } : { wine }),
    ...(Object.keys(bottle).length === 0 ? { bottle: undefined } : { bottle }),
  };
}

function editablePayload(submission: BottleModalSubmit) {
  const payload = bottleCreatePayload(submission);
  // The form does not edit the stored base name or designation.
  const { baseName: _baseName, designation: _designation, ...wine } = payload.wine;
  return {
    ...payload,
    wine: {
      ...wine,
      vintageYear: wine.vintageYear ?? null,
      alcoholPercent: wine.alcoholPercent ?? null,
      drinkFromYear: wine.drinkFromYear ?? null,
      drinkToYear: wine.drinkToYear ?? null,
    },
  };
}

function changedFields<T extends object>(current: T, original: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key in current) {
    if (
      Object.hasOwn(current, key) &&
      JSON.stringify(current[key]) !== JSON.stringify(original[key])
    ) {
      changed[key] = current[key];
    }
  }
  return changed;
}
