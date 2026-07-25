export const captureStatuses = [
  "queued",
  "extracting",
  "importing",
  "upload_failed",
  "needs_review",
  "imported",
  "failed",
] as const;

export type CaptureStatus = (typeof captureStatuses)[number];

export function isCaptureStatus(value: string): value is CaptureStatus {
  return captureStatuses.some((status) => status === value);
}

export function canRetryCapture(status: CaptureStatus): boolean {
  return status === "failed" || status === "needs_review";
}

export function canImportCapture(status: CaptureStatus): boolean {
  return status === "needs_review";
}

export function isTerminalCaptureStatus(status: CaptureStatus): boolean {
  return status === "imported" || status === "failed" || status === "upload_failed";
}
