# postizz brands

One subdir per brand the user posts as. Each brand owns its own logo and
design system. The agent must load the relevant `brand.md` before
generating images or copy for that brand, and must reference the brand's
`logo.png` as-is (never redraw).

## Registered brands

| Brand | Status | Notes |
|---|---|---|
| [volaria](./volaria/brand.md) | active | Financial / markets — cinematic editorial card format |
| [slopix](./slopix/brand.md) | placeholder | Assets + voice not yet filled in |

## Account confirmation

Before posting via Postiz, the agent ALWAYS confirms with the user which
account to publish to. Posting under the wrong brand is a hard-to-reverse
mistake. Postiz integrations are listed via the MCP
(`postiz_list_integrations`) or `postiz integrations list` on the CLI.
