const captureArtifactContentType = "application/json";

export type CaptureRunArtifactKind = "error" | "extraction";

type CaptureArtifactBucket = {
  readonly put: (
    key: string,
    value: string,
    options: { readonly httpMetadata: { readonly contentType: string } },
  ) => Promise<unknown>;
};

export type CaptureRunArtifact = {
  readonly contentType: string;
  readonly r2Key: string;
  readonly sizeBytes: number;
};

export function captureRunArtifactKey({
  captureId,
  kind,
  runId,
  siteId,
}: {
  readonly captureId: string;
  readonly kind: CaptureRunArtifactKind;
  readonly runId: string;
  readonly siteId: string;
}): string {
  return `sites/${siteId}/captures/${captureId}/runs/${runId}/${kind}.json`;
}

export async function putCaptureRunArtifact({
  bucket,
  captureId,
  kind,
  runId,
  siteId,
  value,
}: {
  readonly bucket: CaptureArtifactBucket;
  readonly captureId: string;
  readonly kind: CaptureRunArtifactKind;
  readonly runId: string;
  readonly siteId: string;
  readonly value: unknown;
}): Promise<CaptureRunArtifact> {
  const r2Key = captureRunArtifactKey({ captureId, kind, runId, siteId });
  const body = JSON.stringify(value);
  if (body === undefined) {
    throw new Error("Capture artifact value must be JSON serializable");
  }
  const sizeBytes = new TextEncoder().encode(body).byteLength;
  await bucket.put(r2Key, body, { httpMetadata: { contentType: captureArtifactContentType } });
  return { contentType: captureArtifactContentType, r2Key, sizeBytes };
}
