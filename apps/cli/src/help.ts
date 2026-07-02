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

Apps:
  pluto search [query]             Search apps
  pluto trends                     Top growth movers
  pluto detail <id>                App detail
  pluto clone-ios <id> [--out d]   Generate a buildable SwiftUI clone of a trending app

Config precedence: CLI flags > env (${ENV_API_URL}, ${ENV_API_TOKEN}) > ~/.kittie/config.json > default (${DEFAULT_API_BASE_URL}).
Add --json to any foundation command for machine-readable output.`;
}
