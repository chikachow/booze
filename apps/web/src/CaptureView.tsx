import { useEffect, useState, type ReactElement } from "react";

import type {
  CaptureFormState,
  CaptureImageResource,
  CaptureResource,
  LocationItem,
  SiteItem,
} from "./inventory-model.ts";
import { storageLocationLabel } from "./inventory-model.ts";
import { BottleLocationPicker } from "./BottleLocationPicker.tsx";

/* oxlint-disable eslint/no-use-before-define */

type CaptureAreaProps = {
  readonly captures: readonly CaptureResource[];
  readonly form: CaptureFormState;
  readonly isSaving: boolean;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly writableSiteIds: ReadonlySet<string>;
  readonly setForm: (form: CaptureFormState) => void;
  readonly onDelete: (captureId: string) => Promise<void>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<void>;
  readonly onRetry: (captureId: string) => Promise<void>;
  readonly onSubmit: (
    form: CaptureFormState,
    files: readonly File[],
  ) => Promise<CaptureSubmitResult>;
};

export type CaptureSubmitResult =
  | {
      readonly kind: "submitted";
      readonly message: string;
    }
  | {
      readonly kind: "saved_with_error";
      readonly message: string;
    }
  | {
      readonly kind: "failed";
      readonly message: string;
    };

export function CaptureArea({
  captures,
  form,
  isSaving,
  locations,
  sites,
  writableSiteIds,
  setForm,
  onDelete,
  onImport,
  onRetry,
  onSubmit,
}: CaptureAreaProps): ReactElement {
  const [files, setFiles] = useState<readonly File[]>([]);
  const [submitResult, setSubmitResult] = useState<CaptureSubmitResult | null>(null);
  const [previewUrls, setPreviewUrls] = useState<readonly string[]>([]);

  useEffect(() => {
    const nextPreviewUrls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(nextPreviewUrls);
    return () => {
      for (const previewUrl of nextPreviewUrls) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [files]);

  useEffect(() => {
    if (form.siteId !== "" || sites.length === 0) {
      return;
    }
    const site = sites[0];
    if (site === undefined) {
      return;
    }
    setForm({
      ...form,
      siteId: site.siteId,
      site: site.site,
      storageLocationId: "",
      location: "",
    });
  }, [form, setForm, sites]);

  async function submitCapture(): Promise<void> {
    setSubmitResult(null);
    const result = await onSubmit(form, files);
    setSubmitResult(result);
    if (result.kind !== "failed") {
      setFiles([]);
    }
  }

  return (
    <section className="workspace" aria-labelledby="capture-title">
      <div className="workspace-header">
        <div>
          <p>Capture</p>
          <h2 id="capture-title">Photograph bottles</h2>
        </div>
      </div>

      {writableSiteIds.size === 0 ? (
        <p className="field-hint">You have read-only access to these captures.</p>
      ) : (
        <form
          className="capture-form"
          onSubmit={(event) => {
            event.preventDefault();
            // oxlint-disable-next-line no-void
            void submitCapture();
          }}
        >
          <div className="form-section">
            <h3>Location</h3>
            <BottleLocationPicker
              idPrefix="capture-storage"
              locations={locations}
              selectedSiteId={form.siteId}
              selectedStorageLocationId={form.storageLocationId}
              sites={sites}
              onChange={(selection) => {
                setForm({
                  ...form,
                  siteId: selection.siteId,
                  site: selection.site,
                  storageLocationId: selection.storageLocationId,
                  location: selection.location,
                });
              }}
            />
            <div className="field-row">
              <label>
                Position note
                <input
                  autoComplete="off"
                  value={form.position}
                  onChange={(event) => {
                    setForm({ ...form, position: event.currentTarget.value });
                  }}
                  placeholder="row 3, slot 2"
                />
              </label>
              <label>
                Quantity
                <input
                  required
                  inputMode="numeric"
                  min="1"
                  max="24"
                  type="number"
                  value={form.quantity}
                  onChange={(event) => {
                    setForm({ ...form, quantity: event.currentTarget.value });
                  }}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Images</h3>
            <label>
              Bottle photos
              <input
                accept="image/*,.heic,.heif"
                multiple
                required={files.length === 0}
                type="file"
                onChange={(event) => {
                  setFiles([...files, ...Array.from(event.currentTarget.files ?? [])].slice(0, 4));
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {files.length === 0 ? null : (
              <ul className="photo-list" aria-label="Selected bottle photos">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <img alt="" className="photo-thumbnail" src={previewUrls[index]} />
                    <span>{file.name}</span>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => {
                        setFiles(files.filter((_, fileIndex) => fileIndex !== index));
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="primary-action"
              disabled={isSaving || files.length === 0}
              type="submit"
            >
              {isSaving ? "Submitting..." : "Submit capture"}
            </button>
            {submitResult === null ? null : (
              <p className={`form-message form-message-${submitResult.kind}`} role="status">
                {submitResult.message}
              </p>
            )}
          </div>
        </form>
      )}

      <CaptureDashboard
        captures={captures}
        locations={locations}
        writableSiteIds={writableSiteIds}
        onDelete={onDelete}
        onImport={onImport}
        onRetry={onRetry}
      />
    </section>
  );
}

function CaptureDashboard({
  captures,
  locations,
  writableSiteIds,
  onDelete,
  onImport,
  onRetry,
}: {
  readonly captures: readonly CaptureResource[];
  readonly locations: readonly LocationItem[];
  readonly writableSiteIds: ReadonlySet<string>;
  readonly onDelete: (captureId: string) => Promise<void>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<void>;
  readonly onRetry: (captureId: string) => Promise<void>;
}): ReactElement {
  const [showAll, setShowAll] = useState(false);

  if (captures.length === 0) {
    return (
      <div className="empty-state">
        <h3>No captures yet</h3>
        <p>Submit bottle photos here and imported bottles will appear in inventory.</p>
      </div>
    );
  }

  const actionableCaptures = captures.filter((capture) => isActionableCapture(capture));
  const displayedCaptures = showAll ? captures : actionableCaptures;
  const hiddenCaptureCount = captures.length - actionableCaptures.length;

  return (
    <>
      <div className="capture-list-header">
        <div>
          <h3>{showAll ? "All captures" : "Action needed"}</h3>
          <p>
            {actionableCaptures.length === 0
              ? "No captures need action."
              : `${actionableCaptures.length} capture${actionableCaptures.length === 1 ? "" : "s"} need action.`}
          </p>
        </div>
        {hiddenCaptureCount === 0 ? null : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setShowAll(!showAll);
            }}
          >
            {showAll ? "Show action needed" : `Show all ${captures.length}`}
          </button>
        )}
      </div>
      {displayedCaptures.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing to action</h3>
          <p>{hiddenCaptureCount} successful capture imported without review.</p>
        </div>
      ) : (
        <div className="capture-list">
          {displayedCaptures.map((capture) => (
            <CaptureCard
              capture={capture}
              canWrite={writableSiteIds.has(capture.siteId)}
              key={capture.id}
              locations={locations}
              onDelete={onDelete}
              onImport={onImport}
              onRetry={onRetry}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CaptureCard({
  canWrite,
  capture,
  locations,
  onDelete,
  onImport,
  onRetry,
}: {
  readonly canWrite: boolean;
  readonly capture: CaptureResource;
  readonly locations: readonly LocationItem[];
  readonly onDelete: (captureId: string) => Promise<void>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<void>;
  readonly onRetry: (captureId: string) => Promise<void>;
}): ReactElement {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <article className={`capture-card capture-${capture.status}`}>
      <div className="card-title">
        <div>
          <h3>{captureTitle(capture)}</h3>
          <p>{captureStoragePath(capture, locations)}</p>
        </div>
        <span>{captureLabel(capture.status)}</span>
      </div>
      <div className="capture-thumbnails">
        {capture.images.map((image) => (
          <CaptureThumbnail image={image} key={image.imageAssetId} />
        ))}
      </div>
      <dl>
        <div>
          <dt>Quantity</dt>
          <dd>{capture.quantity}</dd>
        </div>
        <div>
          <dt>Candidate</dt>
          <dd>{candidateLabel(capture.latestRun?.importCandidate)}</dd>
        </div>
        <div>
          <dt>Issue</dt>
          <dd>
            <CaptureIssue
              message={capture.errorMessage ?? capture.latestRun?.errorMessage ?? null}
            />
          </dd>
        </div>
      </dl>
      <div className="card-actions">
        {canWrite && capture.status === "needs_review"
          ? wineVintageCandidates(capture.latestRun?.matchResult).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  // oxlint-disable-next-line no-void
                  void onImport(capture.id, candidate.id);
                }}
              >
                Use {candidate.label}
              </button>
            ))
          : null}
        {canWrite && capture.status === "needs_review" ? (
          <button
            type="button"
            onClick={() => {
              // oxlint-disable-next-line no-void
              void onImport(capture.id);
            }}
          >
            Create new
          </button>
        ) : null}
        {canWrite && (capture.status === "failed" || capture.status === "needs_review") ? (
          <button
            type="button"
            onClick={() => {
              // oxlint-disable-next-line no-void
              void onRetry(capture.id);
            }}
          >
            Retry
          </button>
        ) : null}
        {canWrite && isCaptureDeletable(capture) ? (
          confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => {
                  // oxlint-disable-next-line no-void
                  void onDelete(capture.id);
                }}
              >
                Delete permanently
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(true);
              }}
            >
              Delete capture
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}

function isCaptureDeletable(capture: CaptureResource): boolean {
  return !["queued", "extracting", "importing"].includes(capture.status);
}

function isActionableCapture(capture: CaptureResource): boolean {
  return (
    capture.status === "failed" ||
    capture.status === "needs_review" ||
    capture.status === "upload_failed"
  );
}

function CaptureIssue({ message }: { readonly message: string | null }): ReactElement {
  if (message === null || message === "") {
    return <span>None</span>;
  }

  const preview = compactIssuePreview(message);
  if (message.length <= preview.length) {
    return <span className="capture-issue">{message}</span>;
  }

  return (
    <details className="capture-issue-details">
      <summary>{preview}</summary>
      <p>{message}</p>
    </details>
  );
}

function compactIssuePreview(message: string): string {
  const firstLine = message.split("\n", 1)[0]?.trim() ?? "";
  const preview = firstLine === "" ? message.trim() : firstLine;
  return preview.length <= 180 ? preview : `${preview.slice(0, 177)}...`;
}

function captureStoragePath(capture: CaptureResource, locations: readonly LocationItem[]): string {
  return `${capture.siteName} / ${storageLocationLabel({
    locationId: capture.storageLocationId,
    locationName: capture.storageLocationName,
    locations,
  })}`;
}

function CaptureThumbnail({ image }: { readonly image: CaptureImageResource }): ReactElement {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image.imageUrl]);

  if (failed) {
    return (
      <span
        aria-label={thumbnailFallbackLabel(image)}
        className="photo-thumbnail photo-thumbnail-fallback"
        role="img"
      >
        {thumbnailFileType(image)}
      </span>
    );
  }

  return (
    <img
      alt=""
      className="photo-thumbnail"
      src={image.imageUrl}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

function thumbnailFallbackLabel(image: CaptureImageResource): string {
  const filename = image.originalFilename ?? "Bottle photo";
  return `${filename} thumbnail unavailable`;
}

function thumbnailFileType(image: CaptureImageResource): string {
  const contentType = image.contentType.toLowerCase();
  if (contentType.includes("heic")) {
    return "HEIC";
  }
  if (contentType.includes("heif")) {
    return "HEIF";
  }
  return "IMG";
}

function captureTitle(capture: CaptureResource): string {
  const candidate = candidateLabel(capture.latestRun?.importCandidate);
  return candidate === "No candidate yet" ? `Capture ${capture.id.slice(0, 8)}` : candidate;
}

function candidateLabel(value: unknown): string {
  const wine = objectField(value, "wine");
  const displayName = stringField(wine, "displayName") ?? stringField(wine, "designation");
  const wineryName = stringField(wine, "wineryName");
  return (
    [wineryName, displayName].filter((part) => part !== undefined && part !== "").join(" / ") ||
    "No candidate yet"
  );
}

function wineVintageCandidates(
  value: unknown,
): readonly { readonly id: string; readonly label: string }[] {
  const candidates = objectField(value, "wineVintageCandidates");
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.flatMap((candidate) => {
    const id = stringField(candidate, "id");
    const label = stringField(candidate, "label");
    return id === undefined || label === undefined ? [] : [{ id, label }];
  });
}

const captureLabels = {
  queued: "Queued",
  extracting: "Extracting",
  importing: "Importing",
  upload_failed: "Upload failed",
  needs_review: "Review",
  imported: "Imported",
  failed: "Failed",
} satisfies Record<CaptureResource["status"], string>;

function captureLabel(status: CaptureResource["status"]): string {
  return captureLabels[status];
}

function objectField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(value, field)?.value;
}

function stringField(value: unknown, field: string): string | undefined {
  const fieldValue = objectField(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
