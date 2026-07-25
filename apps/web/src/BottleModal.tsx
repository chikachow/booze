import { useEffect, useState, type ReactElement } from "react";
import {
  useForm,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";

import type {
  CriticReviewInput,
  CriticReviewResource,
  FormState,
  InventoryItem,
  LocationItem,
  SiteItem,
  WineAwardInput,
  WineAwardResource,
} from "./inventory-model.ts";
import { BottleLocationPicker } from "./BottleLocationPicker.tsx";

type BottleModalProps = {
  readonly form: FormState;
  readonly isSaving: boolean;
  readonly item?: InventoryItem;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly title: string;
  readonly onClose: () => void;
  readonly onDelete?: () => Promise<void>;
  readonly onMarkConsumed?: () => Promise<void>;
  readonly onSubmit: (input: BottleModalSubmit) => Promise<void>;
};

export type BottleModalSubmit = {
  readonly awards: readonly WineAwardInput[];
  readonly criticReviews: readonly CriticReviewInput[];
  readonly form: FormState;
};

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
  const [awards, setAwards] = useState<readonly WineAwardInput[]>(awardInputsForItem(item));
  const {
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormState>({ defaultValues: form });

  useEffect(() => {
    reset(form);
    setCriticReviews(criticReviewInputsForItem(item));
    setAwards(awardInputsForItem(item));
  }, [form, item, reset]);

  const submitForm = handleSubmit(async (values) =>
    onSubmit({
      awards: validAwards(awards),
      criticReviews: validCriticReviews(criticReviews),
      form: values,
    }),
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottle-modal-title"
      >
        <div className="modal-header">
          <div>
            <p>Bottle</p>
            <h2 id="bottle-modal-title">{title}</h2>
          </div>
          <button className="secondary-action" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <form
          className="entry-form modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm(event);
          }}
        >
          <BottleFields
            disableSiteSelection={item !== undefined}
            locations={locations}
            register={register}
            setValue={setValue}
            showQuantity={item === undefined}
            sites={sites}
            watch={watch}
          />
          <CriticReviewFields reviews={criticReviews} onChange={setCriticReviews} />
          <AwardFields awards={awards} onChange={setAwards} />
          <div className="modal-actions">
            <button className="primary-action" disabled={isSaving || isSubmitting} type="submit">
              {isSaving || isSubmitting ? "Saving..." : "Save bottle"}
            </button>
            {onMarkConsumed === undefined ? null : (
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  void onMarkConsumed();
                }}
              >
                Mark drunk
              </button>
            )}
            {onDelete === undefined ? null : (
              <button
                className="danger-action"
                type="button"
                onClick={() => {
                  void onDelete();
                }}
              >
                Delete bottle
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function criticReviewInputsForItem(item: InventoryItem | undefined): readonly CriticReviewInput[] {
  return (item?.criticReviews ?? []).map((review) => criticReviewInputForResource(review));
}

function awardInputsForItem(item: InventoryItem | undefined): readonly WineAwardInput[] {
  return (item?.awards ?? []).map((award) => awardInputForResource(award));
}

function criticReviewInputForResource(review: CriticReviewResource): CriticReviewInput {
  return {
    id: review.id,
    reviewSourceId: review.reviewSourceId,
    reviewSourceName: review.reviewSourceName,
    ratingText: review.ratingText,
    ratingValue: review.ratingValue ?? undefined,
    ratingScale: review.ratingScale ?? undefined,
    sourceUrl: review.sourceUrl ?? undefined,
    reviewedAt: review.reviewedAt ?? undefined,
    provenance: review.provenance ?? undefined,
    notes: review.notes ?? undefined,
  };
}

function awardInputForResource(award: WineAwardResource): WineAwardInput {
  return {
    id: award.id,
    awardName: award.awardName,
    awardLevel: award.awardLevel,
    awardYear: award.awardYear ?? undefined,
    awardBody: award.awardBody ?? undefined,
    category: award.category ?? undefined,
    points: award.points ?? undefined,
    sourceUrl: award.sourceUrl ?? undefined,
    provenance: award.provenance ?? undefined,
    notes: award.notes ?? undefined,
  };
}

function validCriticReviews(reviews: readonly CriticReviewInput[]): readonly CriticReviewInput[] {
  return reviews
    .map((review) => ({
      ...review,
      reviewSourceName: review.reviewSourceName?.trim(),
      ratingText: review.ratingText.trim(),
      sourceUrl: review.sourceUrl?.trim(),
      provenance: review.provenance?.trim(),
      notes: review.notes?.trim(),
    }))
    .filter(
      (review) =>
        review.ratingText !== "" &&
        (review.reviewSourceId !== undefined ||
          (review.reviewSourceName !== undefined && review.reviewSourceName !== "")),
    );
}

function validAwards(awards: readonly WineAwardInput[]): readonly WineAwardInput[] {
  return awards
    .map((award) => ({
      ...award,
      awardName: award.awardName.trim(),
      awardLevel: award.awardLevel.trim(),
      awardBody: award.awardBody?.trim(),
      category: award.category?.trim(),
      sourceUrl: award.sourceUrl?.trim(),
      provenance: award.provenance?.trim(),
      notes: award.notes?.trim(),
    }))
    .filter((award) => award.awardName !== "" && award.awardLevel !== "");
}

function CriticReviewFields({
  reviews,
  onChange,
}: {
  readonly reviews: readonly CriticReviewInput[];
  readonly onChange: (reviews: readonly CriticReviewInput[]) => void;
}): ReactElement {
  function updateReview(index: number, patch: Partial<CriticReviewInput>): void {
    onChange(
      reviews.map((review, reviewIndex) =>
        reviewIndex === index ? { ...review, ...patch } : review,
      ),
    );
  }

  return (
    <div className="form-section">
      <div className="section-heading">
        <h3>Critic reviews</h3>
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            onChange([...reviews, { reviewSourceName: "", ratingText: "" }]);
          }}
        >
          Add review
        </button>
      </div>
      {reviews.length === 0 ? (
        <p className="field-hint">No critic reviews recorded.</p>
      ) : (
        <div className="review-edit-list">
          {reviews.map((review, index) => (
            <div className="review-edit-row" key={review.id ?? `new-${index}`}>
              <div className="field-row">
                <label>
                  Source
                  <input
                    autoComplete="off"
                    value={review.reviewSourceName ?? ""}
                    placeholder="Halliday Wine Companion"
                    onChange={(event) => {
                      updateReview(index, { reviewSourceName: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Rating
                  <input
                    required
                    autoComplete="off"
                    value={review.ratingText}
                    placeholder="95 points"
                    onChange={(event) => {
                      updateReview(index, { ratingText: event.currentTarget.value });
                    }}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Source URL
                  <input
                    inputMode="url"
                    value={review.sourceUrl ?? ""}
                    placeholder="https://example.com/review"
                    onChange={(event) => {
                      updateReview(index, { sourceUrl: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Provenance
                  <input
                    autoComplete="off"
                    value={review.provenance ?? ""}
                    placeholder="Guide, subscription database, chat note"
                    onChange={(event) => {
                      updateReview(index, { provenance: event.currentTarget.value });
                    }}
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  value={review.notes ?? ""}
                  placeholder="User-authored context, not copied review prose"
                  onChange={(event) => {
                    updateReview(index, { notes: event.currentTarget.value });
                  }}
                />
              </label>
              <button
                className="danger-action"
                type="button"
                onClick={() => {
                  onChange(reviews.filter((_, reviewIndex) => reviewIndex !== index));
                }}
              >
                Remove review
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AwardFields({
  awards,
  onChange,
}: {
  readonly awards: readonly WineAwardInput[];
  readonly onChange: (awards: readonly WineAwardInput[]) => void;
}): ReactElement {
  function updateAward(index: number, patch: Partial<WineAwardInput>): void {
    onChange(
      awards.map((award, awardIndex) => (awardIndex === index ? { ...award, ...patch } : award)),
    );
  }

  return (
    <div className="form-section">
      <div className="section-heading">
        <h3>Awards</h3>
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            onChange([...awards, { awardName: "", awardLevel: "" }]);
          }}
        >
          Add award
        </button>
      </div>
      {awards.length === 0 ? (
        <p className="field-hint">No awards recorded.</p>
      ) : (
        <div className="review-edit-list">
          {awards.map((award, index) => (
            <div className="review-edit-row" key={award.id ?? `new-award-${index}`}>
              <div className="field-row">
                <label>
                  Award
                  <input
                    required
                    autoComplete="off"
                    value={award.awardLevel}
                    placeholder="Gold Medal"
                    onChange={(event) => {
                      updateAward(index, { awardLevel: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Year
                  <input
                    inputMode="numeric"
                    value={award.awardYear ?? ""}
                    placeholder="2024"
                    onChange={(event) => {
                      updateAward(index, { awardYear: optionalNumber(event.currentTarget.value) });
                    }}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Competition or source
                  <input
                    required
                    autoComplete="off"
                    value={award.awardName}
                    placeholder="NSW Small Winemakers Wine Show"
                    onChange={(event) => {
                      updateAward(index, { awardName: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Body
                  <input
                    autoComplete="off"
                    value={award.awardBody ?? ""}
                    placeholder="Angullong Wines"
                    onChange={(event) => {
                      updateAward(index, { awardBody: event.currentTarget.value });
                    }}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Class or category
                  <input
                    autoComplete="off"
                    value={award.category ?? ""}
                    placeholder="Shiraz - 2022 Vintage"
                    onChange={(event) => {
                      updateAward(index, { category: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Points
                  <input
                    inputMode="decimal"
                    value={award.points ?? ""}
                    placeholder="90"
                    onChange={(event) => {
                      updateAward(index, { points: optionalNumber(event.currentTarget.value) });
                    }}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Source URL
                  <input
                    inputMode="url"
                    value={award.sourceUrl ?? ""}
                    placeholder="https://example.com/results"
                    onChange={(event) => {
                      updateAward(index, { sourceUrl: event.currentTarget.value });
                    }}
                  />
                </label>
                <label>
                  Provenance
                  <input
                    autoComplete="off"
                    value={award.provenance ?? ""}
                    placeholder="Winery page, wine show result PDF"
                    onChange={(event) => {
                      updateAward(index, { provenance: event.currentTarget.value });
                    }}
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  value={award.notes ?? ""}
                  placeholder="User-authored award context"
                  onChange={(event) => {
                    updateAward(index, { notes: event.currentTarget.value });
                  }}
                />
              </label>
              <button
                className="danger-action"
                type="button"
                onClick={() => {
                  onChange(awards.filter((_, awardIndex) => awardIndex !== index));
                }}
              >
                Remove award
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function BottleFields({
  disableSiteSelection,
  locations,
  register,
  setValue,
  showQuantity,
  sites,
  watch,
}: {
  readonly disableSiteSelection: boolean;
  readonly locations: readonly LocationItem[];
  readonly register: UseFormRegister<FormState>;
  readonly setValue: UseFormSetValue<FormState>;
  readonly showQuantity: boolean;
  readonly sites: readonly SiteItem[];
  readonly watch: UseFormWatch<FormState>;
}): ReactElement {
  const selectedSiteId = watch("siteId");
  const selectedStorageLocationId = watch("storageLocationId");

  return (
    <>
      <div className="form-section">
        <h3>Wine identity</h3>
        <label>
          Label / brand
          <input autoComplete="off" {...register("brandName")} placeholder="Rowlee" />
        </label>
        <label>
          Winery
          <input
            required
            autoComplete="off"
            {...register("wineryName", { required: true })}
            placeholder="Rowlee Wines"
          />
        </label>
        <label>
          Wine name
          <input
            required
            autoComplete="off"
            {...register("displayName", { required: true })}
            placeholder="Pinnacle Series Shiraz"
          />
        </label>
        <div className="field-row">
          <label>
            Vintage
            <input inputMode="numeric" {...register("vintageYear")} placeholder="2023" />
          </label>
          <label>
            Grape varieties
            <input
              autoComplete="off"
              {...register("grapeVarieties")}
              placeholder="Shiraz, Cabernet Sauvignon"
            />
          </label>
        </div>
      </div>

      <div className="form-section">
        <h3>Origin and style</h3>
        <div className="field-row">
          <label>
            Region
            <input autoComplete="off" {...register("region")} placeholder="Orange" />
          </label>
          <label>
            Country
            <input autoComplete="off" {...register("country")} placeholder="Australia" />
          </label>
        </div>
        <div className="field-row">
          <label>
            Appellation
            <input autoComplete="off" {...register("appellation")} placeholder="Orange GI" />
          </label>
          <label>
            Classification
            <input autoComplete="off" {...register("classification")} placeholder="Grand Cru" />
          </label>
        </div>
        <div className="field-row">
          <label>
            Style
            <input autoComplete="off" {...register("wineType")} placeholder="Red wine" />
          </label>
          <label>
            Colour
            <input autoComplete="off" {...register("wineColor")} placeholder="Red" />
          </label>
        </div>
        <label>
          Alcohol
          <input autoComplete="off" {...register("alcoholPercent")} placeholder="13.5% alc/vol" />
        </label>
      </div>

      <div className="form-section">
        <h3>Bottle and storage</h3>
        <input type="hidden" {...register("site")} />
        <input type="hidden" {...register("siteId", { required: true })} />
        <input type="hidden" {...register("location")} />
        <input type="hidden" {...register("storageLocationId")} />
        <div className="field-row">
          <label>
            Bottle size
            <input autoComplete="off" {...register("bottleVolumeMl")} placeholder="750ml" />
          </label>
          <label>
            Barcode
            <input autoComplete="off" {...register("barcode")} placeholder="9342675000444" />
          </label>
        </div>
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
        <div className="field-row">
          <label>
            Lot code
            <input autoComplete="off" {...register("lotCode")} placeholder="L23051" />
          </label>
          {showQuantity ? (
            <label>
              Quantity
              <input
                required
                inputMode="numeric"
                min="1"
                max="24"
                type="number"
                {...register("quantity", { required: true })}
              />
            </label>
          ) : (
            <label>
              Position note
              <input autoComplete="off" {...register("position")} placeholder="row 3, slot 2" />
            </label>
          )}
        </div>
        <label>
          Producer address
          <textarea
            {...register("addressQualification")}
            placeholder="Produced by, bottled by, or address"
          />
        </label>
        {showQuantity ? (
          <label>
            Position note
            <input autoComplete="off" {...register("position")} placeholder="row 3, slot 2" />
          </label>
        ) : null}
      </div>

      <div className="form-section">
        <h3>Drink window</h3>
        <div className="field-row">
          <label>
            Drink from
            <input inputMode="numeric" {...register("drinkFromYear")} placeholder="2025" />
          </label>
          <label>
            Drink to
            <input inputMode="numeric" {...register("drinkToYear")} placeholder="2032" />
          </label>
        </div>
        <label>
          Source URL
          <input
            inputMode="url"
            {...register("sourceUrl")}
            placeholder="https://wineryName.example/wine"
          />
        </label>
      </div>

      <div className="form-section">
        <h3>Wine reference</h3>
        <label>
          Description
          <textarea
            {...register("description")}
            placeholder="Visible winery description or tasting copy"
          />
        </label>
        <label>
          Drinking advice
          <textarea {...register("drinkingAdvice")} placeholder="Cellaring or serving advice" />
        </label>
        <label>
          Label text
          <textarea
            {...register("labelText")}
            placeholder="Paste label, OCR, or winery page text"
          />
        </label>
        <label>
          Wine notes
          <textarea
            {...register("wineNotes")}
            placeholder="Tasting notes, food pairing, source details"
          />
        </label>
        <label>
          Bottle notes
          <textarea
            {...register("bottleNotes")}
            placeholder="Condition, purchase source, box details"
          />
        </label>
      </div>
    </>
  );
}
