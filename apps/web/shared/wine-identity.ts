export type VintageStatus = "year" | "non_vintage" | "unknown";

type WineDescription = {
  readonly wineryName?: string | null | undefined;
  readonly brandName?: string | null | undefined;
  readonly designation?: string | null | undefined;
  readonly displayName?: string | null | undefined;
  readonly grapeVarieties?: readonly string[] | undefined;
  readonly appellation?: string | null | undefined;
  readonly vintageYear?: number | null | undefined;
  readonly vintageStatus?: VintageStatus | undefined;
};

export function wineVintageStatus(wine: WineDescription): VintageStatus {
  return (
    wine.vintageStatus ??
    (wine.vintageYear === null || wine.vintageYear === undefined ? "unknown" : "year")
  );
}

export function vintageLabel(wine: WineDescription): string {
  const status = wineVintageStatus(wine);
  if (status === "non_vintage") return "NV";
  if (status === "year" && wine.vintageYear !== null && wine.vintageYear !== undefined)
    return String(wine.vintageYear);
  return "Unknown";
}

export function hasWineIdentity(wine: WineDescription): boolean {
  return (
    (nonempty(wine.wineryName) !== undefined || nonempty(wine.brandName) !== undefined) &&
    (nonempty(wine.designation) !== undefined ||
      nonempty(wine.appellation) !== undefined ||
      (wine.grapeVarieties ?? []).some((grape) => grape.trim() !== ""))
  );
}

// These are descriptions, never uniqueness or matching keys. Label wording
// remains in the capture evidence; a composed title is not a proprietary name.
export function formatWineDisplayName(wine: WineDescription): string {
  const producer = nonempty(wine.brandName) ?? nonempty(wine.wineryName);
  const descriptor =
    nonempty(wine.grapeVarieties?.filter((grape) => grape.trim() !== "").join(" / ")) ??
    nonempty(wine.appellation);
  const parts = [producer, wine.designation?.trim(), descriptor].filter((part): part is string =>
    Boolean(part),
  );
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((existing) => containsWords(existing, part))) unique.push(part);
  }
  return unique.join(" ") || "Unidentified wine";
}

export function formatWineLabel(wine: WineDescription): string {
  const vintage = vintageLabel(wine);
  return `${vintage === "Unknown" ? "" : `${vintage} `}${formatWineDisplayName(wine)}`;
}

function containsWords(text: string, part: string): boolean {
  return ` ${text.toLocaleLowerCase()} `.includes(` ${part.toLocaleLowerCase()} `);
}

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}
