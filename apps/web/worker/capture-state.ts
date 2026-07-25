export { captureStatuses, isCaptureStatus, type CaptureStatus } from "../shared/capture-status.ts";
import type { CaptureStatus } from "../shared/capture-status.ts";

export function canRetryCapture(status: CaptureStatus): boolean {
  return status === "failed" || status === "needs_review";
}

export function canImportCapture(status: CaptureStatus): boolean {
  return status === "needs_review";
}

export function isTerminalCaptureStatus(status: CaptureStatus): boolean {
  return status === "imported" || status === "failed" || status === "upload_failed";
}
