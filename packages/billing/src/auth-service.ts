import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type Clock, type IdGen, systemClock, uuidGen } from "./clock.js";
import { errInsufficientScope, errNotFound, errUnauthorized } from "./errors.js";
import type { Scope } from "./scopes.js";
import type { BillingStore } from "./store/types.js";
import type { ApiKeyRecord, Principal, PrincipalKind } from "./types.js";

const KEY_PREFIX = "kit_";

/** SHA-256 hex of the raw key — the only form ever persisted. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawKey(): { raw: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  return { raw, prefix: raw.slice(0, 12) };
}

/** Constant-time string compare to guard the admin token check. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * L9 trust layer: principals, API keys, authentication, and scope checks.
 * Keys are opaque bearer secrets shown once at issue time; we store only the
 * hash, so a store compromise leaks no usable credential.
 */
export class AuthService {
  constructor(
    private store: BillingStore,
    private clock: Clock = systemClock,
    private idGen: IdGen = uuidGen,
  ) {}

  async createPrincipal(input: {
    name: string;
    kind?: PrincipalKind;
  }): Promise<Principal> {
    const principal: Principal = {
      id: this.idGen(),
      name: input.name,
      kind: input.kind ?? "org",
      createdAt: this.clock(),
    };
    await this.store.putPrincipal(principal);
    return principal;
  }

  /** Returns the raw key ONCE; it is never retrievable again. */
  async issueApiKey(
    principalId: string,
    input: { scopes: Scope[]; name?: string },
  ): Promise<{ key: string; record: ApiKeyRecord }> {
    const principal = await this.store.getPrincipal(principalId);
    if (!principal) throw errNotFound("principal");
    const { raw, prefix } = generateRawKey();
    const record: ApiKeyRecord = {
      id: this.idGen(),
      principalId,
      name: input.name,
      prefix,
      hash: hashKey(raw),
      scopes: [...input.scopes],
      createdAt: this.clock(),
    };
    await this.store.putApiKey(record);
    return { key: raw, record };
  }

  async authenticate(
    rawKey: string | undefined,
  ): Promise<{ principal: Principal; apiKey: ApiKeyRecord }> {
    if (!rawKey) throw errUnauthorized();
    const apiKey = await this.store.getApiKeyByHash(hashKey(rawKey));
    if (!apiKey || apiKey.revokedAt) throw errUnauthorized("invalid or revoked API key");
    const principal = await this.store.getPrincipal(apiKey.principalId);
    if (!principal) throw errUnauthorized("principal not found");
    const lastUsedAt = this.clock();
    await this.store.updateApiKey(apiKey.id, { lastUsedAt });
    return { principal, apiKey: { ...apiKey, lastUsedAt } };
  }

  async revokeKey(apiKeyId: string): Promise<void> {
    const key = await this.store.getApiKey(apiKeyId);
    if (!key) throw errNotFound("api key");
    if (!key.revokedAt) {
      await this.store.updateApiKey(apiKeyId, { revokedAt: this.clock() });
    }
  }

  async listKeys(principalId: string): Promise<ApiKeyRecord[]> {
    return this.store.listApiKeys(principalId);
  }

  hasScope(apiKey: ApiKeyRecord, scope: Scope): boolean {
    return apiKey.scopes.includes(scope);
  }

  requireScope(apiKey: ApiKeyRecord, scope: Scope): void {
    if (!this.hasScope(apiKey, scope)) throw errInsufficientScope(scope);
  }
}
