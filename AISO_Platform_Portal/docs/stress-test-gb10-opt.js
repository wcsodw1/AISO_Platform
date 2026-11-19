"use strict";
/* GB10 results page, tab "MTP · QAT": the optimization variants measured at Input 8K (NP 1/3/5 x Output 256/512), each against its own baseline, with the MTP draft acceptance,
   and the Benchmark Result reports to read / download. Data: data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json (+ the weight-quantization file for the bf16 baseline).
   Difference in % is "better = +" like the other tabs (TPS higher is better, TTFT / TPOT lower is better). Nothing is estimated. */
(function () {
  const START_HASH = location.hash;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const mean = a => { a = a.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const gain = (v, b, hi) => (Number.isFinite(v) && Number.isFinite(b) && b ? 100 * (hi ? v / b - 1 : 1 - v / b) : null);
  const dl = v => (Number.isFinite(v) ? `<span class="wq-d ${v > 0.05 ? "up" : v < -0.05 ? "dn" : ""}">${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%</span>` : "—");
  const S = (h, zh, body) => `<section class="report-section kvx"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  const F = (h, zh, one, body) => `<section class="report-section kvx hv-fold hv-closed"><header><h2>${h}<span class="zh">${zh}</span></h2><p class="v2-fine hv-one">${one}</p></header>${body}</section>`;
  const key = r => `${r.np}|${r.input}|${r.output}`;
  const REPORTS = [["GB10_GB10_MTP_QAT_and_NVFP4_KV_variants_20261119.md", "MTP, QAT and NVFP4 KV variants", "MTP、QAT 與 NVFP4 KV 變體（整合報告）"],
    ["GB10_GB10_MTP_on_NVFP4_weights_with_NVFP4_KV_20261119.md", "MTP on NVFP4 weights with NVFP4 KV", "NVFP4 權重 + NVFP4 KV 開 MTP"],
    ["GB10_GB10_NVFP4_weights_with_NVFP4_KV_cache_20261119.md", "NVFP4 weights with NVFP4 KV cache", "NVFP4 權重 + NVFP4 KV cache"]];
  const M = { ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false, d: 2 }, tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false, d: 1 },
    decode_only_tps: { short: "TPS (Decode only)", zh: "平均每秒產生幾個字（每個請求，不含首字等待）", unit: "tok/s", higher: true, d: 1 },
    normalized_tps: { short: "TPS (Normalized)", zh: "每請求每秒輸出 token", unit: "tok/s", higher: true, d: 2 }, aggregate_tps: { short: "TPS (Aggregate)", zh: "NP 個請求合計每秒輸出 token", unit: "tok/s", higher: true, d: 2 } };
  // chart groups: x = NP, one line per variant, the first one is the baseline of the group
  const GRP = [["all", "All · differences vs bf16", "全部 · 相對 bf16 的差異", [["bf16", "bf16 (baseline)", "#f2f2f2"], ["bf16_mtp", "bf16 + MTP", "#ff8a4c"], ["qat", "QAT", "#4fd1b0"], ["qat_mtp", "QAT + MTP", "#c8e86a"], ["qat_nvfp4kv", "QAT + NVFP4 KV", "#5cc8d6"],
      ["nvfp4", "NVFP4 · KV fp8", "#ffd21f"], ["nvfp4kv", "NVFP4 + NVFP4 KV", "#b48cff"], ["nvfp4kv_mtp_on", "NVFP4 + NVFP4 KV + MTP", "#ff5ea8"]]],
    ["bf16mtp", "bf16 · MTP", "bf16 · MTP", [["bf16", "bf16 (baseline, MTP off)", "#f2f2f2"], ["bf16_mtp", "bf16 + MTP", "#ff8a4c"]]],
    ["nvmtp", "NVFP4 + NVFP4 KV · MTP", "NVFP4 + NVFP4 KV · MTP", [["nvfp4kv_mtp_off", "NVFP4 + NVFP4 KV (baseline, MTP off)", "#b48cff"], ["nvfp4kv_mtp_on", "NVFP4 + NVFP4 KV + MTP", "#ffd21f"]]],
    ["qat", "QAT", "QAT", [["bf16", "bf16 (baseline)", "#f2f2f2"], ["qat", "QAT · KV fp8", "#4fd1b0"], ["qat_nvfp4kv", "QAT + NVFP4 KV", "#5cc8d6"], ["qat_mtp", "QAT + MTP", "#ff8a4c"]]]];
  let V = null, WQ = null, sel = { grp: "all", output: 256 };

  function rowsOf(k) {
    const v = ((V && V.variants) || []).find(x => x.key === k); if (v) return v.rows || [];
    const w = ((WQ && WQ.weights) || []).find(x => x.key === k); return w ? (w.rows || []).filter(r => r.input === 8192) : [];
  }
  function against(rows, base) {
    const bm = {}; base.filter(r => r.status === "PASS").forEach(r => { bm[key(r)] = r; });
    const pairs = rows.filter(r => r.status === "PASS" && bm[key(r)]).map(r => [r, bm[key(r)]]);
    return { n: pairs.length, tps: mean(pairs.map(([a, b]) => gain(a.aggregate_tps, b.aggregate_tps, true))), ttft: mean(pairs.map(([a, b]) => gain(a.ttft_s, b.ttft_s, false))), tpot: mean(pairs.map(([a, b]) => gain(a.tpot_ms, b.tpot_ms, false))) };
  }
  const baseLabel = k => { const v = ((V && V.variants) || []).find(x => x.key === k); return v ? v.label : (k === "bf16" ? "bf16 weights · KV fp8" : k); };

  function summary(vs) {
    const body = vs.map(v => {
      const base = v.baseline ? rowsOf(v.baseline) : [], d = base.length ? against(v.rows || [], base) : null, ok = (v.rows || []).filter(r => r.status === "PASS").length;
      const m = v.mtp ? `${(v.mtp.draft_acceptance_rate * 100).toFixed(1)}% · ${v.mtp.mean_acceptance_length}/${v.mtp.max_acceptance_length}` : "—";
      return `<tr><td>${esc(v.label)}</td><td>${ok}/${(v.rows || []).length}</td><td>${m}</td><td>${d ? dl(d.tps) : "—"}</td><td>${d ? dl(d.ttft) : "—"}</td><td>${d ? dl(d.tpot) : "—"}</td><td class="kv-note">${v.baseline ? esc(baseLabel(v.baseline)) : "baseline"}</td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Variant<small>變體</small></th><th>Cases PASS<small>通過</small></th><th>MTP accepted · mean length<small>草稿接受率 · 平均長度</small></th><th>TPS (Aggregate)<small>聚合</small></th><th>TTFT<small>首字延遲</small></th><th>TPOT<small>字間隔</small></th><th>Against<small>對照</small></th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="v2-fine">Input 8K · NP 1/3/5 · Output 256/512 · 1 run per case. + is better (more TPS, lower TTFT / TPOT); mean over the cases both sides have. MTP numbers use natural-text prompts; the repeated-block prompt over-states MTP (see the reports). 輸入 8K，+ 較好。</p>`;
  }
  function detail(v) {
    const base = {}; (v.baseline ? rowsOf(v.baseline) : []).forEach(r => { base[key(r)] = r; });
    const by = {}; (v.rows || []).forEach(r => { by[key(r)] = r; });
    const cell = (np, o) => {
      const r = by[`${np}|8192|${o}`]; if (!r) return "<td>—</td>";
      const b = base[key(r)], g = b && b.status === "PASS" && r.status === "PASS" ? gain(r.aggregate_tps, b.aggregate_tps, true) : null;
      return r.status === "PASS" ? `<td><b>${f(r.aggregate_tps, 1)}</b> tok/s ${g != null ? dl(g) : ""}<br><small>TTFT ${f(r.ttft_s, 2)} s · TPOT ${f(r.tpot_ms, 1)} ms</small></td>` : `<td>${esc(r.status)}</td>`;
    };
    return `<details class="gb-fold"><summary>${esc(v.label)}</summary><p class="v2-fine">${esc(v.note || "")}</p><div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>NP</th><th>8K · 256</th><th>8K · 512</th></tr></thead><tbody>${[1, 3, 5].map(np => `<tr><td>NP${np}</td>${cell(np, 256)}${cell(np, 512)}</tr>`).join("")}</tbody></table></div></details>`;
  }
  const pick = (list, k, label) => `<div class="cmp-pick"><span>${label}</span><div class="st-tabs cmp-tabs">${list.map(([v, t]) => `<button type="button" class="has${String(v) === String(sel[k]) ? " on" : ""}" data-optsel="${k}" data-v="${v}">${esc(t)}</button>`).join("")}</div></div>`;
  function charts() {
    const g = GRP.find(x => x[0] === sel.grp) || GRP[0], ser = g[3].filter(x => rowsOf(x[0]).length);
    const rowOf = (k, np) => rowsOf(k).find(r => r.np === np && r.input === 8192 && r.output === sel.output);
    const groups = [1, 3, 5].map(np => ({ label: "NP" + np, sub: "", np }));
    const html = BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups, width: Math.max(320, ($("gvOpt").clientWidth || 860) - 100), context: `8K in · ${sel.output} out`, rowHead: "NP",
      series: ser.map(x => ({ key: x[0], label: x[1], sum: x[1], color: x[2] })),
      get: (key, gr) => { const r = rowOf(key, gr.np); return r && r.status === "PASS" && Number.isFinite(r[k]) ? r : null; }, baseline: ser[0] && ser[0][0], message: "" })));
    return `<p class="wq-leg">${ser.map(x => `<span><i style="background:${x[2]}"></i>${esc(x[1])}</span>`).join("")}</p><div>${html}</div>`;
  }
  const IDEAS = `<ul>
    <li><b>QAT quality</b>: accuracy / perplexity of QAT against bf16 - this is what QAT is for, speed does not show it.<small class="zhs">QAT 的品質（準確度／困惑度）：QAT 的價值在這裡，速度看不出來。</small></li>
    <li><b>MTP draft length</b>: 1 / 2 / 3 / 5 draft tokens - find the best setting.<small class="zhs">MTP 草稿長度：1／2／3／5 個，找最佳值。</small></li>
    <li><b>MTP on long inputs</b>: 64K / 128K (only 8K is measured), and at higher concurrency (gain usually shrinks as more requests share the GPU).<small class="zhs">長輸入與更高並發下的 MTP（目前只測 8K）。</small></li>
    <li><b>MTP by task type</b>: code, chat, summarization, translation - draft acceptance depends on how predictable the text is.<small class="zhs">不同任務的接受率（程式、對話、摘要、翻譯）。</small></li>
    <li><b>Real QAT 4-bit deployment</b>: the q4_0 quantized QAT model (speed and memory), e.g. on llama.cpp; here the unquantized QAT checkpoint was used.<small class="zhs">真正的 QAT 4-bit 部署（速度與記憶體）；這裡用的是未量化的 QAT 檢查點。</small></li>
    <li><b>Other combinations</b>: MTP on fp8 weights, NVFP4 weights with fp8 KV + MTP; memory and power per token.<small class="zhs">其他組合：fp8 權重 + MTP、每 token 的記憶體與耗電。</small></li></ul>`;
  const PLAN = `
    <div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Measured now<small>已測</small></th><th>What is different<small>差在哪</small></th></tr></thead><tbody>
    <tr><td>bf16 (baseline)</td><td>Original weights, KV fp8, no speculative decoding</td></tr>
    <tr><td>bf16 + MTP</td><td>Same weights; a small draft model (Gemma 4 assistant) proposes 3 tokens per step, the main model verifies</td></tr>
    <tr><td>QAT</td><td>The quantization-aware-trained checkpoint (kept in bf16 here, so speed is expected to match bf16; its point is quality)</td></tr>
    <tr><td>QAT + MTP</td><td>QAT checkpoint with the draft model for it</td></tr>
    <tr><td>QAT + NVFP4 KV</td><td>QAT checkpoint with the KV cache stored in NVFP4 (about 4x smaller than fp16)</td></tr>
    <tr><td>NVFP4 · KV fp8 / NVFP4 + NVFP4 KV / + MTP</td><td>NVIDIA's NVFP4 weights; then NVFP4 KV cache; then MTP on top (compared with its own MTP-off run on the same prompts)</td></tr></tbody></table></div>
`;
  function runsTable() {      // from the recorded attempts: how many server starts each configuration needed, and how many ended without any result
    const rows = [];
    ((WQ && WQ.weights) || []).filter(w => ["bf16", "nvfp4", "nvfp4kv", "fp8", "fp8pre", "int8", "int4"].includes(w.key)).forEach(w => {
      const at = w.attempts || [], none = at.filter(a => !a.pass).length, n = (w.rows || []).length;
      rows.push([w.label[0], n ? "1" : "—", String(at.length || 1), none ? `${none} without results` : "all gave results", w.start_failed ? "failed to start (no memory left for the KV cache)" : (n ? "ok" : "")]);
    });
    ((V && V.variants) || []).forEach(v => rows.push([v.label, "1", String(v.attempts || 1), "all gave results", "ok"]));
    return `<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Configuration<small>設定</small></th><th>Runs per case<small>每情境次數</small></th><th>Server starts<small>開機次數</small></th><th>Starts<small>開機結果</small></th><th>Result<small>結果</small></th></tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="v2-fine">A case is run once and never retried or averaged; a failed case stays in the table as failed. Some configurations were started twice on purpose (the 8K set and the 64K / 128K set run in separate server starts).<small class="zhs">每個情境只跑 1 次，不重試、不平均；失敗的情境照實列出。有些設定分兩次開機（8K 一組、64K／128K 一組）。</small></p>`;
  }
  function render() {
    ((V && V.variants) || []).concat(((WQ && WQ.weights) || [])).forEach(v => (v.rows || []).forEach(r => { if (r.decode_only_tps == null) r.decode_only_tps = Number.isFinite(r.tpot_ms) && r.tpot_ms > 0 ? 1000 / r.tpot_ms : null; }));
    const vs = ((V && V.variants) || []).filter(v => (v.rows || []).length);
    const reports = `<ul class="gb-reports">${REPORTS.map(([file, en, zh]) => `<li><a class="v2-dl" href="data/reports/${file}" target="_blank" rel="noopener">${esc(en)}<small class="zhs">${esc(zh)}</small></a> <a class="v2-dl" href="data/reports/${file}" download>↓ .md</a></li>`).join("")}</ul>`;
    $("gvOpt").innerHTML = S("Select", "選擇", pick(GRP.map(x => [x[0], x[1]]), "grp", 'Compare <small class="zhs">比較</small>') + pick([[256, "Output 256"], [512, "Output 512"]], "output", 'Output <small class="zhs">輸出</small>') + `<p class="kv-fine">Input 8K. NP 1 / 3 / 5 are on the x axis of the charts and in the table.<small class="zhs">輸入 8K；NP 1 / 3 / 5 在圖的橫軸與下方表格。</small></p>`)
      + S("TTFT · TPOT · TPS", "四項指標", charts())
      + F("What is compared", "比較什麼", 'Same model (Gemma 4 26B), different settings, each against bf16: what do MTP and QAT change?<small class="zhs">同一個模型（Gemma 4 26B）、不同設定，全部對 bf16 比較：MTP、QAT 帶來什麼差異？</small>', PLAN)
      + F("Summary", "總表", 'Each variant against its baseline: TPS, TTFT, TPOT and the MTP draft acceptance.<small class="zhs">各變體對基準的差異與 MTP 草稿接受率。</small>', vs.length ? summary(vs) : `<p class="v2-fine">No data yet. 尚無資料。</p>`)
      + F("Values by variant", "逐變體數值", 'Every case of every variant: tok/s, TTFT and TPOT.<small class="zhs">每個變體每個情境的數值。</small>', vs.map(detail).join(""))
      + F("Runs and retries", "測試次數與重試", 'Every case ran once (no averaging, no retry); the table lists how many server starts each setting needed.<small class="zhs">每個情境跑 1 次、不平均不重試；表中是各設定開機幾次。</small>', runsTable())
      + F("Not measured yet", "還沒測的想法", 'Ideas for more tests (QAT quality, MTP draft length, long inputs, task types, real 4-bit QAT) - suggestions, no results yet.<small class="zhs">可以加的測試：建議，還沒有結果。</small>', IDEAS)
      + F("Benchmark Result reports", "測試報告", 'Three reports (.md) and the data file to read or download.<small class="zhs">三份報告與資料檔，可閱讀或下載。</small>', reports + `<p class="v2-fine"><a class="v2-dl" href="data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json" download>Download .JSON</a></p>`);
    if (window.HoverFold) HoverFold.init(document);
  }
  document.addEventListener("click", e => {
    const q = e.target.closest("[data-optsel]"); if (q && V) { sel[q.dataset.optsel] = q.dataset.optsel === "output" ? Number(q.dataset.v) : q.dataset.v; render(); return; }
    const b = e.target.closest("#gbView button"); if (!b) return;
    const on = b.dataset.view === "opt", box = $("gvOpt"); if (!box) return;
    box.hidden = !on;
    if (on) { ["gvSmoke", "gvWq", "gvStdCmp", "gvKv"].forEach(id => { const x = $(id); if (x) x.hidden = true; }); document.querySelectorAll(".gv-std").forEach(x => { x.hidden = true; }); render(); }
  });
  Promise.all(["AISO_GB10_vLLM_gemma26_variants.json", "AISO_GB10_vLLM_gemma26_weightquant.json"].map(n => fetch("data/benchmark-gb10/" + n, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null))).then(([v, w]) => {
    if (!v) return;
    V = v; WQ = w;
    const nav = $("gbView"); if (!nav || nav.querySelector('[data-view="opt"]')) return;
    nav.insertAdjacentHTML("beforeend", '<button type="button" role="tab" data-view="opt" aria-selected="false">MTP · QAT<small>優化</small></button>');
    if (!$("gvOpt")) { const d = document.createElement("div"); d.id = "gvOpt"; d.className = "gv-wrap"; d.hidden = true; (($("gvKv") || $("gvWq")).parentNode).insertBefore(d, ($("gvKv") || $("gvWq")).nextSibling); }
    if (START_HASH === "#opt") { let n = 0; const t = setInterval(() => { n++; const w2 = $("gvWq"); if ((w2 && w2.innerHTML.trim()) || n > 40) { clearInterval(t); nav.querySelector('[data-view="opt"]').click(); } }, 150); }
  });
})();
