# plugin-logos

Generated logo art for Claude Code plugins shown on the cue studio **Plugins** page.

Served by `GET /api/v1/plugin-icon?plugin=<id>` (`src/lib/dashboard-server.ts`). Resolution order:

1. **Reuse** — a cue profile sharing the plugin's bare name that ships its own `logo.png` (e.g. `resend`, `vercel`, `stripe`) is used directly from `profiles/<name>/`.
2. **Generated** — `<plugin-name>.png` in this directory.

Drop a `<plugin-name>.png` here to give a plugin a logo. Plugins with neither fall back to the 🧩 emoji in the UI. Override the dir with `CUE_PLUGIN_LOGOS_DIR`.
