---
name: PF_Sync
description: Before continuing any task David brings up, re-check what Claude Cowork / Codex / other sessions changed, then continue their unfinished work. Use at the start of every task, or when David says "PF_Sync", "同步", "Cowork 做了什麼", "Codex 做到哪".
---

# PF_Sync — re-check others' work first, then continue

Run this every time David brings up a task, before acting:

1. Repo: `git status --short`, `git diff --stat`, `git log --oneline -5`, files modified since yesterday
   (`find . -newermt <yesterday> -type f -not -path "./.git/*"`).
2. Other sessions: `list_sessions` + `search_session_transcripts` (keyword from the task);
   Codex: `~/.codex/sessions/<yyyy>/<mm>/<dd>/*.jsonl` (grep the keyword);
   Cowork: `~/Library/Application Support/Claude/local-agent-mode-sessions`.
3. External config touched by the task (e.g. `~/.hermes/config.yaml`, `~/.ssh/config`): check mtime —
   a discussion in a transcript is NOT progress; only changed files/config count.
4. Report in 2-4 lines: what they did, what is only discussed, what is unfinished.
5. Continue the unfinished work. Never overwrite or revert in-progress files.
   If anything is unclear (which machine/network/choice), ask David first.

## Links in every reply (David, 2026-11-11)
Curl-verify each link immediately before pasting it (localhost, current LAN IP, live site). Start the local server first if it is down (`preview_start launcher`). Never paste a link that has not returned 200. See CLAUDE.md "never paste an unverified link".
