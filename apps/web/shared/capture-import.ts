import type { CaptureReviewCandidate } from "./capture-review.ts";

export type CaptureImportResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export type CaptureImportOptions = {
  readonly expectedReviewRevision: number;
  readonly allowUnidentified?: boolean;
};

export type CaptureImportAction = (
  captureId: string,
  wineVintageId?: string,
  options?: CaptureImportOptions,
) => Promise<CaptureImportResult>;

export type CaptureReviewSaveResult =
  | {
      readonly ok: true;
      readonly reviewRevision: number;
      readonly reviewCandidate: CaptureReviewCandidate;
    }
  | { readonly ok: false; readonly message: string };

export type CaptureReviewSaveAction = (
  captureId: string,
  expectedRevision: number,
  candidate: CaptureReviewCandidate,
) => Promise<CaptureReviewSaveResult>;
