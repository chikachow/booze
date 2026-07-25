clerk app id: app_3EQw5Nr2QeBckJPy4KB8pJoH8V5
clerk instance id: ins_3EQw5Nv19v0K6HDmaRwEym9ph0b

MCP OAuth metadata requires `CLERK_OAUTH_ISSUER` to be configured with the Clerk OAuth issuer URL. The Worker fails closed for `/.well-known/oauth-protected-resource` when this value is absent or blank.

## D1 migration lineage

Migrations `0000` through `0007` are the deployed production lineage and must remain unchanged and in order. Migration `0008_r2_object_deletion_queue.sql` appends the durable R2 cleanup queue. Future schema changes must add a new migration rather than rewriting or renumbering an existing file.

The deployment workflow applies pending remote D1 migrations before publishing the Worker. Confirm the remote migration list before deployment whenever a migration is added.
