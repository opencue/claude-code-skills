## Save tokens with headroom

Every cue session routes Claude traffic through the local **headroom** compression
proxy (`ANTHROPIC_BASE_URL` → 127.0.0.1:8787): prompts, tool outputs, and history
are compressed before they reach the model (60–95% fewer tokens, reversible). The
baseline wrap is automatic — on by default, nothing for you to do. It is
health-gated, so a down proxy falls back to direct Anthropic instead of breaking.

**For large in-turn payloads, reach for the headroom MCP.** Before pouring a big
blob into context (long logs, file dumps, command output, RAG chunks), run it
through `headroom_compress` and work from the compressed view; pull originals back
with `headroom_retrieve` when you need a dropped detail; check savings with
`headroom_stats`. Compression is reversible (CCR) — prefer it over truncating or
guessing.

Connection errors mean the proxy is down; the wrap fails open to direct Anthropic,
so work continues. Restart it with `headroom proxy --port 8787`.
