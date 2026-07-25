function stableSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

export function stableId(prefix: string, value: string): string {
  const slug = stableSlug(value).slice(0, 80);

  return `${prefix}_${slug === "" ? crypto.randomUUID() : slug}`;
}

export function generatedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function userIdForClerkUser(clerkUserId: string): string {
  return stableId("user", clerkUserId);
}

export function optionalText(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value.trim();
}

export function optionalInteger(value: number | undefined): number | null {
  return value ?? null;
}

export function vintageLabelForYear(vintageYear: number | undefined): string {
  return vintageYear === undefined ? "NV" : String(vintageYear);
}
