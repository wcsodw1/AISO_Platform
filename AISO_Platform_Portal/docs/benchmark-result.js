"use strict";
/* Benchmark Result: pick ONE machine (left: vendors, each with its machines and a photo), the right side shows that machine and opens its result.
   Machines come from MachinePicker.vendors, so a new machine added there shows up here by itself. English large, Chinese small beside it. */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const A = "assets/products/";
  const PHOTO = { pro6000: "pro6000-server-chassis-cutout.png", gb10: "gb10-ai-workstation-cutout.png", aiso1: "aiso1-ai-max395.png", rog395: "rog-flow-z13-gz302.webp", tuf392: "tuf-gaming-a14-fa401ea.webp", b70: "sparkle-arc-pro-b70-blower.webp", b60: "sparkle-arc-pro-b60-blower.webp" };
  const TIER = { c: ["Consumer", "消費級"], m: ["Mini-workstation", "迷你工作站"], s: ["Server", "伺服器"] };
  const V = window.MachinePicker.vendors;
  const all = V.flatMap(v => v.models.map(m => ({ ...m, vendor: v.name })));
  const first = (all.find(m => m.id === (location.hash || "").slice(1) && m.result) || all.find(m => m.result) || all[0]).id;
  let IDX = null;      // data/benchmark-result/index.json: the organised result files per machine (scripts/export_benchmark_result.py)
  fetch("data/benchmark-result/index.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => { IDX = d; if (d) render(); }).catch(() => {});
  const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const KIND = { summary: "📄", sheet: "📊", cases: "🗒", preflight: "🧾", hashes: "🔐" };
  function files(m) {
    const e = IDX && IDX.machines && IDX.machines[m.id]; if (!e || !e.files || !e.files.length) return "";
    const stat = e.cases != null ? `<p class="br-fs"><b>${e.cases}</b> ${bi("cases", "個案例")} · <b>${e.pass}</b> PASS · <b>${e.sources}</b> ${esc(e.sources_kind)}${e.as_of ? " · " + esc(e.as_of) : ""}</p>` : "";
    return `<div class="br-files"><h3>${bi("Result files", "結果檔案")}</h3>${stat}<div class="br-fl">${e.files.map(f => `<a class="br-f" href="${esc(f.path)}" ${/\.(xlsx|csv)$/.test(f.path) ? "download" : 'target="_blank" rel="noopener"'}><span aria-hidden="true">${KIND[f.kind] || "📁"}</span><b>${esc(f.en)}</b><small class="zhs">${esc(f.zh)}</small><em>${kb(f.bytes)}</em></a>`).join("")}</div></div>`;
  }
  let cur = first, mode = (location.hash === "#tier") ? "t" : "m";
  const img = (m, cls) => PHOTO[m.id] ? `<img class="${cls}" src="${A}${PHOTO[m.id]}" alt="${esc(m.n)}" loading="lazy">` : `<span class="${cls} br-noimg" aria-hidden="true"></span>`;
  function side() {
    return V.map(v => `<div class="br-v"><h2>${esc(v.name)}<small>${esc(v.stack)}</small></h2>${v.models.map(m => {
      const has = !!m.result;
      return `<button type="button" class="br-m${m.id === cur ? " on" : ""}${has ? "" : " off"}" data-id="${m.id}">${img(m, "br-ph")}<span class="br-mt"><b>${esc(m.n)}</b><small>${has ? bi("Result", "有結果") : bi("No result yet", "尚無結果")}</small></span></button>`;
    }).join("")}</div>`).join("");
  }
  function pane() {
    const m = all.find(x => x.id === cur), t = TIER[m.t] || ["", ""];
    const open = m.result ? `<a class="br-go" href="${m.result}">${bi("Open result", "開啟結果")} →</a>` : `<p class="br-none">${bi("No result yet", "尚無結果")}</p>`;
    return `${img(m, "br-big")}<div class="br-info"><p class="br-k">${esc(m.vendor)} · ${bi(t[0], t[1])}</p><h2>${esc(m.n)}</h2>
      ${m.spec ? `<p class="br-spec">${esc(m.spec)}</p>` : ""}${m.fw ? `<p class="br-fw">${bi("Frameworks", "框架")} · ${esc(m.fw)}</p>` : ""}
      <p class="br-st ${m.online ? "on" : ""}">${m.online ? bi("● Online", "可連線") : bi("○ Offline", "離線")}${m.note ? " · " + esc(m.note) : ""}</p>
      <div class="br-act">${open}</div>${files(m)}</div>`;
  }
  const LV = [["m", "Workstation · Mini", "工作站 · 入門"], ["a", "Workstation · Advanced", "工作站 · 進階"], ["s", "Server", "伺服器"], ["d", "Data center", "資料中心"]];
  function levels() {
    return `<section class="br-lv"><div class="br-lvs">${LV.map(([k, en, zh]) => {
      const ms = all.filter(m => m.t === k && m.result), cm = ms.filter(m => m.compare), ok = cm.length >= 2;
      const chips = ms.length ? ms.map(m => `<span class="br-chip${m.compare ? "" : " off"}" title="${m.compare ? "" : "Different test conditions, not compared 測試條件不同，不納入比對"}">${esc(m.n)}</span>`).join("") : `<span class="br-chip off">${bi("No machine yet", "尚無機型")}</span>`;
      const go = ok ? `<a class="br-go br-lvgo" href="stress-test-compare.html">${bi("Compare " + cm.length, "比對 " + cm.length + " 台")} →</a>` : `<p class="br-need">${bi("Needs 2+ comparable machines", "需兩台以上可比對機型")}</p>`;
      return `<div class="br-lc${ok ? "" : " off"}"><h3>${bi(en, zh)}</h3><div class="br-chips">${chips}</div>${go}</div>`;
    }).join("")}</div></section>`;
  }
  const MODES = [["m", "By machine", "單一機台"], ["t", "By tier", "依等級比對"]];
  function render() {
    const tabs = `<div class="br-modes" role="tablist" aria-label="View">${MODES.map(([k, en, zh]) => `<button type="button" role="tab" class="br-mode${k === mode ? " on" : ""}" aria-selected="${k === mode}" data-mode="${k}"><b>${en}</b><small>${zh}</small></button>`).join("")}</div>`;
    document.getElementById("brRoot").innerHTML = tabs + (mode === "t" ? levels() : `<nav class="br-side" aria-label="Machines">${side()}</nav><section class="br-pane">${pane()}</section>`);
  }
  document.getElementById("brRoot").addEventListener("click", e => { const t = e.target.closest(".br-mode"); if (t) { mode = t.dataset.mode; history.replaceState(null, "", mode === "t" ? "#tier" : "#" + cur); render(); return; } const b = e.target.closest(".br-m"); if (b) { cur = b.dataset.id; history.replaceState(null, "", "#" + cur); render(); } });
  render();
})();
