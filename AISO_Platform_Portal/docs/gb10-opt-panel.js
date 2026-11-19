"use strict";
/* GB10 optimization tests for the Run page: MTP and QAT, a category of their own (NOT one of the Step 1-3 test kinds; run-wizard.js draws the two cards under the steps).
   Per category: which configuration, the measured table (Input 8K: NP 1/3/5 x Output 256/512, aggregate tok/s) from the published variants dataset, and - when one of these
   runs is going on the machine - the LIVE "now" box, live cells and the Run log (shared with the weight-quantization panel's status + terminal feed). */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const NPS = [1, 3, 5], OUTS = [256, 512], kn = n => `${n / 1024}K`;
  const CATS = {
    mtp: { title: ["MTP test", "MTP 測試"], line: ["Speculative decoding: a small draft model proposes 3 tokens, the main model checks them.", "推測解碼：小草稿模型一次提 3 個 token，主模型驗證。"],
      match: /MTP/i, variants: [["bf16_mtp", "bf16 weights + MTP", "bf16 權重 + MTP"], ["nvfp4kv_mtp_on", "NVFP4 weights + NVFP4 KV + MTP", "NVFP4 權重 + NVFP4 KV + MTP"]] },
    qat: { title: ["QAT test", "QAT 測試"], line: ["The QAT checkpoint (quantization-aware trained, kept in bf16): same speed class as bf16, its value is quality.", "QAT 檢查點（量化感知訓練、以 bf16 保存）：速度與 bf16 同級，價值在品質。"],
      match: /QAT/i, variants: [["qat", "QAT · KV fp8", "QAT · KV fp8"], ["qat_nvfp4kv", "QAT + NVFP4 KV", "QAT + NVFP4 KV"], ["qat_mtp", "QAT + MTP", "QAT + MTP"]] }
  };
  const G = { data: null, loading: false, sel: { mtp: "bf16_mtp", qat: "qat" }, render: null };

  async function loadData() {
    if (G.data || G.loading) return;
    G.loading = true;
    try { const r = await fetch("data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json", { cache: "no-store" }); G.data = r.ok ? await r.json() : { variants: [] }; } catch (e) { G.data = { variants: [] }; }
    G.loading = false; if (G.render) G.render();
  }
  const status = () => (window.GbPanel && window.GbPanel.status && window.GbPanel.status()) || null;

  function grid(rows, live, nowKey) {
    const by = {}; (rows || []).forEach(c => { by[`${c.np}|${c.input}|${c.output}`] = c; });
    const cell = (np, o) => {
      const k = `${np}|8192|${o}`, c = by[k];
      if (c && c.status === "PASS") { const v = c.aggregate_tps != null ? c.aggregate_tps : c.agg; return `<td class="kv-ok"><b>✓</b><small>${v != null ? Number(v).toFixed(1) : ""} tok/s</small></td>`; }
      if (c) return `<td class="kv-bad"><b>✗</b></td>`;
      if (live && k === nowKey) return `<td class="kv-cur"><b>…</b></td>`;
      return `<td class="kv-wait"><b>—</b></td>`;
    };
    return `<div class="kv-where"><p class="kv-note">${bi("Where it is · one cell per case (NP × Output), Input 8K", "測到哪 · 每格一個情境（NP × 輸出），輸入 8K")}</p><div class="kv-wrap"><table class="kv-tab"><thead><tr><th>NP</th>${OUTS.map(o => `<th>8K · ${o}</th>`).join("")}</tr></thead><tbody>${NPS.map(np => `<tr><th>NP${np}</th>${OUTS.map(o => cell(np, o)).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }

  function question(kind) {
    const cat = CATS[kind === "gb10qat" ? "qat" : "mtp"], ck = kind === "gb10qat" ? "qat" : "mtp", sel = G.sel[ck];
    const st = status(), ok = st && st.ok, cfg = ok && st.config, mine = ok && st.busy && cfg && cat.match.test(cfg.en || "");
    const vs = (G.data && G.data.variants) || [], v = vs.find(x => x.key === sel);
    const opts = cat.variants.map(([k, en, zh]) => `<button type="button" class="mw-opt${k === sel ? " sel" : ""}" data-act="gboptsel" data-cat="${ck}" data-v="${k}"><span class="mw-l"><b>${bi(en, zh)}</b></span></button>`).join("");
    const rows = mine && st.cases_all ? st.cases_all : (v ? v.rows : []);
    const nowKey = mine && st.now ? `${st.now.np}|${st.now.input}|${st.now.output}` : null;
    const acc = v && v.mtp ? `<div><dt>MTP acceptance</dt><dd>${(v.mtp.draft_acceptance_rate * 100).toFixed(1)}% draft tokens accepted · mean length ${v.mtp.mean_acceptance_length} of ${v.mtp.max_acceptance_length}</dd></div>` : "";
    const spec = `<dl class="rw-sum kv-spec"><div><dt>Test</dt><dd>${esc(cat.title[0])} · Gemma 4 26B on vLLM · Input 8K · NP 1 / 3 / 5 · Output 256 / 512 · 6 cases</dd></div><div><dt>Machine</dt><dd>GB10 · 128 GB unified memory</dd></div>${v && v.note ? `<div><dt>Setup</dt><dd>${esc(v.note)}</dd></div>` : ""}${acc}</dl>`;
    const nowBox = mine ? `<div class="gb-now"><b>${bi("Now", "目前")}</b> · ${esc(cfg.en)}<span class="gb-pos">${st.now ? esc(`Input ${kn(st.now.input)} · NP${st.now.np} · Output ${st.now.output}`) : (st.phase ? bi(esc(st.phase.en), esc(st.phase.zh)) : bi("Starting…", "啟動中…"))}</span></div>` : "";
    const other = ok && st.busy && !mine ? `<p class="rw-msg warn">⚠ ${bi("The machine is running another test; the table below shows the measured results.", "機器正在跑別的測試；下方是已量測的結果。")}</p>` : "";
    const down = !ok ? `<p class="rw-msg warn">⚠ ${esc((st && st.error) || "Checking the machine… 檢查機器中…")}</p>` : "";
    return { title: bi(cat.title[0], cat.title[1]), ok: false, next: "", last: true,
      body: `<p class="rw-msg">${bi(cat.line[0], cat.line[1])}</p>${down}${other}
        <div class="mw-opts" role="listbox">${opts}</div>${spec}
        <h4 class="kv-h4">${bi(mine ? "Progress (live)" : "Measured results", mine ? "進度（即時）" : "已量測結果")}</h4>${nowBox}${grid(rows, mine, nowKey)}
        <div class="rw-row kv-act"><button type="button" class="mw-next" disabled>${bi("Start", "開始")}</button></div>
        <p class="kv-note">${bi("Starting this from the platform is not wired yet; the numbers above were measured on the machine. Live progress and the Run log appear here whenever one of these runs is going.", "從平台按 Start 還沒接上；上表是機器上實測的結果。這類測試進行時，這裡與 Run log 會即時顯示進度。")}</p>
        <div class="rw-row"><a class="rw-btn" href="stress-test-gb10.html">${bi("Open the results", "開啟結果頁")} →</a></div>` };
  }
  window.GbOpt = {
    init(render) { G.render = render; loadData(); if (window.GbPanel) window.GbPanel.init(render); },
    question, select(cat, v) { if (CATS[cat]) { G.sel[cat] = v; if (G.render) G.render(); } },
    note() { const st = status(); return st && st.busy && st.config && /MTP|QAT/i.test(st.config.en || "") ? bi("Running", "執行中") : ""; }
  };
})();
