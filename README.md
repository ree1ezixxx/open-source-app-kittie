# Open Source App Kittie

Independent mobile app intelligence platform — AppKittie-inspired, fully open source, no paid API dependency.

## Quick start

```bash
pnpm install
cp .env.example .env
mkdir -p data
pnpm db:generate
pnpm db:migrate
pnpm typecheck
```

## Docs

- [AGENTS.md](./AGENTS.md) — canonical agent rules (stack, runbooks, conventions)
- [.cursor/rules/app-kittie.mdc](./.cursor/rules/app-kittie.mdc) — Cursor-only delta (model, git, exploration)
- [CONTEXT.md](./CONTEXT.md) — domain glossary
