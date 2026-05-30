# Status

## Implementation

The project is an initial Cloudflare Workers scaffold for the personal wine cellar catalogue described in `docs/product.md`.

Current package layout:

```text
apps/web
packages/db
```

`apps/web` is the only deployable application. It uses Vite, React, the Cloudflare Vite plugin, and a Hono Worker. The Worker serves the SPA assets and owns API routes.

Implemented Worker routes:

```text
GET /healthz
GET /api/healthz
```

`packages/db` contains the initial Drizzle SQLite schema and the first D1 SQL migration.

## Deployment

The Worker is deployed to Cloudflare Workers and uses Cloudflare D1.

The Worker is configured with a Cloudflare Workers Custom Domain. The `workers.dev` endpoint is also enabled so deployment automation can probe the Worker independently of the custom domain.

GitHub Actions uses an orchestration workflow. `ci.yml` runs reusable format, lint, typecheck, test, and build workflows. `deploy.yml` runs only after `ci` succeeds for a push to `main`; it checks out the CI-tested commit, applies remote D1 migrations, rebuilds the Vite Worker output, deploys the Worker, and probes the `workers.dev` health endpoint.

Deployment requires Cloudflare account credentials to be configured as GitHub repository secrets. The recommended token should be scoped to this deployment workflow rather than using a personal OAuth session.
