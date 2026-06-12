# Initial checks — 2026-06-12 (setup)

Package manager: pnpm (workspace). No lint script defined at root or in packages.

| Check | Command | Result |
|---|---|---|
| typecheck clone-engine | `pnpm --filter @kittie/clone-engine typecheck` | ✅ clean |
| typecheck api | `pnpm --filter @kittie/api typecheck` | ✅ clean |
| typecheck web | `cd apps/web && pnpm exec tsc --noEmit` | ⚠️ 9 pre-existing errors, ALL in `src/pages/AppEnginePage.tsx` (legacy page, `@kittie/db` import + `CloneableAppResponse` shape drift). Zero errors in BuilderPage/PhonePreview/studio code. |
| lint | — | n/a (no script) |
| build | not run | deferred to first loop iteration |
| preview | :5173 `/studio/:id` loads (mockup preview) | ✅ verified earlier this session |

Note for the loop: AppEnginePage errors predate this work and are out of scope
(not the simulator workspace). Don't let them fail iteration check gates —
scope web typecheck to touched files, or fix that page in final hardening if
it's cheap.

Baseline commit before setup: 4ac1c04 (native SwiftUI codegen).
