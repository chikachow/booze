# Bottle capture extraction workflow rationale

## Caller usage

`BottleCaptureWorkflow` owns capture orchestration:

1. mark the capture as extracting
2. create a capture run
3. run each configured extractor in its own workflow step, in parallel
4. reconcile extractor evidence in its own workflow step
5. build the import candidate
6. write the extraction artifact
7. import or mark the capture for review
8. record the final capture and run state

`bottle-ocr.ts` owns model prompts, schemas, provider calls, and response validation. `bottle-extractor.ts` owns capture-specific adaptation: reading capture images from R2, invoking one extractor, invoking reconciliation, and converting the reconciled result into an import candidate.

## Type sketch

```ts
type CaptureExtractorResult = {
  readonly diagnostics: readonly BottleOcrDiagnostic[];
  readonly extractorId: string;
  readonly model: string;
  readonly result: BottleExtractorResult;
};

type CaptureReconciliationResult = {
  readonly combined: BottleCombinedExtraction;
  readonly diagnostics: readonly BottleOcrDiagnostic[];
  readonly model: string;
};

async function extractCaptureLabelEvidence(
  args,
): Promise<Omit<CaptureExtractorResult, "diagnostics">>;
async function reconcileCaptureLabelEvidence(
  args,
): Promise<Omit<CaptureReconciliationResult, "diagnostics">>;
function buildCaptureImportCandidate(args): CaptureImportCandidate;
```

## Synthesis decision

The workflow layer is the right place to split reliability boundaries because Cloudflare Workflows can retry and resume individual `step.do` calls. Keeping extractor fan-out inside `bottle-ocr.ts` made one retry boundary cover image loading, every model call, reconciliation, import, and database finalization. The refactor keeps the OCR contract intact while making each model call and reconciliation independently observable. Extractors stay parallel because they are independent evidence sources; serializing them would add latency without making the workflow easier to reason about.

The design deliberately avoids new D1 tables for per-step state. Step diagnostics are logged as structured JSON and retained in the existing extraction/error R2 artifacts. That is enough for current operations without committing to a schema before the failure modes are better understood.
