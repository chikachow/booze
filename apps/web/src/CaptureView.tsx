/* oxlint-disable import/max-dependencies -- Capture composes the ASTRYX upload, status, disclosure, and confirmation surfaces. */
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { useEffect, useRef, useState, type FocusEvent, type ReactElement } from "react";

import { validateBottleQuantity } from "../shared/quantity.ts";
import type {
  CaptureFormState,
  CaptureImageResource,
  CaptureResource,
  LocationItem,
  SiteItem,
} from "./inventory-model.ts";
import { storageLocationLabel } from "./inventory-model.ts";
import { BottleLocationPicker } from "./BottleLocationPicker.tsx";
import { DestructiveActionDialog } from "./DestructiveActionDialog.tsx";
import { MAX_CAPTURE_FILES, mergeCaptureFiles } from "./capture-files.ts";
import { captureStatus } from "./capture-status.ts";

type CaptureAreaProps = {
  readonly captures: readonly CaptureResource[];
  readonly form: CaptureFormState;
  readonly isSaving: boolean;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly writableSiteIds: ReadonlySet<string>;
  readonly setForm: (form: CaptureFormState) => void;
  readonly onDelete: (captureId: string) => Promise<boolean>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<boolean>;
  readonly onRetry: (captureId: string) => Promise<boolean>;
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
  const [fileSelectionMessage, setFileSelectionMessage] = useState<string | null>(null);
  const [isQuantityTouched, setIsQuantityTouched] = useState(false);
  const [submitResult, setSubmitResult] = useState<CaptureSubmitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quantityValidation = validateBottleQuantity(form.quantity);
  const numericQuantity = Number(form.quantity);

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
    const quantity = validateBottleQuantity(form.quantity);
    if (!quantity.ok) {
      setIsQuantityTouched(true);
      setSubmitResult({ kind: "failed", message: quantity.message });
      return;
    }
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
              <TextInput
                autoComplete="off"
                htmlName="capturePosition"
                label="Position note"
                placeholder="Row 3, slot 2"
                value={form.position}
                onChange={(value: string) => {
                  setForm({ ...form, position: value });
                }}
              />
              <NumberInput
                hasClear
                isRequired
                isIntegerOnly
                htmlName="quantity"
                description="Between 1 and 24 bottles."
                label="Quantity"
                status={
                  isQuantityTouched && !quantityValidation.ok
                    ? { message: quantityValidation.message, type: "error" }
                    : undefined
                }
                value={
                  form.quantity.trim() !== "" && Number.isFinite(numericQuantity)
                    ? numericQuantity
                    : null
                }
                onBlur={(event: FocusEvent<HTMLInputElement>) => {
                  setIsQuantityTouched(true);
                  setForm({ ...form, quantity: event.currentTarget.value });
                }}
                onChange={(value: number | null) => {
                  setForm({ ...form, quantity: value === null ? "" : String(value) });
                }}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Images</h3>
            <div className="capture-file-control">
              <div>
                <label htmlFor="capture-bottle-photos">
                  Bottle photos <span>Required</span>
                </label>
                <p id="capture-bottle-photos-description">
                  Add up to four clear label and bottle photos. {files.length} of{" "}
                  {MAX_CAPTURE_FILES} selected.
                </p>
              </div>
              <Button
                isDisabled={files.length >= MAX_CAPTURE_FILES}
                label={files.length === 0 ? "Choose bottle photos" : "Add more bottle photos"}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              />
              {/* ASTRYX FileInput 0.1.8 nests its native input inside role="button"
                  and forwards aria-required to that role. Keep this input as a
                  sibling of the ASTRYX trigger until upstream semantics are revalidated. */}
              <input
                ref={fileInputRef}
                accept="image/*,.heic,.heif"
                aria-describedby="capture-bottle-photos-description"
                className="capture-file-input"
                id="capture-bottle-photos"
                multiple
                tabIndex={-1}
                type="file"
                onChange={(event) => {
                  const selected = [...(event.currentTarget.files ?? [])];
                  const result = mergeCaptureFiles(files, selected);
                  setFileSelectionMessage(
                    result.rejectedCount === 0
                      ? null
                      : result.rejectedCount === 1
                        ? `Only ${MAX_CAPTURE_FILES} photos can be attached. 1 extra file was not added.`
                        : `Only ${MAX_CAPTURE_FILES} photos can be attached. ${result.rejectedCount} extra files were not added.`,
                  );
                  setFiles(result.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {fileSelectionMessage === null ? null : (
              <Banner status="warning" title={fileSelectionMessage} />
            )}
            {files.length === 0 ? null : (
              <ul className="photo-list" aria-label="Selected bottle photos">
                {files.map((file, index) => (
                  <SelectedPhoto
                    file={file}
                    key={`${file.name}-${file.size}-${file.type}-${file.lastModified}`}
                    onRemove={() => {
                      setFiles(files.filter((_, fileIndex) => fileIndex !== index));
                    }}
                  />
                ))}
              </ul>
            )}
            <Button
              isDisabled={files.length === 0}
              isLoading={isSaving}
              label="Submit capture"
              type="submit"
              variant="primary"
            />
            {submitResult === null ? null : (
              <Banner
                status={
                  submitResult.kind === "submitted"
                    ? "success"
                    : submitResult.kind === "failed"
                      ? "error"
                      : "warning"
                }
                title={submitResult.message}
              />
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

function SelectedPhoto({
  file,
  onRemove,
}: {
  readonly file: File;
  readonly onRemove: () => void;
}): ReactElement {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <li>
      <Thumbnail
        alt={`Preview of ${file.name}`}
        label={file.name}
        src={previewUrl}
        onRemove={onRemove}
      />
      <span>{file.name}</span>
    </li>
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
  readonly onDelete: (captureId: string) => Promise<boolean>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<boolean>;
  readonly onRetry: (captureId: string) => Promise<boolean>;
}): ReactElement {
  const [showAll, setShowAll] = useState(false);

  if (captures.length === 0) {
    return (
      <EmptyState
        description="Submit bottle photos here and imported bottles will appear in inventory."
        title="No captures yet"
      />
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
          <Button
            label={showAll ? "Show action needed" : `Show all ${captures.length}`}
            variant="secondary"
            onClick={() => {
              setShowAll(!showAll);
            }}
          />
        )}
      </div>
      {displayedCaptures.length === 0 ? (
        <EmptyState
          description={`${hiddenCaptureCount} successful capture imported without review.`}
          title="Nothing to action"
        />
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
  readonly onDelete: (captureId: string) => Promise<boolean>;
  readonly onImport: (captureId: string, wineVintageId?: string) => Promise<boolean>;
  readonly onRetry: (captureId: string) => Promise<boolean>;
}): ReactElement {
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingAction, setPendingAction] = useState<CaptureCardAction | null>(null);
  const pendingActionRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(
    pending: CaptureCardAction,
    action: () => Promise<boolean>,
  ): Promise<boolean> {
    if (pendingActionRef.current) {
      return false;
    }
    pendingActionRef.current = true;
    setPendingAction(pending);
    setActionError(null);
    try {
      const succeeded = await action();
      if (!succeeded) {
        setActionError(`${captureActionLabel(pending)} failed. Try again.`);
      }
      return succeeded;
    } catch {
      setActionError(`${captureActionLabel(pending)} failed. Try again.`);
      return false;
    } finally {
      pendingActionRef.current = false;
      setPendingAction(null);
    }
  }

  return (
    <article className={`capture-card capture-${capture.status}`}>
      <div className="card-title">
        <div>
          <h3>{captureTitle(capture)}</h3>
          <p>{captureStoragePath(capture, locations)}</p>
        </div>
        <Badge
          label={captureStatus(capture.status).label}
          variant={captureStatus(capture.status).badge}
        />
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
              <Button
                isDisabled={pendingAction !== null}
                isLoading={isCaptureAction(pendingAction, {
                  kind: "import",
                  wineVintageId: candidate.id,
                })}
                label={`Use ${candidate.label}`}
                size="sm"
                key={candidate.id}
                onClick={() => {
                  void runAction({ kind: "import", wineVintageId: candidate.id }, async () =>
                    onImport(capture.id, candidate.id),
                  );
                }}
              />
            ))
          : null}
        {canWrite && capture.status === "needs_review" ? (
          <Button
            isDisabled={pendingAction !== null}
            isLoading={isCaptureAction(pendingAction, { kind: "create" })}
            label="Create new"
            size="sm"
            onClick={() => {
              void runAction({ kind: "create" }, async () => onImport(capture.id));
            }}
          />
        ) : null}
        {canWrite && (capture.status === "failed" || capture.status === "needs_review") ? (
          <Button
            isDisabled={pendingAction !== null}
            isLoading={isCaptureAction(pendingAction, { kind: "retry" })}
            label="Retry"
            size="sm"
            onClick={() => {
              void runAction({ kind: "retry" }, async () => onRetry(capture.id));
            }}
          />
        ) : null}
        {canWrite && isCaptureDeletable(capture) ? (
          <Button
            ref={deleteTriggerRef}
            isDisabled={pendingAction !== null}
            label="Delete capture"
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirmingDelete(true);
            }}
          />
        ) : null}
      </div>
      {actionError === null ? null : (
        <Banner aria-live="assertive" status="error" title={actionError} />
      )}
      <DestructiveActionDialog
        actionLabel="Delete capture"
        description="This permanently removes the capture, its images, and processing history. This action cannot be undone."
        failureMessage="Delete failed. Try again."
        isOpen={confirmingDelete}
        returnFocusRef={deleteTriggerRef}
        title="Delete this capture?"
        onAction={async () => onDelete(capture.id)}
        onOpenChange={setConfirmingDelete}
      />
    </article>
  );
}

type CaptureCardAction =
  | { readonly kind: "create" }
  | { readonly kind: "import"; readonly wineVintageId: string }
  | { readonly kind: "retry" };

function captureActionLabel(action: CaptureCardAction): string {
  return action.kind === "create" ? "Create new" : action.kind === "retry" ? "Retry" : "Import";
}

function isCaptureAction(current: CaptureCardAction | null, expected: CaptureCardAction): boolean {
  return (
    current !== null &&
    current.kind === expected.kind &&
    (current.kind !== "import" ||
      (expected.kind === "import" && current.wineVintageId === expected.wineVintageId))
  );
}

function isCaptureDeletable(capture: CaptureResource): boolean {
  return captureStatus(capture.status).deletable;
}

function isActionableCapture(capture: CaptureResource): boolean {
  return captureStatus(capture.status).actionable;
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
    <Collapsible defaultIsOpen={false} trigger={preview}>
      <p>{message}</p>
    </Collapsible>
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
  return (
    <Thumbnail
      alt={image.originalFilename ?? "Bottle photo"}
      label={image.originalFilename ?? "Bottle photo"}
      src={image.imageUrl}
    />
  );
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
