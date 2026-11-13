"use strict";
/* Workflow status page: three big items (Terminal · Test benchmark · Data) for each machine, read from the localhost-only /api/workflow/status.
   Read-only: nothing here starts a test. */
const $s = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MACHINES = [["aiso1", "AISO1", "AMD · AI MAX+ 395"], ["pro6000", "PRO6000", "NVIDIA · RTX PRO 6000 Blackwell"]];
const ICON = { ok: "✓", warn: "!", fail: "✕", blocked: "—", todo: "○" };
const WORD = { ok: ["OK", "正常"], warn: ["Check", "注意"], fail: ["Failed", "失敗"], blocked: ["Blocked", "被擋住"], todo: ["To do", "待辦"] };
const chip = st => `<span class="wf-chip ${st}">${ICON[st] || "?"} ${WORD[st] ? WORD[st][0] + '<small class="zhs">' + WORD[st][1] + "</small>" : esc(st)}</span>`;

function card(g) {
  return `<article class="wf-item ${g.status}"><header><h3>${esc(g.title)}<small class="zhs">${esc(g.zh)}</small></h3>${chip(g.status)}</header>
    <p class="wf-where">${esc(g.where)}</p>
    <ul class="wf-steps">${g.steps.map(s => `<li class="${s.status}"><i>${ICON[s.status] || "?"}</i><b>${esc(s.title)}<small class="zhs">${esc(s.zh)}</small></b><span>${esc(s.detail)}</span></li>`).join("")}</ul></article>`;
}
function panel(id, name, sub, data, err) {
  return `<section class="report-section wf-panel"><header><h2>${esc(name)}<span class="zh">${esc(sub)}</span></h2></header>${err ? `<p class="v2-fine wf-err">${esc(err)}</p>` : data.groups.map(card).join("")}</section>`;
}
async function load() {
  $s("wfGrid").innerHTML = MACHINES.map(([id, n, s]) => panel(id, n, s, null, "checking… 檢查中")).join("");
  const res = await Promise.all(MACHINES.map(([id]) => fetch("/api/workflow/status?machine=" + id, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(d => [d, ""]).catch(e => [null, "Needs the local server on this Mac (localhost). 需在本機開啟 · " + e.message])));
  $s("wfGrid").innerHTML = MACHINES.map(([id, n, s], i) => panel(id, n, s, res[i][0], res[i][1])).join("");
  $s("wfWhen").textContent = "Checked " + new Date().toLocaleTimeString() + " · 檢查時間";
}
$s("wfRefresh").onclick = load;
load();
