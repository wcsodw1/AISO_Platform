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

- **PF_UI** — UI rules: minimum type sizes (headings ≥16pt/21.33px, body ≥12pt/16px), page scan, agreed page patterns. See `.claude/skills/PF_UI/SKILL.md`.

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

## Standing instruction: EVERY reply that touches a page ends with verified links

David has said this 100 times: any reply about a UI/page change must include the links to the changed pages (localhost, current LAN IP, live site), each curl-verified 200 right then, and say plainly which are not deployed yet (changes on `feat/benchmark-terminal` are not on the live site). No reply about a page without links.

## Standing instruction: EVERY reply includes the Terminal status (POC, 3 parts)

David (2026-11-11): every reply ends with the Terminal POC status for the three targets (AISO1, TPIUSER-PRO6000-AISO_Team_NEW, TPIUSER-PRO6000-MNT): (1) can it connect effectively, (2) does it answer a command. Test it right then, read-only: `ssh -o BatchMode=yes -o ConnectTimeout=8 -o RemoteCommand=none -o RequestTTY=no -T <alias> 'hostname'` (never print IPs). Report per target: connect OK/FAIL and command reply OK/FAIL. Also check the platform terminal service: `curl localhost:8765/api/terminal/status`.

## Standing instruction: EVERY reply also reports the two open workstreams (with the links)

David (2026-11-11): next to the verified links, every reply states progress on (1) **Terminal connect + test benchmark** — (a) AISO1, (b) PRO6000: can it connect, does it answer a command, can a benchmark be started from the platform; (2) **PRO6000 benchmark data supplement** — what is on the platform, what is still missing, what was found on the host.

## Standing instruction: when blocked, hand David a command or a question for the other AI session

David (2026-11-11): every time something is blocked (access, missing data, a step only another machine/session can do), do not just say "blocked". Give him either (1) the exact command to run (in a fenced bash block, saying WHERE to run it: Mac or the machine), or (2) a ready question to paste to the other AI session that did it earlier ("how did you get X?"). Applies to all problems.

## Standing instruction: the AISO1 retest question is CLOSED

David (2026-11-13) answered it: NP5 does not run on AISO1 (overload) and has no numbers. **Do NOT ask "AISO1 補測到哪？" any more** and do not repeat it in replies. Gaps still live in `AISO_Platform_Portal/benchmark/DATA_GAPS.md`. Where AISO1 NP5 appears on a page it is shown as **Overload 超負載**, never as blank or "missing".

## Standing instruction: secret scanning (GitGuardian) stays complete

Never add `.gitguardian.yaml`, `.ggignore`, path excludes (including `tests/`) or any rule that lowers scanning coverage; false positives are marked one by one by David in the dashboard. Tests that need a password generate it at run time (`secrets.token_urlsafe`); no hard-coded passwords, also not for "wrong password" cases. Real passwords, SSH private keys and API tokens never go into Git, the frontend, the public export or logs. Do not rewrite Git history for alerts.

## Standing instruction: read PF_UI before ANY page change

Before touching any page, CSS or UI text, read `.claude/skills/PF_UI/SKILL.md` first (every session: Claude, Codex, Cowork). David has repeated these rules many times: big ivory title + small gold note, two layers only, clean screen, conclusion first, list only what is the same, differences in a hover "Notes 備註" corner, no small or cluttered text.

## Standing instruction: NT notes (David, 2026-11-13)

Every reply ends with the **NT 筆記** block (also whenever David types `NT`), with a one-line status each:
1. VIS 報告 → Ryan double check and confirm
2. B60 3 推論框架 comparison (`framework-compare.html`)
3. Viola 確認專案進度

Update this list when David adds or removes items.
