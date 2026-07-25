export const MIN_BOTTLE_QUANTITY = 1;
export const MAX_BOTTLE_QUANTITY = 24;
export const BOTTLE_QUANTITY_ERROR = `Quantity must be a whole number from ${MIN_BOTTLE_QUANTITY} to ${MAX_BOTTLE_QUANTITY}.`;

export type QuantityResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

export function validateBottleQuantity(value: unknown): QuantityResult {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  return Number.isInteger(candidate) &&
    candidate >= MIN_BOTTLE_QUANTITY &&
    candidate <= MAX_BOTTLE_QUANTITY
    ? { ok: true, value: candidate }
    : { ok: false, message: BOTTLE_QUANTITY_ERROR };
}
