# Session Handoff — Lane C · AI Studio → Foundation / UI

## Branch and worktree

| | |
|---|---|
| **Branch** | `feat/ai-studio` |
| **Worktree** | `/Users/ellis/Documents/open-source-app-kittie-ai-studio` |
| **Rebase target** | `feat/ui` at `/Users/ellis/Documents/open-source-app-kittie-ui` (shell) — rebase Lane C once that sidebar/shell lands |

## What Lane C shipped

Three net-new surfaces in `apps/web`. Hot Ideas + Pricing are mock/offline; the
Screenshot Generator is **real** on the render + export side.

| Route | Page | Notes |
|---|---|---|
| `/dashboard/aso/screenshots` | `ScreenshotGeneratorPage.tsx` | 3-step flow (select app → upload → generate). Pulls real tracked apps via `listApps`, graceful fallback. **Real** device-framed render + **exact App Store PNG export** (zip: 6.9″/6.5″/6.3″/6.1″) via the screenshot-engine. |
| `/dashboard/hot-ideas` | `HotIdeasPage.tsx` | Filter rail (search, app category, idea type, sort+order, blueprint chips) → `aiService.listIdeas` → grid + pagination (PAGE_SIZE=12). 30 mock ideas. |
| `/tools/pricing-calculator` | `PricingCalculatorPage.tsx` | **Fully offline.** PPP-adjusted pricing across 201 countries. Up to 4 base prices, country filter, charm-rounding, Copy/Export JSON. |

**Dropped (per Rhodri):** Screenshot Translation page — removed entirely.

## Screenshot engine (the real generation)

Ported the render + export core from **ParthJadhav/app-store-screenshots** (MIT)
into `apps/web/src/components/aistudio/screenshot-engine/`. We deliberately did
**not** port its 1,300-line manual editor — only the parts a one-click generator needs:

- `device-frames.tsx` — iPhone + iPad bezels (inline-styled, deterministic for export). iPhone uses `public/mockup.png`.
- `constants.ts` — canvas dims, exact `EXPORT_SIZES`, `PHONE_SCREEN` overlay, themes.
- `image-cache.ts` — base64 preload so `html-to-image` exports without fetch races.
- `SlideCanvas.tsx` — lean inline-styled renderer; auto-rotated layouts (hero / device-bottom / device-top / no-device).
- `SlidePreview.tsx` — scaled wrapper for on-screen previews + history thumbs.
- `export.ts` — `exportDeckZip()` / `exportSlidePng()` via `html-to-image` + `jszip`.
- `types.ts`, `index.ts` — lean schema + barrel.

New deps: `html-to-image`, `jszip` (both framework-agnostic, fine under Vite).
**Note on Tailwind:** the engine's render path was already inline CSS-in-JS (required for deterministic export) — Tailwind only dressed the editor chrome we dropped, so no Tailwind→CSS conversion was needed on the part that matters.

## Key files

- `apps/web/src/lib/aiService.ts` — the single typed `AiService` seam. `generateScreenshots` now emits real `Slide` specs (style→theme mapping, layout rotation, headline/label pools) rendered by the engine. `listIdeas` stays mock. Exports `aiService`, `AI_SERVICE_MODE`, `AI_INTEGRATION_POINTS`.
- `apps/web/src/components/aistudio/GenerationResult.tsx` — framed previews + hidden full-res export layer + "Download PNGs (zip)".
- `apps/web/src/lib/api/ideas.ts` — 30 `AppIdea` mocks + pure `queryIdeas(q)`.
- `apps/web/src/datasets/ppp-index.json` — 201-country PPP dataset.
- `apps/web/src/styles/aistudio.css` — all lane styles, scoped, reuses shell tokens.
- **Modified (additive, shared):** `App.tsx` (+3 routes), `Sidebar.tsx` (+nav groups), `tsconfig.json` (+`resolveJsonModule`).

## Remaining AI integration point (flagged in `AI_INTEGRATION_POINTS`)

1. **`screenshot-art-direction`** — render + export are REAL. What's still deterministic is *art direction*: an LLM/vision model could pick layout, headline copy, theme, and per-slide screenshot ordering from the app's listing instead of the current style→theme mapping.
2. **`ideas-pipeline`** — real idea mining to replace the 30 static mocks.

## Gotchas for the next agent

- **`@kittie/types` must be built first** (`pnpm --filter @kittie/types build`) — `dist/` is gitignored; typecheck fails for all lanes until built. Not Lane-C-specific.
- **Root `.gitignore` contains `data/`** — the PPP dataset lives at `src/datasets/`, not `src/data/`. Do not move it back.
- **`tsconfig.json` has `resolveJsonModule: true`** for the dataset import — keep on rebase.
- Sidebar nav groups are additive and **superseded by the `feat/ui` shell sidebar** on rebase. Pricing Calculator currently registers under a Lane-C "Tools" group the shell doesn't have yet — needs a home in the shell nav.

## Verification status

- ✅ `pnpm --filter web typecheck` clean (exit 0).
- ✅ Drove the full flow live: select tracked app → upload → generate → **4 framed iPhone slides** rendered with the screenshot composited inside.
- ✅ **PNG export verified**: zip of 16 PNGs across 6.9″/6.5″/6.3″/6.1″, pixel-exact (1320×2868 … 1125×2436).
- ✅ Zero console errors.

## Deferred / open

- Rebase onto `feat/ui` once the shell lands; reconcile sidebar registration.
- Add an art-direction model behind `aiService.generateScreenshots` (point 1 above).
- iPad export path exists in the engine but the UI defaults to iPhone — expose a device toggle when wanted.
