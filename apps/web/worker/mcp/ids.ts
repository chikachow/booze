export type McpEntityKind = "critic_review" | "location" | "review_source" | "wine" | "winery";

function stableHash(value: string): bigint {
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0;
    hash = (hash * 1_099_511_628_211n + BigInt(codePoint)) % 18_446_744_073_709_551_616n;
    if (codePoint > 0xffff) {
      index += 1;
    }
  }
  return hash;
}

export function mcpEntityId(kind: McpEntityKind, persistedId: string): string {
  return `${kind}_${stableHash(`${kind}\0${persistedId}`).toString(36)}`;
}
