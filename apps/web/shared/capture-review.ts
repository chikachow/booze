import { z } from "zod";
import { hasWineIdentity } from "./wine-identity.ts";

const text = (max: number) => z.string().trim().max(max).optional();
const year = z.number().int().min(1800).max(2200).optional();

export const captureReviewCandidateSchema = z.object({
  wine: z
    .object({
      wineryName: z.string().trim().max(160).default(""),
      brandName: text(160),
      baseName: text(180),
      designation: z.string().trim().max(160).default(""),
      displayName: text(180),
      vintageYear: year,
      vintageStatus: z.enum(["year", "non_vintage", "unknown"]).optional(),
      grapeVarieties: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
      country: text(120),
      region: text(160),
      appellation: text(160),
      classification: text(160),
      wineType: text(120),
      wineColor: text(40),
      addressQualification: text(500),
      alcoholPercent: z.number().min(0).max(100).optional(),
      drinkFromYear: year,
      drinkToYear: year,
      description: text(2_000),
      drinkingAdvice: text(2_000),
      labelText: text(4_000),
      sourceUrl: z.union([z.url().max(500), z.literal("")]).optional(),
      notes: text(2_000),
    })
    .superRefine((wine, context) => {
      if (
        (wine.vintageStatus === "year" && wine.vintageYear === undefined) ||
        (wine.vintageYear !== undefined &&
          wine.vintageStatus !== undefined &&
          wine.vintageStatus !== "year")
      ) {
        context.addIssue({
          code: "custom",
          path: ["vintageYear"],
          message: "Choose a year, non-vintage, or unknown vintage without contradictory values.",
        });
      }
      if (
        wine.drinkFromYear !== undefined &&
        wine.drinkToYear !== undefined &&
        wine.drinkFromYear > wine.drinkToYear
      ) {
        context.addIssue({
          code: "custom",
          path: ["drinkToYear"],
          message: "Drink window must end on or after it starts.",
        });
      }
    }),
  bottle: z.object({
    bottleNumber: text(80),
    volumeMl: z.number().int().min(1).max(30_000).optional(),
    barcode: text(80),
    lotCode: text(120),
    notes: text(2_000),
  }),
});

export type CaptureReviewCandidate = z.infer<typeof captureReviewCandidateSchema>;

export function isIdentifiedCapture(candidate: CaptureReviewCandidate): boolean {
  return hasWineIdentity(candidate.wine);
}
