import type { BoozeDatabase } from "@chikachow/booze-db";

export type Bindings = {
  readonly AI_GATEWAY_URL?: string;
  readonly BOTTLE_CAPTURE_WORKFLOW: Workflow<BottleCaptureWorkflowParams>;
  readonly CF_AIG_TOKEN?: string;
  readonly DB: D1Database;
  readonly IMAGE_BUCKET: R2Bucket;
  readonly IMAGES?: ImagesBinding;
  readonly CLERK_OAUTH_ISSUER?: string;
  readonly CLERK_SECRET_KEY?: string;
};

export type BottleCaptureWorkflowParams = {
  readonly captureId: string;
};

export type ApiContext = {
  readonly database: BoozeDatabase;
  readonly request: Request;
  readonly headers: Headers;
  readonly secretKey: string | undefined;
};

export type AuthenticatedUser = {
  readonly clerkUserId: string;
  readonly userId: string;
};

export type ApiEnvelope<T> = {
  readonly data: T;
};
