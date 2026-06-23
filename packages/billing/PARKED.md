# BOOKMARK — billing HTTP surface + keys/auth (parked 2026-06-23)

`@kittie/billing` (this package) is **complete and tested** — the money logic:
metering, budgets, spend limits, idempotency, receipts, plus the auth primitives
(principals, API keys, scopes, audit). 31 unit tests, green.

It is currently a **standalone library — NOT wired to the API.** Decision: don't
expose billing over HTTP until the API-key / auth story is settled, because
charging over the web needs to know *who* is paying (= needs keys), and we chose
to defer anything key/API-credential related.

## What was built then pulled out (re-attach when auth resumes — ticket #100)

Removed from `packages/api` (recreate from git history of this branch if needed):
- `src/lib/billing.ts` — billing singleton + admin-token helper
- `src/middleware/auth.ts` — request-id + principal resolution + `requireScopes`
- `src/routes/billing.ts` — `/api/v1/billing/*` (units, charge, quote, usage, receipts, budget)
- `src/routes/auth.ts` — `/api/v1/auth/*` (whoami, audit, admin: principals + keys)
- `src/routes/billing.test.ts` — 9 HTTP integration tests
- `app.ts` wiring: `requestContext`, `/.well-known/oauth-protected-resource`, router mounts
- `package.json`: `"@kittie/billing": "workspace:*"` dep
- `.env.example`: `BILLING_ADMIN_TOKEN`, `BILLING_OAUTH_ISSUER`

## To re-attach later
1. Add the dep back to `packages/api/package.json`, `pnpm install`.
2. Recreate the route/middleware files (the engine API hasn't changed).
3. Mount `authRouter` + `billingRouter` under `/api/v1` in `app.ts`, apply
   `requestContext`, serve the OAuth metadata route.
4. Re-add the env vars.

The engine itself needs no changes — it already exposes `createBilling`,
`AuthService`, `BillingService`, both stores, scopes, units, and typed errors.
