import type { ReactElement } from "react";

import type { CaptureRunResource } from "./inventory-model.ts";

const wineFields = [
  ["wineryName", "Winery"],
  ["brandName", "Label / brand"],
  ["displayName", "Wine name"],
  ["baseName", "Base name"],
  ["designation", "Designation"],
  ["vintageYear", "Vintage"],
  ["grapeVarieties", "Grape varieties"],
  ["country", "Country"],
  ["region", "Region"],
  ["appellation", "Appellation"],
  ["classification", "Classification"],
  ["wineType", "Style"],
  ["wineColor", "Colour"],
  ["addressQualification", "Producer address"],
  ["alcoholPercent", "Alcohol (%)"],
  ["drinkFromYear", "Drink from"],
  ["drinkToYear", "Drink to"],
  ["description", "Description"],
  ["drinkingAdvice", "Drinking advice"],
  ["labelText", "Label text"],
  ["sourceUrl", "Source URL"],
  ["notes", "Wine notes and extraction disagreements"],
] as const;

const bottleFields = [
  ["bottleNumber", "Bottle number"],
  ["volumeMl", "Bottle size (ml)"],
  ["barcode", "Barcode"],
  ["lotCode", "Lot code"],
  ["notes", "Bottle notes"],
] as const;

export function hasCaptureCandidate(run: CaptureRunResource | null): boolean {
  const wine = objectField(run?.importCandidate, "wine");
  return typeof wine === "object" && wine !== null;
}

export function CaptureReview({ run }: { readonly run: CaptureRunResource | null }): ReactElement {
  if (!hasCaptureCandidate(run)) {
    return <p>Extracted facts are unavailable. Retry extraction before importing this capture.</p>;
  }
  const wine = objectField(run?.importCandidate, "wine");
  const bottle = objectField(run?.importCandidate, "bottle");
  const reasons = stringValues(objectField(run?.importResult, "reviewReasons"));
  return (
    <details className="capture-disclosure" open>
      <summary>Review extracted facts</summary>
      <div className="capture-review">
        <p>
          Check these facts against the photos before choosing an existing wine or creating a new
          one. If they are incorrect, retry extraction.
        </p>
        {reasons.length === 0 ? null : (
          <ul aria-label="Reasons this capture needs review">
            {reasons.map((reason, index) => (
              <li key={`${index}-${reason}`}>{reason}</li>
            ))}
          </ul>
        )}
        <dl>
          {[...facts(wine, wineFields), ...facts(bottle, bottleFields)].map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function facts(
  value: unknown,
  fields: readonly (readonly [string, string])[],
): readonly { readonly label: string; readonly value: string }[] {
  return fields.flatMap(([key, label]) => {
    const field = objectField(value, key);
    const display =
      typeof field === "number"
        ? String(field)
        : typeof field === "string"
          ? field
          : stringValues(field).join(", ");
    return display.trim() === "" ? [] : [{ label, value: display }];
  });
}

function stringValues(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((part): part is string => typeof part === "string")
    : [];
}

function objectField(value: unknown, field: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, field)?.value
    : undefined;
}
