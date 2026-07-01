#!/usr/bin/env bash
# Governor — the objective gate that supervises the three design lanes.
#
# It NEVER trusts a lane's self-reported "green": it re-derives ground truth from
# the actual git diff vs main and applies only mechanical, checkable rules, so the
# governor itself cannot hallucinate. Subjective design quality stays with the human.
#
# Checks per lane:
#   1. SCOPE     — changed files must obey the lane's allow/deny list (catches
#                  cross-lane contamination & random tangents). HARD BREACH.
#   2. HONESTY   — added web lines with literal confidence/freshness not from a
#                  Provenanced/decisionPacket field. FLAG (human triage).
#   3. THEME     — edits to the canonical light-default theme file. FLAG.
#   4. TYPECHECK — `pnpm typecheck` exit code. Only with --typecheck (slow). FLAG.
#
# On HARD BREACH: writes CORRECTION.md into the offending worktree (the lane reads
# it at the top of its next loop, fixes it first, deletes it) and exits 2.
# FLAG-only → exit 1. Clean → exit 0.
#
# Usage: bash coordinator/govern.sh [--typecheck]
set -uo pipefail

DOCS="/Users/ellis/Documents"
WORKSPACE="$DOCS/open-source-app-kittie-workspace"
GOVDIR="$WORKSPACE/coordinator/.govern"
mkdir -p "$GOVDIR"
RUN_TYPECHECK=0
[ "${1:-}" = "--typecheck" ] && RUN_TYPECHECK=1

# lane | dir | mode(allow|deny) | regex of paths
# App-Intelligence P0 lanes. A owns contracts+similar+validate; B owns teardown; C owns all apps/web.
LANES=(
  "A-intel-retrieval|$DOCS/osk-intel-retrieval|deny|^apps/web/|^packages/intelligence/src/teardown/"
  "B-intel-teardown|$DOCS/osk-intel-teardown|deny|^apps/web/|^packages/intelligence/src/(similarity|idea-validation)/"
  "C-intel-ui|$DOCS/osk-intel-ui|allow|^apps/web/"
)

STATE="$GOVDIR/state"
: >"$GOVDIR/state.new"
OVERALL=0
REPORT="$GOVDIR/report.md"
TS="$(date '+%Y-%m-%d %H:%M:%S')"
{ echo "# Governor sweep — $TS"; echo; } >"$REPORT"

for entry in "${LANES[@]}"; do
  IFS='|' read -r lane dir mode rx <<<"$entry"
  if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
    echo "· $lane: worktree missing ($dir) — skipped"; continue
  fi
  sha="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null)"
  echo "$lane $sha" >>"$GOVDIR/state.new"
  # diff against the lane's merge-base with origin/main → only the lane's OWN changes,
  # immune to main drift / rebases (avoids false breaches as the foundation lands).
  base="$(git -C "$dir" merge-base origin/main HEAD 2>/dev/null || echo main)"
  changed="$(git -C "$dir" diff --name-only "$base" 2>/dev/null)"

  verdict="PASS"; breaches=""; flags=""
  # 1. SCOPE
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ "$mode" = "allow" ]; then
      echo "$f" | grep -qE "$rx" || { breaches+="  - out of scope (not in this lane's allowlist): $f"$'\n'; }
    else # deny
      if echo "$f" | grep -qE "$rx"; then breaches+="  - forbidden path (belongs to another lane): $f"$'\n'; fi
    fi
  done <<<"$changed"

  # 2. HONESTY — literal confidence/freshness in added web lines
  hon="$(git -C "$dir" diff "$base" -- apps/web 2>/dev/null | grep -E '^\+' \
        | grep -iE 'confidence[[:space:]]*[:=][[:space:]]*0?\.[0-9]|freshness[[:space:]]*[:=][[:space:]]*["'\'']fresh' \
        | grep -ivE 'decisionPacket|provenanc|\.confidence|data-field' | head -5)"
  [ -n "$hon" ] && flags+="  - possible fabricated confidence/freshness (verify it traces to a real field):"$'\n'"$(echo "$hon" | sed 's/^/      /')"$'\n'

  # 3. THEME guard
  echo "$changed" | grep -qE '^apps/web/src/lib/theme\.ts$' && flags+="  - touched canonical theme file apps/web/src/lib/theme.ts (light default must stay)"$'\n'

  # 4. TYPECHECK (opt-in)
  if [ "$RUN_TYPECHECK" = "1" ] && [ -n "$changed" ]; then
    if ! (cd "$dir" && pnpm -s typecheck >/dev/null 2>&1); then
      flags+="  - pnpm typecheck FAILED"$'\n'
    fi
  fi

  if [ -n "$breaches" ]; then
    verdict="BREACH"; OVERALL=2
    cat >"$dir/CORRECTION.md" <<EOF
# CORRECTION — governor flagged a HARD BREACH ($TS)

STOP. Before any further work, fix this:

$breaches
**Rule:** a lane edits ONLY its owned paths (see LANE-BRIEF.md). The files above are out of scope — they belong to another lane or fall outside this lane's surface.

**Do now:** revert those paths (\`git checkout main -- <path>\` or remove the edit), confirm \`git diff --name-only main\` is clean of them, then resume your current loop INSIDE your owned paths. Delete this file once done.
EOF
    echo "✗ $lane ($sha): BREACH — wrote CORRECTION.md"
  elif [ -n "$flags" ]; then
    verdict="FLAG"; [ "$OVERALL" -lt 1 ] && OVERALL=1
    echo "⚠ $lane ($sha): FLAG"
  else
    echo "✓ $lane ($sha): PASS"
  fi

  { echo "## $lane — $verdict ($sha)";
    [ -n "$changed" ] && { echo "changed vs main:"; echo "$changed" | sed 's/^/  - /'; } || echo "no changes vs main";
    [ -n "$breaches" ] && { echo "**BREACH:**"; echo "$breaches"; }
    [ -n "$flags" ] && { echo "**FLAG:**"; echo "$flags"; }
    echo; } >>"$REPORT"
done

mv "$GOVDIR/state.new" "$STATE"
echo "— report: $REPORT  (exit $OVERALL: 0=clean 1=flag 2=breach)"
exit $OVERALL
