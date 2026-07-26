/* oxlint-disable import/max-dependencies -- Bottle editing composes ASTRYX fields, dialogs, and domain adapters. */
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState, type ReactElement, type ReactNode } from "react";
import { useForm, type Control, type UseFormSetValue, type UseFormWatch } from "react-hook-form";

import { BottleLocationPicker } from "./BottleLocationPicker.tsx";
import { DestructiveActionDialog } from "./DestructiveActionDialog.tsx";
import {
  BottleQuantityInput,
  BottleTextArea,
  BottleTextInput,
  type BottleFormFieldProps,
} from "./BottleFormFields.tsx";
import {
  awardInputsForItem,
  criticReviewInputsForItem,
  validateAwards,
  validateCriticReviews,
  type AwardDraft,
  type AwardErrors,
  type ReviewErrors,
} from "./bottle-metadata.ts";
import type {
  CriticReviewInput,
  FormState,
  InventoryItem,
  LocationItem,
  SiteItem,
  WineAwardInput,
} from "./inventory-model.ts";

type BottleModalProps = {
  readonly form: FormState;
  readonly isSaving: boolean;
  readonly item?: InventoryItem;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly title: string;
  readonly onClose: () => void;
  readonly onDelete?: () => Promise<boolean>;
  readonly onMarkConsumed?: () => Promise<boolean>;
  readonly onSubmit: (input: BottleModalSubmit) => Promise<void>;
};

export type BottleModalSubmit = {
  readonly awards: readonly WineAwardInput[];
  readonly criticReviews: readonly CriticReviewInput[];
  readonly form: FormState;
};

type FormFieldConfig = Omit<BottleFormFieldProps, "control">;

const identityFields = [
  { label: "Label / brand", name: "brandName", placeholder: "Rowlee" },
  { label: "Winery", name: "wineryName", placeholder: "Rowlee Wines", required: true },
  {
    label: "Wine name",
    name: "displayName",
    placeholder: "Pinnacle Series Shiraz",
    required: true,
  },
  { label: "Vintage", name: "vintageYear", placeholder: "2023" },
  {
    label: "Grape varieties",
    name: "grapeVarieties",
    placeholder: "Shiraz, Cabernet Sauvignon",
  },
] satisfies readonly FormFieldConfig[];

const originFields = [
  { label: "Region", name: "region", placeholder: "Orange" },
  { label: "Country", name: "country", placeholder: "Australia" },
  { label: "Appellation", name: "appellation", placeholder: "Orange GI" },
  { label: "Classification", name: "classification", placeholder: "Grand Cru" },
  { label: "Style", name: "wineType", placeholder: "Red wine" },
  { label: "Colour", name: "wineColor", placeholder: "Red" },
  { label: "Alcohol", name: "alcoholPercent", placeholder: "13.5% alc/vol" },
] satisfies readonly FormFieldConfig[];

const referenceFields = [
  {
    label: "Description",
    name: "description",
    placeholder: "Visible winery description or tasting copy",
  },
  {
    label: "Drinking advice",
    name: "drinkingAdvice",
    placeholder: "Cellaring or serving advice",
  },
  { label: "Label text", name: "labelText", placeholder: "Paste label, OCR, or winery page text" },
  {
    label: "Wine notes",
    name: "wineNotes",
    placeholder: "Tasting notes, food pairing, source details",
  },
  {
    label: "Bottle notes",
    name: "bottleNotes",
    placeholder: "Condition, purchase source, box details",
  },
] satisfies readonly FormFieldConfig[];

export function BottleModal({
  form,
  isSaving,
  item,
  locations,
  sites,
  title,
  onClose,
  onDelete,
  onMarkConsumed,
  onSubmit,
}: BottleModalProps): ReactElement {
  const [criticReviews, setCriticReviews] = useState<readonly CriticReviewInput[]>(
    criticReviewInputsForItem(item),
  );
  const [awards, setAwards] = useState<readonly AwardDraft[]>(awardInputsForItem(item));
  const [reviewErrors, setReviewErrors] = useState<readonly ReviewErrors[]>([]);
  const [awardErrors, setAwardErrors] = useState<readonly AwardErrors[]>([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMarkingConsumed, setIsMarkingConsumed] = useState(false);
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormState>({ defaultValues: form });

  const submitForm = handleSubmit(async (values) => {
    const reviewsResult = validateCriticReviews(criticReviews);
    const awardsResult = validateAwards(awards);
    setReviewErrors(reviewsResult.errors);
    setAwardErrors(awardsResult.errors);
    if (!reviewsResult.ok || !awardsResult.ok) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[data-repeatable-error='true']")?.focus();
      });
      return;
    }
    await onSubmit({
      awards: awardsResult.values,
      criticReviews: reviewsResult.values,
      form: values,
    });
  });

  async function markConsumed(): Promise<void> {
    if (onMarkConsumed === undefined || isMarkingConsumed) {
      return;
    }
    setIsMarkingConsumed(true);
    setConsumeError(null);
    try {
      const updated = await onMarkConsumed();
      if (!updated) {
        setConsumeError("Bottle was not marked drunk. Try again.");
      }
    } catch {
      setConsumeError("Bottle was not marked drunk. Try again.");
    } finally {
      setIsMarkingConsumed(false);
    }
  }

  return (
    <>
      <Dialog
        isOpen
        maxHeight="calc(100dvh - 32px)"
        purpose="form"
        width="min(920px, calc(100vw - 32px))"
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) {
            onClose();
          }
        }}
      >
        <DialogHeader
          subtitle="Review the cellar record before saving."
          title={title}
          onOpenChange={(isOpen: boolean) => {
            if (!isOpen) {
              onClose();
            }
          }}
        />
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm(event);
          }}
        >
          <BottleFields
            control={control}
            disableSiteSelection={item !== undefined}
            locations={locations}
            setValue={setValue}
            showQuantity={item === undefined}
            sites={sites}
            watch={watch}
          />
          <CriticReviewFields
            errors={reviewErrors}
            reviews={criticReviews}
            onChange={(next) => {
              setCriticReviews(next);
              setReviewErrors([]);
            }}
          />
          <AwardFields
            awards={awards}
            errors={awardErrors}
            onChange={(next) => {
              setAwards(next);
              setAwardErrors([]);
            }}
          />
          <div className="dialog-actions">
            <Button
              isLoading={isSaving || isSubmitting}
              label="Save bottle"
              type="submit"
              variant="primary"
            />
            {onMarkConsumed === undefined ? null : (
              <Button
                isLoading={isMarkingConsumed}
                label="Mark drunk"
                onClick={() => {
                  void markConsumed();
                }}
              />
            )}
            {onDelete === undefined ? null : (
              <Button
                label="Delete bottle"
                variant="destructive"
                onClick={() => {
                  setIsDeleteOpen(true);
                }}
              />
            )}
            {consumeError === null ? null : <Banner status="error" title={consumeError} />}
          </div>
        </form>
      </Dialog>
      {onDelete === undefined ? null : (
        <DestructiveActionDialog
          actionLabel="Delete bottle"
          description="This permanently removes this bottle and its inventory record. This action cannot be undone."
          failureMessage="Bottle was not deleted. Try again."
          isOpen={isDeleteOpen}
          title="Delete this bottle?"
          onAction={onDelete}
          onOpenChange={setIsDeleteOpen}
        />
      )}
    </>
  );
}

function BottleFields({
  control,
  disableSiteSelection,
  locations,
  setValue,
  showQuantity,
  sites,
  watch,
}: {
  readonly control: Control<FormState>;
  readonly disableSiteSelection: boolean;
  readonly locations: readonly LocationItem[];
  readonly setValue: UseFormSetValue<FormState>;
  readonly showQuantity: boolean;
  readonly sites: readonly SiteItem[];
  readonly watch: UseFormWatch<FormState>;
}): ReactElement {
  const selectedSiteId = watch("siteId");
  const selectedStorageLocationId = watch("storageLocationId");
  return (
    <>
      <FormSection title="Wine identity">
        <FieldGrid control={control} fields={identityFields} />
      </FormSection>
      <FormSection title="Origin and style">
        <FieldGrid control={control} fields={originFields} />
      </FormSection>
      <FormSection title="Bottle and storage">
        <FieldGrid
          control={control}
          fields={[
            { label: "Bottle size", name: "bottleVolumeMl", placeholder: "750ml" },
            { label: "Barcode", name: "barcode", placeholder: "9342675000444" },
          ]}
        />
        <BottleLocationPicker
          disabledSite={disableSiteSelection}
          idPrefix={showQuantity ? "add-bottle-storage" : "edit-bottle-storage"}
          locations={locations}
          selectedSiteId={selectedSiteId}
          selectedStorageLocationId={selectedStorageLocationId}
          sites={sites}
          onChange={(selection) => {
            setValue("siteId", selection.siteId, { shouldDirty: true, shouldTouch: true });
            setValue("site", selection.site, { shouldDirty: true, shouldTouch: true });
            setValue("storageLocationId", selection.storageLocationId, {
              shouldDirty: true,
              shouldTouch: true,
            });
            setValue("location", selection.location, { shouldDirty: true, shouldTouch: true });
          }}
        />
        <FieldGrid
          control={control}
          fields={
            showQuantity
              ? [{ label: "Lot code", name: "lotCode", placeholder: "L23051" }]
              : [
                  { label: "Lot code", name: "lotCode", placeholder: "L23051" },
                  { label: "Position note", name: "position", placeholder: "Row 3, slot 2" },
                ]
          }
        />
        {showQuantity ? <BottleQuantityInput control={control} /> : null}
        <BottleTextArea
          control={control}
          label="Producer address"
          name="addressQualification"
          placeholder="Produced by, bottled by, or address"
        />
        {showQuantity ? (
          <BottleTextInput
            control={control}
            label="Position note"
            name="position"
            placeholder="Row 3, slot 2"
          />
        ) : null}
      </FormSection>
      <FormSection title="Drink window">
        <FieldGrid
          control={control}
          fields={[
            { label: "Drink from", name: "drinkFromYear", placeholder: "2025" },
            { label: "Drink to", name: "drinkToYear", placeholder: "2032" },
            { label: "Source URL", name: "sourceUrl", placeholder: "https://winery.example/wine" },
          ]}
        />
      </FormSection>
      <FormSection title="Wine reference">
        {referenceFields.map((field) => (
          <BottleTextArea control={control} key={field.name} {...field} />
        ))}
      </FormSection>
    </>
  );
}

function FormSection({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}): ReactElement {
  return (
    <section className="form-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function FieldGrid({
  control,
  fields,
}: {
  readonly control: Control<FormState>;
  readonly fields: readonly FormFieldConfig[];
}): ReactElement {
  return (
    <div className="field-row">
      {fields.map((field) => (
        <BottleTextInput control={control} key={field.name} {...field} />
      ))}
    </div>
  );
}

function CriticReviewFields({
  errors,
  reviews,
  onChange,
}: {
  readonly errors: readonly ReviewErrors[];
  readonly reviews: readonly CriticReviewInput[];
  readonly onChange: (reviews: readonly CriticReviewInput[]) => void;
}): ReactElement {
  const update = (index: number, patch: Partial<CriticReviewInput>): void => {
    onChange(
      reviews.map((review, reviewIndex) =>
        reviewIndex === index ? { ...review, ...patch } : review,
      ),
    );
  };
  return (
    <FormSection title="Critic reviews">
      <div className="section-heading">
        <p className="field-hint">Record ratings and your own source notes.</p>
        <Button
          label="Add review"
          onClick={() => {
            onChange([...reviews, { ratingText: "", reviewSourceName: "" }]);
          }}
        />
      </div>
      {reviews.length === 0 ? (
        <p className="field-hint">No critic reviews recorded.</p>
      ) : (
        <div className="review-edit-list">
          {reviews.map((review, index) => {
            const error = errors[index];
            return (
              <div className="review-edit-row" key={review.id ?? `review-${index}`}>
                <div className="field-row">
                  <TextInput
                    autoComplete="off"
                    data-repeatable-error={
                      error?.reviewSourceName === undefined ? undefined : "true"
                    }
                    htmlName={`criticReviews.${index}.reviewSourceName`}
                    isRequired
                    label="Source"
                    placeholder="Halliday Wine Companion"
                    value={review.reviewSourceName ?? ""}
                    status={
                      error?.reviewSourceName === undefined
                        ? undefined
                        : { message: error.reviewSourceName, type: "error" }
                    }
                    onChange={(value: string) => {
                      update(index, { reviewSourceName: value });
                    }}
                  />
                  <TextInput
                    autoComplete="off"
                    data-repeatable-error={error?.ratingText === undefined ? undefined : "true"}
                    htmlName={`criticReviews.${index}.ratingText`}
                    isRequired
                    label="Rating"
                    placeholder="95 points"
                    value={review.ratingText}
                    status={
                      error?.ratingText === undefined
                        ? undefined
                        : { message: error.ratingText, type: "error" }
                    }
                    onChange={(value: string) => {
                      update(index, { ratingText: value });
                    }}
                  />
                  <TextInput
                    autoComplete="url"
                    htmlName={`criticReviews.${index}.sourceUrl`}
                    label="Source URL"
                    placeholder="https://example.com/review"
                    value={review.sourceUrl ?? ""}
                    onChange={(value: string) => {
                      update(index, { sourceUrl: value });
                    }}
                  />
                  <TextInput
                    autoComplete="off"
                    htmlName={`criticReviews.${index}.provenance`}
                    label="Provenance"
                    placeholder="Guide, database, or note"
                    value={review.provenance ?? ""}
                    onChange={(value: string) => {
                      update(index, { provenance: value });
                    }}
                  />
                </div>
                <TextArea
                  htmlName={`criticReviews.${index}.notes`}
                  label="Notes"
                  value={review.notes ?? ""}
                  onChange={(value: string) => {
                    update(index, { notes: value });
                  }}
                />
                <Button
                  label="Remove review"
                  variant="destructive"
                  onClick={() => {
                    onChange(reviews.filter((_, reviewIndex) => reviewIndex !== index));
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </FormSection>
  );
}

function AwardFields({
  awards,
  errors,
  onChange,
}: {
  readonly awards: readonly AwardDraft[];
  readonly errors: readonly AwardErrors[];
  readonly onChange: (awards: readonly AwardDraft[]) => void;
}): ReactElement {
  const update = (index: number, patch: Partial<AwardDraft>): void => {
    onChange(
      awards.map((award, awardIndex) => (awardIndex === index ? { ...award, ...patch } : award)),
    );
  };
  return (
    <FormSection title="Awards">
      <div className="section-heading">
        <p className="field-hint">Track medals, competitions, and source context.</p>
        <Button
          label="Add award"
          onClick={() => {
            onChange([...awards, { awardLevel: "", awardName: "", awardYear: "", points: "" }]);
          }}
        />
      </div>
      {awards.length === 0 ? (
        <p className="field-hint">No awards recorded.</p>
      ) : (
        <div className="review-edit-list">
          {awards.map((award, index) => {
            const error = errors[index];
            return (
              <div className="review-edit-row" key={award.id ?? `award-${index}`}>
                <div className="field-row">
                  <AwardTextInput
                    error={error?.awardLevel}
                    htmlName={`awards.${index}.awardLevel`}
                    isRequired
                    label="Award"
                    placeholder="Gold Medal"
                    value={award.awardLevel}
                    onChange={(value) => {
                      update(index, { awardLevel: value });
                    }}
                  />
                  <AwardTextInput
                    error={error?.awardYear}
                    htmlName={`awards.${index}.awardYear`}
                    label="Year"
                    placeholder="2024"
                    value={award.awardYear}
                    onChange={(value) => {
                      update(index, { awardYear: value });
                    }}
                  />
                  <AwardTextInput
                    error={error?.awardName}
                    htmlName={`awards.${index}.awardName`}
                    isRequired
                    label="Competition or source"
                    value={award.awardName}
                    onChange={(value) => {
                      update(index, { awardName: value });
                    }}
                  />
                  <AwardTextInput
                    htmlName={`awards.${index}.awardBody`}
                    label="Body"
                    value={award.awardBody ?? ""}
                    onChange={(value) => {
                      update(index, { awardBody: value });
                    }}
                  />
                  <AwardTextInput
                    htmlName={`awards.${index}.category`}
                    label="Class or category"
                    value={award.category ?? ""}
                    onChange={(value) => {
                      update(index, { category: value });
                    }}
                  />
                  <AwardTextInput
                    error={error?.points}
                    htmlName={`awards.${index}.points`}
                    label="Points"
                    value={award.points}
                    onChange={(value) => {
                      update(index, { points: value });
                    }}
                  />
                  <AwardTextInput
                    htmlName={`awards.${index}.sourceUrl`}
                    label="Source URL"
                    value={award.sourceUrl ?? ""}
                    onChange={(value) => {
                      update(index, { sourceUrl: value });
                    }}
                  />
                  <AwardTextInput
                    htmlName={`awards.${index}.provenance`}
                    label="Provenance"
                    value={award.provenance ?? ""}
                    onChange={(value) => {
                      update(index, { provenance: value });
                    }}
                  />
                </div>
                <TextArea
                  htmlName={`awards.${index}.notes`}
                  label="Notes"
                  value={award.notes ?? ""}
                  onChange={(value: string) => {
                    update(index, { notes: value });
                  }}
                />
                <Button
                  label="Remove award"
                  variant="destructive"
                  onClick={() => {
                    onChange(awards.filter((_, awardIndex) => awardIndex !== index));
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </FormSection>
  );
}

function AwardTextInput({
  error,
  htmlName,
  isRequired = false,
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly error?: string | undefined;
  readonly htmlName: string;
  readonly isRequired?: boolean;
  readonly label: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <TextInput
      autoComplete="off"
      data-repeatable-error={error === undefined ? undefined : "true"}
      htmlName={htmlName}
      isRequired={isRequired}
      label={label}
      placeholder={placeholder}
      status={error === undefined ? undefined : { message: error, type: "error" }}
      value={value}
      onChange={onChange}
    />
  );
}
