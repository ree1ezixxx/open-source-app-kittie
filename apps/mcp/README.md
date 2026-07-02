# @kittie/mcp — App Intelligence MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes Kittie's mobile
app-intelligence as agent tools: search & rank apps, find fast-rising opportunities, read store
charts with rank movement, score ASO keywords across markets, pull review sentiment, and generate
a buildable iOS clone of an app.

> **Data honesty:** download and revenue figures are **modelled estimates, labelled as such — not
> ground truth**. Blocked sources (e.g. Meta ads) return empty, never fabricated rows.

## Tools

| Tool | What it does |
|------|--------------|
| `search_apps` | Filter & rank the iOS+Android catalog by text, category, store, market, modelled metrics, growth, price and presence signals. Cursor-paginated. |
| `find_rising_apps` | The headline "is this a rising opportunity?" verb — strongest positive growth over a window, with growth %, rank movement and modelled revenue. |
| `get_trending_charts` | Top store rankings (free/paid/grossing) per market with day-over-day rank movement. Honest empty when no clean source. |
| `find_trending_apps` | Fastest-rising apps for a category/market over a period, as an evidence- & confidence-aware trends response (rank movement, review growth, modelled growth score, caveats). Honest empty when no clean snapshot. |
| `get_app_detail` | Full intelligence profile for one app: listing facts, observed signals, modelled estimates, plus supporting evidence, a confidence score and caveats. |
| `get_app_history` | Daily review / rating / chart-rank series for one app. |
| `get_keyword_difficulty` | ASO difficulty for one keyword in a market. |
| `batch_keyword_difficulty` | ASO difficulty for many keywords at once. |
| `get_keyword_markets` | Cross-market difficulty for one keyword — which market is it easiest in. |
| `get_related_keywords` | Related keyword ideas for a seed (feed to `batch_keyword_difficulty`). |
| `get_supported_countries` | ISO markets covered. |
| `get_app_reviews` | Recent reviews with sentiment + topic / improvement-area tags. |
| `clone_ios_app` | Generate a complete buildable SwiftUI iOS clone (xcodegen project + Swift sources). |

App ids look like `apple:123456789` or `google:com.example.app`.

## Connect

The server speaks MCP over **stdio**. It calls the Kittie REST API; point it at a running API with
`KITTIE_API_URL` (default `http://localhost:3009`).

Claude Desktop / Cursor / any MCP client (`mcpServers` config):

```json
{
  "mcpServers": {
    "kittie": {
      "command": "kittie-mcp",
      "env": { "KITTIE_API_URL": "https://your-kittie-api" }
    }
  }
}
```

From source: `pnpm --filter @kittie/mcp build` then run `node apps/mcp/dist/index.js`
(or `pnpm --filter @kittie/mcp dev` for tsx watch).

## Notes

- Transport is currently **stdio only**; a remote (Streamable HTTP) transport is planned so agents
  can reach a hosted instance without a local process.
- The same capabilities are available as a plain REST API — see `/openapi.json` and the discovery
  index at the API root.
