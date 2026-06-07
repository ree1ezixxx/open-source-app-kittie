import type { Store } from "@kittie/types";

export function makeReviewId(store: Store, externalId: string): string {
  return `${store}:review:${externalId}`;
}
