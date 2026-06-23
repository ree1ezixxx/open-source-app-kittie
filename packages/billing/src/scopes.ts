/**
 * Fine-grained OAuth scopes (L9). Least-privilege: a key is granted only the
 * scopes it needs. Discovery + read tools default to the READ_SCOPES set;
 * anything that generates artefacts, touches private store data, or spends
 * money requires an explicit grant.
 */
export const SCOPES = [
  "market.read",
  "reviews.read",
  "visuals.read",
  "repo.summary.read",
  "artifact.generate",
  "artifact.write",
  "store.private.read",
  "store.write",
  "billing.spend",
] as const;

export type Scope = (typeof SCOPES)[number];

/** Read-only scopes safe to hand anonymous/free discovery callers. */
export const READ_SCOPES: Scope[] = [
  "market.read",
  "reviews.read",
  "visuals.read",
  "repo.summary.read",
];

export function isScope(x: string): x is Scope {
  return (SCOPES as readonly string[]).includes(x);
}

/** Keep only valid, de-duplicated scopes. */
export function parseScopes(input: readonly string[] | undefined): Scope[] {
  const out: Scope[] = [];
  for (const s of input ?? []) {
    if (isScope(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Validate a requested scope set, surfacing any unknown names to the caller. */
export function validateScopes(input: readonly string[]): {
  ok: boolean;
  scopes: Scope[];
  unknown: string[];
} {
  const scopes: Scope[] = [];
  const unknown: string[] = [];
  for (const s of input) {
    if (isScope(s)) {
      if (!scopes.includes(s)) scopes.push(s);
    } else {
      unknown.push(s);
    }
  }
  return { ok: unknown.length === 0, scopes, unknown };
}
