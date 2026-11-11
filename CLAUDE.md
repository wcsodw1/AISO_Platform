# AISO Platform — working notes for Claude

Repo: `wcsodw1/AISO_Platform`. Site: https://wcsodw1.github.io/AISO_Platform/

## Project skills

- **PF_Status** — repo/file status + recent commits summary. See `.claude/skills/PF_Status/SKILL.md`.
- **PF_Arc** — accumulated architecture direction, given incrementally by the user.
  See `.claude/skills/PF_Arc/SKILL.md` and its notes file `.claude/skills/PF_Arc/ARCHITECTURE.md`.
- **David** — David's personal life/work tree (Career-TPI, AISO_Platform, TA, Life生活,
  Shop List, etc.), built incrementally. See `.claude/skills/David/SKILL.md` and
  `.claude/skills/David/LIFE_TREE.md`. Not AISO-platform-specific — this is David's own
  life structure, kept here at his request.
- **DT** — David-TPI: what David does at TPI (客戶、角色、平台、流程). See `.claude/skills/DT/SKILL.md` and `.claude/skills/DT/DT.md`.

- **PF_Bench** — paste complete benchmark data → validate and add to that machine's Stress Test benchmark. See `.claude/skills/PF_Bench/SKILL.md`.

- **PF_Sync** — every time David raises a task, first re-check what Cowork/Codex/other sessions changed, then continue their work; ask if unclear. See `.claude/skills/PF_Sync/SKILL.md`.

## Standing instruction: listing skills

The user will forget skill names. Whenever they ask something like "skill",
"有哪些 skill", "列出 skill", or seem unsure what's available, just list the
current skills (project ones above, plus any other available skills) with a
one-line description each — don't make them recall the name first.

## Standing instruction: scan Codex progress first

Codex works on this repo in parallel (currently the Portal benchmark feature under
`AISO_Platform_Portal/benchmark/`). At the start of any task touching the repo, first scan what
Codex has done so far: `git status --short`, `git diff --stat`, `git log --oneline -5`, and files
modified recently (`find . -newermt <yesterday> -type f -not -path "./.git/*"`). Report it in a
few lines before acting, and never overwrite or revert in-progress Codex files.

## Standing instruction: never paste an unverified link

Before putting ANY URL in a reply, check it works *right then*: `curl -m 5 -s -o /dev/null -w '%{http_code}'` on the exact URL (localhost, the current LAN IP from `ipconfig getifaddr en0`, and the live site). If the local server is not running, start it first (`preview_start` with the `launcher` config in `.claude/launch.json`, port 8765) and re-check. The LAN IP changes with the network, so re-read it every time. Only paste links that returned 200; state plainly which ones failed or are not deployed. The Live shell needs `AISO_TERMINAL_PASSWORD` (David sets it himself) and only works on `localhost`, not the LAN address.
