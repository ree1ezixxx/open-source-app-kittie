#!/usr/bin/env bash
set -euo pipefail

API_ORIGIN="${VITE_API_ORIGIN:-http://localhost:3008}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"
DB_PATH="${KITTIE_DB_PATH:-/Users/ellis/Documents/open-source-app-kittie/data/kittie.db}"

echo "[check] API origin: $API_ORIGIN"
curl -fsS "$API_ORIGIN/health" >/dev/null

echo "[check] web proxy: $WEB_ORIGIN/api/v1/apps"
APP_JSON="$(curl -fsS "$WEB_ORIGIN/api/v1/apps?limit=1&sortBy=reviews&sortOrder=desc")"
if ! printf '%s' "$APP_JSON" | grep -q '"data":\['; then
  echo "[fail] Vite /api proxy did not return app JSON"
  exit 1
fi

echo "[check] DB path: $DB_PATH"
if [ ! -f "$DB_PATH" ]; then
  echo "[fail] DB file not found: $DB_PATH"
  exit 1
fi

sqlite3 "$DB_PATH" <<'SQL'
.headers on
.mode column
select 'apps' as table_name, count(*) as rows from apps
union all select 'app_snapshots', count(*) from app_snapshots
union all select 'reviews', count(*) from reviews
union all select 'meta_ads', count(*) from meta_ads
union all select 'app_ideas', count(*) from app_ideas;
SQL

APP_COUNT="$(sqlite3 "$DB_PATH" 'select count(*) from apps;')"
if [ "$APP_COUNT" -lt 1000 ]; then
  echo "[fail] Expected full local dataset; apps count is only $APP_COUNT"
  exit 1
fi

echo "[ok] Local API, Vite proxy, and full app dataset are available."
