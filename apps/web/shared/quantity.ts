export const MIN_BOTTLE_QUANTITY = 1;
export const MAX_BOTTLE_QUANTITY = 24;
export const BOTTLE_QUANTITY_ERROR = `Quantity must be a whole number from ${MIN_BOTTLE_QUANTITY} to ${MAX_BOTTLE_QUANTITY}.`;

export type QuantityResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

export function validateBottleQuantity(value: unknown): QuantityResult {
  // Normalize full-width decimal digits only; do not coerce fractions or numeric prefixes.
  const normalized =
    typeof value === "string"
      ? value
          .replaceAll(/[０-９]/gu, (digit) => String("０１２３４５６７８９".indexOf(digit)))
          .trim()
      : value;
  const candidate =
    typeof normalized === "number"
      ? normalized
      : typeof normalized === "string" && /^\d+$/u.test(normalized)
        ? Number(normalized)
        : Number.NaN;

  return Number.isInteger(candidate) &&
    candidate >= MIN_BOTTLE_QUANTITY &&
    candidate <= MAX_BOTTLE_QUANTITY
    ? { ok: true, value: candidate }
    : { ok: false, message: BOTTLE_QUANTITY_ERROR };
}
