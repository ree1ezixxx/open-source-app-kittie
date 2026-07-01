import { buildAuditReport, signalsFromContext } from "@kittie/intelligence";
import type { AuditReport } from "@kittie/types";
import { getAppRowById, getSnapshotContext } from "@kittie/db";
import { getDb } from "../lib/db.js";
import { MOCK_APPS } from "../mock/fixtures.js";
import { dbHasApps } from "./db-app-service.js";

export async function getAuditReport(appId: string): Promise<AuditReport | null> {
  if (await dbHasApps()) {
    const db = getDb();
    const [app, ctx] = await Promise.all([
      getAppRowById(db, appId),
      getSnapshotContext(db, appId, "7d"),
    ]);
    if (!app || !ctx) return null;
    return buildAuditReport({
      app: {
        id: app.id,
        store: app.store,
        storeAppId: app.storeAppId,
        title: app.title,
        developer: app.developer,
        iconUrl: app.iconUrl,
        category: app.category,
      },
      signals: signalsFromContext(ctx),
      observedAt: ctx.latest.createdAt,
    });
  }

  const fixture = MOCK_APPS.find((app) => app.id === appId);
  if (!fixture) return null;
  const latest = fixture.historicals.at(-1)?.date ?? null;
  return buildAuditReport({
    app: {
      id: fixture.id,
      store: fixture.store,
      storeAppId: fixture.storeAppId,
      title: fixture.title,
      developer: fixture.developer,
      iconUrl: fixture.iconUrl,
      category: fixture.category,
    },
    signals: fixture.signals,
    observedAt: latest ? new Date(`${latest}T00:00:00.000Z`) : null,
  });
}
