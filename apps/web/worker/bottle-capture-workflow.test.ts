import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

import type { WorkflowStep } from "cloudflare:workers";

import type { Bindings } from "./api/types.ts";
import type { BottleCombinedExtraction } from "./bottle-ocr.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

// The base class only supplies env. Step persistence and model responses are
// explicit fixtures; all capture state transitions and D1 batches run for real.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(
          "export class WorkflowEntrypoint { constructor(ctx, env) { this.env = env; } }",
        )}`,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { BottleCaptureWorkflow } = await import("./bottle-capture-workflow.ts");
hooks.deregister();

await describe("capture Workflow recovery", async () => {
  await it("runs a full restart from an interrupted importing, failed, or review state", async () => {
    for (const status of ["importing", "failed", "needs_review"]) {
      const { sqlite, workflow } = setup(status);
      const output = await workflow.run(event("workflow"), fixtureSteps());
      assert.deepEqual(output, { captureId: "capture", status: "imported" });
      assert.equal(
        sqlite.prepare("SELECT status FROM bottle_captures").get()?.["status"],
        "imported",
      );
      assert.equal(sqlite.prepare("SELECT count(*) AS count FROM bottles").get()?.["count"], 1);
      const importedRun = sqlite
        .prepare("SELECT id FROM bottle_capture_runs WHERE status = 'imported'")
        .get();
      assert.equal(importedRun?.["id"], "run_workflow");
      assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    }
  });

  await it("uses event ownership with an old persisted run context that has no Workflow ID", async () => {
    const { sqlite, workflow } = setup("extracting");
    const output = await workflow.run(event("workflow"), fixtureSteps(legacySteps()));
    assert.deepEqual(output, { captureId: "capture", status: "imported" });
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM bottles").get()?.["count"], 1);
    assert.equal(
      sqlite.prepare("SELECT status FROM bottle_capture_runs WHERE id = 'legacy-run'").get()?.[
        "status"
      ],
      "imported",
    );
  });

  await it("does not let an old cached start and run context bypass a newer Workflow owner", async () => {
    const { sqlite, workflow } = setup("extracting");
    sqlite.exec("UPDATE bottle_captures SET workflow_instance_id = 'new'");
    const output = await workflow.run(event("workflow"), fixtureSteps(legacySteps()));
    assert.deepEqual(output, { captureId: "capture", status: "skipped" });
    assert.equal(
      sqlite.prepare("SELECT status FROM bottle_captures").get()?.["status"],
      "extracting",
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM bottles").get()?.["count"], 0);
  });

  await it("does not restart an imported capture or another owner's capture", async () => {
    for (const [status, owner] of [
      ["imported", "workflow"],
      ["failed", "new"],
    ] as const) {
      const { sqlite, workflow } = setup(status);
      sqlite.prepare("UPDATE bottle_captures SET workflow_instance_id = ?").run(owner);
      const output = await workflow.run(event("workflow"), fixtureSteps());
      assert.deepEqual(output, { captureId: "capture", status: "skipped" });
      assert.equal(sqlite.prepare("SELECT status FROM bottle_captures").get()?.["status"], status);
      assert.equal(
        sqlite.prepare("SELECT count(*) AS count FROM bottle_capture_runs").get()?.["count"],
        1,
      );
      assert.equal(sqlite.prepare("SELECT count(*) AS count FROM bottles").get()?.["count"], 0);
    }
  });
});

function setup(status: string) {
  const sqlite = migratedDatabase();
  sqlite.exec(`INSERT INTO users (id, clerk_user_id) VALUES ('user', 'user');
    INSERT INTO sites (id, name) VALUES ('site', 'Cellar');`);
  sqlite
    .prepare(`INSERT INTO bottle_captures (id, site_id, user_id, status, workflow_instance_id)
    VALUES ('capture', 'site', 'user', ?, 'workflow')`)
    .run(status);
  sqlite
    .prepare(`INSERT INTO bottle_capture_runs (id, capture_id, status, extractor_version, prompt_version, schema_version)
    VALUES ('legacy-run', 'capture', ?, 'old-extractor', 'old-prompt', 'old-schema')`)
    .run(status);
  const artifacts = new Map<string, unknown>();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Persisted model-step fixtures leave only D1 and artifact writes live.
  const bindings = {
    DB: asD1(sqlite),
    IMAGE_BUCKET: {
      async put(key: string, value: unknown) {
        artifacts.set(key, value);
      },
    },
  } as unknown as Bindings;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The test Workflow base class only uses its environment argument.
  const workflow = new BottleCaptureWorkflow({} as ExecutionContext, bindings);
  return { sqlite, workflow };
}

function event(instanceId: string) {
  return {
    instanceId,
    workflowName: "booze-bottle-captures",
    payload: { captureId: "capture" },
    timestamp: new Date(),
  };
}

function legacySteps(): Map<string, unknown> {
  return new Map<string, unknown>([
    ["mark capture extracting", { captureId: "capture" }],
    [
      "create capture run",
      {
        capture: {
          id: "capture",
          siteId: "site",
          userId: "user",
          quantity: 1,
          storageLocationId: null,
          positionHint: null,
          images: [],
        },
        runId: "legacy-run",
      },
    ],
  ]);
}

function fixtureSteps(cache = new Map<string, unknown>()): WorkflowStep {
  const step = {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- WorkflowStep.do requires a callback; this test invokes the supplied step body.
    async do(name: string, optionsOrCallback: unknown, callback?: () => Promise<unknown>) {
      if (cache.has(name)) return cache.get(name);
      if (name.startsWith("extract label evidence with ")) {
        return {
          extractorId: name,
          model: "fixture",
          diagnostics: [],
          result: { bottle_same_across_images: true, canonical_label_text_lines: [] },
        };
      }
      if (name === "reconcile extractor evidence") {
        return { combined: combinedExtraction(), model: "fixture", diagnostics: [] };
      }
      const execute = callback ?? optionsOrCallback;
      assert.ok(typeof execute === "function");
      // oxlint-disable-next-line typescript/no-unsafe-call -- The callback guard verifies the Workflow step supplies a callable function.
      const result: unknown = await execute();
      cache.set(name, result);
      return result;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The orchestration uses only the modeled do method.
  return step as unknown as WorkflowStep;
}

function combinedExtraction(): BottleCombinedExtraction {
  return {
    model_role: "combiner",
    canonical_fields: {
      wineryName: textField("Producer"),
      brandName: textField(null),
      displayName: textField("Reserve"),
      vintage: textField("2020"),
      wineType: textField(null),
      wineColor: textField(null),
      grapeVarieties: { ...textField(null), value: [] },
      country: textField(null),
      region: textField(null),
      appellation: textField(null),
      classification: textField(null),
      alcoholPercent: textField(null),
      bottleVolumeMl: textField(null),
      addressQualification: textField(null),
      barcode: textField(null),
      lotCode: textField(null),
      description: textField(null),
      drinkingAdvice: textField(null),
    },
    canonical_label_text_lines: ["Producer", "Reserve", "2020"],
    field_disagreements: [],
    requires_human_review: false,
    human_review_reasons: [],
    overall_confidence: 0.9,
  };
}

function textField(value: string | null) {
  return { value, confidence: 0.9, supported_by: [], evidence: [], decision_reason: null };
}
