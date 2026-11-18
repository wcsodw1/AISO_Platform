"use strict";
/* Run page: where is the test now? (David 2026-11-18: 「每個 benchmark 都要有這個顯示，如 AISO1」)
   For a machine whose data file has "progress" ([{label, zh, detail, status: done|ongoing|todo|fail}]) the Run page shows the numbered steps, one status line and the
   Run log (the last lines of data/terminal/<machine>.json). While the terminal file says completed=false the last done step shows Running.
   If the platform executor reports progress / tail for an external run, those live values win and the panel refreshes every 10 s.
   Data contract for other machines: add "progress" to the dataset and keep data/terminal/<machine>.json up to date. */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ALIAS = { "aiso1-amd": "aiso1", "pro6000-tpi": "pro6000" };
  const machineId = () => { const m = location.hash.match(/^#\/pick\/[a-z]+\/([a-z0-9-]+)/); return m ? (ALIAS[m[1]] || m[1]) : null; };
  const ICO = { done: "✓", ongoing: "●", todo: "○", fail: "✕" }, WORD = { done: "Done 完成", ongoing: "Running 執行中", todo: "To do 待測", fail: "Failed 未通過" };
  let host = null, timer = null, shown = null;
  const get = u => fetch(u, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);

  async function load(id) {
    const reg = await get("data/benchmark-registry.json"), e = reg && (reg.single_machines || []).find(x => x.machine === id);
    const ds = e && e.file ? await get(e.file) : null;
    if (!ds || !(ds.progress && ds.progress.length)) return null;       // only machines that publish "progress"
    const term = await get("data/terminal/" + id + ".json");
    let st = await get("api/benchmark/executor/status?machine=" + id);   // live values, when the executor has them
    let wq = null;
    if (id === "gb10") { const g = await get("api/benchmark/gb10matrix/status"); if (g && g.ok) { wq = g; st = { ...(st || {}), busy: g.busy, tail: (g.tail || []).slice(-40) }; } }      // the GB10 matrix log (also a run started by hand)
    return { ds, term, st, wq };
  }
  /* GB10: the steps are the WEIGHT PRECISIONS of the weight-quantization test (David 2026-11-18); every other machine keeps the "progress" list of its data file */
  const WQ = [["bf16", "bf16", "不量化（基準）"], ["fp8", "fp8 online", "fp8 線上量化"], ["fp8pre", "fp8 pre-quantized", "fp8 預量化"], ["nvfp4", "NVFP4", "NVFP4（NVIDIA 官方）"], ["int8", "int8 AWQ", "int8 AWQ"], ["int4", "int4 AWQ", "int4 AWQ"]];
  function wqSteps(g) {
    const by = (g && g.by_weights) || {};
    return WQ.map(([k, label, zh]) => {
      const x = by[k], n = x ? x.pass : 0, nv = k === "nvfp4", pcs = nv ? `${n} passed` : `${n}/12 = ${(100 * n / 12).toFixed(1)}%`;      // NVFP4 runs 18 conditions (8K round + 64K/128K round), the backend counts 12: no x/12 for it
      if (!x) return { label, zh, status: "todo", detail: "not run yet · 未測" };
      if (x.state === "running") { const nw = g && g.now, K = i => Math.round(i / 1024) + "K";      // the case running right now (from the log), else the server is still starting
        const at = nw ? `Now 目前：NP${nw.np} · Input ${K(nw.input)} · Output ${nw.output}` : ((g && g.cases && g.cases.length) ? "between cases · 換下一個情境" : "starting vLLM · 啟動模型中");
        return { label, zh, status: "ongoing", detail: `${at}${nv ? "" : " · " + pcs}` }; }
      if (x.state === "done") return { label, zh, status: "done", detail: `${nv ? "" : "12 cases · "}${pcs}${x.fail ? " · " + x.fail + " failed" : ""}` };
      if (x.state === "failed") return { label, zh, status: "fail", detail: "", errRaw: x.error || "vLLM exited during start", word: "Failed to start 無法啟動" };
      return { label, zh, status: "fail", detail: `Stopped 中斷 · ${pcs}`, word: "Stopped 中斷" };
    });
  }
  function steps(d) {
    if (d.wq) return wqSteps(d.wq);
    const list = d.ds.progress.map(x => ({ ...x })), running = (d.term && d.term.completed === false) || (d.st && d.st.busy);
    if (running && list.length && list[list.length - 1].status === "done") list[list.length - 1].status = "ongoing";
    return list;
  }
  function render(d) {
    const list = steps(d), runs = d.wq ? [] : (d.ds.gb10_runs || d.ds[Object.keys(d.ds).find(k => /_runs$/.test(k))] || []);
    const pass = runs.filter(r => r.status === "PASS").length, running = list.some(x => x.status === "ongoing"), fin = list.filter(x => x.status === "done").length;
    const line = d.wq ? `${running ? "Running" : "Finished"}<small class="zhs">${running ? "執行中" : "已完成"}</small> · ${fin} / ${list.length} weight precisions done<small class="zhs">${fin} / ${list.length} 種權重精度完成</small>`
      : `${running ? "Running" : "Finished"}<small class="zhs">${running ? "執行中" : "已完成"}</small> · ${pass} / ${runs.length}${runs.length ? ` = ${(100 * pass / runs.length).toFixed(1)}%` : ""} conditions with results<small class="zhs">${pass} / ${runs.length} 個條件有數值</small>`;
    const wasOpen = host.__hvInit && !host.classList.contains("hv-closed");
    const fail = x => (/No available memory for the cache blocks/.test(x || "") ? "vLLM（此版本）在 KV cache 規劃階段報錯；模型已載入，非記憶體不足" : "vLLM 啟動失敗");
    host.innerHTML = `<header><h2>${d.wq ? 'Weight quantization<span class="zh">權重量化進度</span>' : 'Progress<span class="zh">進度</span>'}<span class="hv-sum">${line}</span></h2></header>
     <ol class="rp-steps">${list.map(x => { const s = ICO[x.status] ? x.status : "todo"; const det = x.errRaw ? `Failed to start 無法啟動 · ${fail(x.errRaw)}` : x.detail; return `<li class="rp-st rp-${s}"${x.errRaw ? ` title="${esc(x.errRaw)}"` : ""}><i aria-hidden="true">${ICO[s]}</i><div><b>${esc(x.label)}${x.zh ? `<small class="zhs">${esc(x.zh)}</small>` : ""}</b>${det ? `<p class="rp-d">${esc(det)}</p>` : ""}</div><em>${esc(x.word || WORD[s])}</em></li>`; }).join("")}</ol>`;   // a fold like the other panels (Notes / Per request): closed, one line beside the title; the Run log is the box under it
    host.classList.add("hv-fold"); if (!host.__hvInit) { host.classList.add("hv-closed"); host.__hvInit = 1; } else host.classList.toggle("hv-closed", !wasOpen);
    host.__hv = 0; if (window.HoverFold) HoverFold.bind(host);      // the header is new on every refresh: bind again; an open panel stays open
    host.hidden = false;
  }
  async function refresh() {
    const id = machineId(); if (!id) { host.hidden = true; return; }
    const d = await load(id); if (!d) { host.hidden = true; return; }
    shown = id; render(d);
  }
  function mount() {
    host = document.getElementById("runProgress"); if (!host) return;
    refresh(); window.addEventListener("hashchange", refresh);
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && shown) refresh(); }, 10000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.RunProgress = { refresh };
})();
