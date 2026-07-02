/** The `help` text, as a pure function so it can be asserted in tests without
 *  importing `index.ts` (which runs `main()` on import). */
import { DEFAULT_API_BASE_URL, ENV_API_TOKEN, ENV_API_URL } from "./config.js";

export function buildUsage(): string {
  return `kittie CLI (pluto) — local-first App Kittie intelligence

Usage:
  pluto <command> [args] [--json]

Foundation:
  pluto help                       Show this help
  pluto doctor                     Check API connectivity
  pluto config                     Show effective config
  pluto config set api-url <url>   Set the API origin
  pluto config set token <token>   Set an auth token

Intelligence:
  pluto app <id>                   App-detail intelligence (evidence-backed)
  pluto trending [--category C] [--country US] [--period 7d] [--limit N]
                                   Category-pulse / trending apps
  pluto compare <a> <b> [more…]    Compare 2+ apps (ids or queries)
  pluto validate <idea…> [--store apple|google]
                                   Validate an app idea (verdict + evidence)

Apps (legacy):
  pluto search [query]             Search apps
  pluto trends                     Top growth movers
  pluto detail <id>                App detail
  pluto clone-ios <id> [--out d]   Generate a buildable SwiftUI clone of a trending app

Config precedence: CLI flags > env (${ENV_API_URL}, ${ENV_API_TOKEN}) > ~/.kittie/config.json > default (${DEFAULT_API_BASE_URL}).
Add --json to any command for machine-readable output.`;
}
