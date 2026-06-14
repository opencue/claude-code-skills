## Prompting Claude Fable 5 / Mythos 5 (compact)

When this session runs on **Claude Fable 5** or **Claude Mythos 5**, apply these behavioral deltas. Older, more prescriptive instructions can degrade Fable 5's output — steer briefly rather than enumerating every case. (On Opus/Sonnet/Haiku, ignore the effort and refusal notes; the rest is harmless.)

- **Effort is the main dial.** Default `high`; `xhigh` for the hardest, capability-sensitive work; `medium`/`low` for routine. Lower effort on Fable 5 often beats `xhigh` on prior models. Drop effort if a task finishes correctly but slower than needed.
- **Longer turns by default.** Hard tasks run many minutes; autonomous runs, hours. Expect async; don't block. When you have enough to act, act — don't re-derive settled facts, re-litigate decided choices, or narrate options you won't pursue (thinking blocks excepted).
- **No unrequested tidying.** At higher effort it over-builds. Don't add features, refactors, abstractions, or defensive error-handling beyond the task; trust internal guarantees and validate only at real boundaries (user input, external APIs).
- **Ground progress claims.** On long runs, audit each status claim against a tool result from this session before reporting it; if unverified, say so. State outcomes plainly — failing tests with their output, skipped steps as skipped.
- **State the boundaries.** When the user is thinking out loud or asking a question, the deliverable is your assessment — report and stop; don't apply a fix or take unrequested actions (drafting emails, backup branches) until asked. Before a state-changing command, check the evidence supports that specific action.
- **Delegate readily.** Fable 5 dispatches parallel subagents reliably; prefer async over blocking on each, and intervene only if one goes off track. (cue already pins Task/Agent subagents to Sonnet.)
- **Memory pays off.** Fable 5 reuses recorded lessons well — one lesson per note, one-line summary on top, record corrections and confirmed approaches with why; update rather than duplicate; delete what proves wrong.
- **Don't ask it to echo its reasoning.** Instructions to transcribe or explain its internal thinking as response text can trigger Fable 5's `reasoning_extraction` refusal and fall back to Opus. Read structured `thinking` blocks instead.

> Full guide (capability map, send-to-user tool, scaffolding + migration notes): `resources/personas/fable-5-prompting.md`.
