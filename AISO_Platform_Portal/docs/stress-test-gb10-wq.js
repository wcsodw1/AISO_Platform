"use strict";
/* GB10 results page: three views at the top - Smoke | Standard | Weight quantization (David 2026-11-18).
   Each view compares the weight precisions on the SAME conditions: bf16 (the original model) against fp8 online, fp8 pre-quantized, int8 AWQ, int4 AWQ; one colour per precision, difference in % against bf16.
   A precision / condition that was not run is greyed and says "not run yet" - no number is filled in or estimated; a FAIL shows the error that was recorded.
   Weight quantization data: data/benchmark-gb10/AISO_GB10_vLLM_gemma26_weightquant.json (scripts/export_gb10_weightquant.py).  Smoke + Standard: the page's own dataset (bf16 weights only so far). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const kn = i => `${Math.round(i / 1024)}K`;
  const W = [["bf16", "bf16", "bf16（原模型，不量化）", "#f2f2f2"], ["fp8", "fp8 online", "fp8 線上量化", "#ff8a4c"], ["fp8pre", "fp8 pre-quantized", "fp8 預量化", "#4fd1b0"], ["nvfp4", "NVFP4 · KV fp8", "NVFP4（KV fp8）", "#ffd21f"], ["nvfp4kv", "NVFP4 · NVFP4 KV", "NVFP4 + NVFP4 KV cache", "#b48cff"], ["int8", "int8 AWQ", "int8 AWQ", "#e07a8f"], ["int4", "int4 AWQ", "int4 AWQ", "#5cc8d6"]];
  const M = { ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false, d: 2 }, tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false, d: 1 },
    decode_only_tps: { short: "TPS (Decode only)", zh: "純產生速度（不含首字等待）= 1000 ÷ TPOT，每請求", unit: "tok/s", higher: true, d: 1 },
    normalized_tps: { short: "TPS (Normalized)", zh: "每請求每秒輸出 token", unit: "tok/s", higher: true, d: 2 }, aggregate_tps: { short: "TPS (Aggregate)", zh: "NP 個請求合計每秒輸出 token", unit: "tok/s", higher: true, d: 2 } };
  const gain = (v, b, hi) => (Number.isFinite(v) && Number.isFinite(b) && b ? 100 * (hi ? v / b - 1 : 1 - v / b) : null);
  const mean = a => { a = a.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const dl = v => (Number.isFinite(v) ? `<span class="wq-d ${v > 0.05 ? "up" : v < -0.05 ? "dn" : ""}">${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%</span>` : "");
  const kv = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const F = (h, zh, body) => `<section class="report-section kvx hv-fold hv-closed"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  const S = (h, zh, body) => `<section class="report-section kvx"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  /* ONE Parameters zone, two labelled blocks (David 2026-11-18): what we chose to test vs. how vLLM was really started */
  const PZ = (keyBody, srvBody, foot) => `<section class="report-section kvx"><header><h2>Parameters<span class="zh">測試參數</span></h2></header>
    <p class="kv-fine">Key parameters = what we chose to test; Server parameters = how vLLM was actually started and what it reported.<small class="zhs">Key parameters 是我們設定要測的條件；Server parameters 是 vLLM 實際啟動的設定與回報（取自測試結果檔，非手填）。</small></p>
    <details class="wq-fold" open><summary><h3 class="kv-h3">Key parameters<small class="zhs">要測什麼</small></h3></summary>${keyBody}</details>
    <details class="wq-fold"><summary><h3 class="kv-h3">Server parameters<small class="zhs">vLLM 實際怎麼跑</small></h3></summary>${srvBody}${foot || ""}</details></section>`;
  const why = (e, n) => (/No available memory for the cache blocks/.test(e || "") ? (n > 0 ? `已嘗試 ${n} 次，` : "") + "vLLM（此版本）在 KV cache 規劃階段報錯；模型已載入，非記憶體不足" : "vLLM 啟動失敗");      // ONE sentence on the page; the original error is in the hover
  const failHtml = x => `<span class="wq-fail" title="${esc(String(x.start_error || "").replace(/~\//g, ""))}">Failed to start<small class="zhs">無法啟動 · ${why(x.start_error, (x.attempts || []).length)}</small></span>`;
  const NA = '<span class="wq-na">N/A</span>';
  const NOT = '<span class="wq-not">not run yet<small class="zhs">未測</small></span>';
  let BYK = {}, DS = null, WQ = null, view = "wq", sel = { input: 8192, output: 256 };

  /* ---------- Parameters box with the AISO1 field names (vLLM has no value for some: N/A) ---------- */
  function keyParams(o) {
    return `<dl class="st-params">${kv('Machine <small class="zhs">機器</small>', "GB10 · 128 GB unified memory")}${kv("Framework", "vLLM · nightly-2026-11-02")}${kv('Model <small class="zhs">模型</small>', "Gemma 4 26B (MoE) · " + esc(o.weights))}
      ${kv('Input <small class="zhs">輸入</small>', o.input)}${kv('Output <small class="zhs">輸出</small>', o.output)}${kv('NP <small class="zhs">並發</small>', o.np)}
      ${kv('Repeat <small class="zhs">重複</small>', "1 run per case, not averaged")}${kv("Batch size", "8,192 (max batched tokens, chunked prefill ON)")}${kv("Ubatch", NA)}
      ${kv("Context per slot", NA)}${kv("Slots", "max num seqs " + esc(o.seqs || "5"))}${kv('總 Context', o.ctx || "input + output")}
      ${kv('KV cache type <small class="zhs">KV cache 型別</small>', "fp8")}${kv('Flash Attention <small class="zhs">閃存注意力</small>', NA)}${kv('Weight precision <small class="zhs">權重精度</small>', esc(o.wlist))}</dl>`;
  }

  /* ---------- a case x precision comparison table (and the charts) ---------- */
  const withData = (cases, rowOf) => W.filter(w => cases.some(c => rowOf(w[0], c)));      // a column without any number is not drawn (David 2026-11-18)
  function cmpTable(cases, rowOf, labelOf, ws) {
    ws = ws || withData(cases, rowOf);
    const cols = Object.entries(M);
    const head = `<tr><th rowspan="2">Case<small>情境</small></th>${cols.map(([, m]) => `<th class="l" colspan="${ws.length}">${m.short}<small>${m.unit}</small></th>`).join("")}</tr><tr>${cols.map(() => ws.map(w => `<th><i class="v2-sw" style="background:${w[3]}"></i>${esc(w[1])}</th>`).join("")).join("")}</tr>`;
    const body = cases.map(c => `<tr><td>${labelOf(c)}</td>${cols.map(([k, m]) => ws.map(w => {
      const r = rowOf(w[0], c), b = rowOf("bf16", c);
      if (!r) { const x = BYK[w[0]]; return x && x.start_failed ? `<td class="wq-f" title="${esc(String(x.start_error || "").replace(/~\//g, ""))}"><b>Failed to start</b><small>無法啟動</small></td>` : `<td class="wq-g">${NOT}</td>`; }
      if (r.status !== "PASS") return `<td class="wq-f" title="${esc(r.error || "")}"><b>FAIL</b><small>${esc((r.error || "no error recorded").slice(0, 60))}</small></td>`;
      const tw = r.kv_tight ? ` <span class="wq-warn" title="KV cache 容量不足，請求被排隊，TPOT／Decode TPS 不可直接與其他精度比 · KV cache too small, requests queued; TPOT / Decode TPS not comparable">⚠</span>` : "";
      return `<td><b>${num(r[k], m.d)}</b>${tw}${w[0] !== "bf16" && b && b.status === "PASS" ? " " + dl(gain(r[k], b[k], m.higher)) : w[0] === "bf16" ? ' <span class="wq-d">baseline</span>' : ""}</td>`;
    }).join("")).join("")}</tr>`).join("");
    return `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function legend(ws) { return `<p class="wq-leg">${(ws || W).map(w => `<span><i style="background:${w[3]}"></i>${esc(w[1])}</span>`).join("")}</p>`; }
  function restLine(cases, rowOf) {
    const rest = W.filter(w => w[0] !== "bf16" && !cases.some(c => rowOf(w[0], c)));
    if (!rest.length) return "";
    const failed = rest.filter(w => BYK[w[0]] && BYK[w[0]].start_failed), other = rest.filter(w => !failed.includes(w));
    const hov = failed.map(w => String(BYK[w[0]].start_error || "").replace(/~\//g, "")).filter((x, i, a) => a.indexOf(x) === i).join(" | ");
    const bits = [];
    if (other.length) bits.push(`${esc(other.map(w => w[1]).join(" · "))}：未測 not run yet`);
    return bits.length ? `<p class="kv-fine">${bits.join("　")}</p>` : "";      // a precision that failed to start is NOT listed in the conclusion (David 2026-11-19); its state and error are in the Parameters zone
  }
  function conclusion(cases, rowOf) {
    const lines = W.filter(w => w[0] !== "bf16").map(w => {
      const ds = cases.map(c => { const a = rowOf(w[0], c), b = rowOf("bf16", c); return a && b && a.status === "PASS" && b.status === "PASS" ? [gain(a.aggregate_tps, b.aggregate_tps, true), gain(a.ttft_s, b.ttft_s, false), gain(a.tpot_ms, b.tpot_ms, false)] : null; }).filter(Boolean);
      if (!ds.length) return "";
      const pill = `<span class="kv-pill" style="border-color:${w[3]};color:${w[3]}">${esc(w[1])}</span>`;
      return `<li>${pill}<span class="kv-d">TPS ${dl(mean(ds.map(x => x[0])))} · TTFT ${dl(mean(ds.map(x => x[1])))} · TPOT ${dl(mean(ds.map(x => x[2])))}<small class="zhs">${ds.length} / ${cases.length} 個情境對照 bf16</small></span></li>`;
    }).join("");
    return S("Conclusion", "結論", `<p class="kv-big">Each precision against bf16 (the original model)<small>各權重精度對照 bf16（原模型）</small></p>${lines ? `<ul class="kv-list">${lines}</ul>` : ""}${restLine(cases, rowOf)}<p class="kv-fine">+ is better (more TPS, lower TTFT / TPOT). Mean over the cases both have. TPOT is measured by the client (an estimate); TPS (Decode only) is 1000 ÷ TPOT per request, without the first-token wait.<small class="zhs">+ 較好；兩者都有的情境平均。TPOT 為用戶端量到的估計值；Decode TPS 是它的倒數（每請求，不含首字等待）。</small></p>`);
  }

  /* ---------- Smoke ---------- */
  /* the smoke conclusion names ONLY the model that passed preflight and the smoke test; nothing about precisions that were not smoke-tested (David 2026-11-18) */
  function smokeConclusion(r) {
    const w = W.find(x => x[0] === "bf16") || ["bf16", "bf16（不量化）", "", "#8f9bff"], ok = r.status === "PASS";
    const pill = `<span class="kv-pill" style="border-color:${w[3]};color:${w[3]}">${esc(w[0])}</span>`;
    const head = ok ? `<p class="kv-big">${esc(w[0])} (the original model) passed preflight and the smoke test<small>${esc(w[0])}（原模型）預檢與冒煙測試都通過</small></p>`
      : `<p class="kv-big">${esc(w[0])} (the original model) did not pass the smoke test<small>${esc(w[0])}（原模型）冒煙測試未通過</small></p>`;
    const line = ok ? `<ul class="kv-list"><li>${pill}<span class="kv-d">TTFT ${num(r.ttft_s, 1)} s · TPOT ${num(r.tpot_ms, 1)} ms · TPS ${num(r.aggregate_tps, 1)} tok/s<small class="zhs">NP${r.np} · ${kn(r.input)} 輸入 · 輸出 ${r.output} · 預檢 ✓ 冒煙 ✓</small></span></li></ul>` : "";
    return S("Conclusion", "結論", `${head}${line}<p class="kv-fine">Only models that passed preflight and the smoke test are listed.<small class="zhs">只列出預檢與冒煙測試都通過的模型。</small></p>`);
  }
  function smoke() {
    const r0 = (DS.gb10_runs || []).find(r => r.phase === "smoke"); if (!r0) { $("gvSmoke").innerHTML = '<p class="v2-fine">No smoke data.</p>'; return; }
    const cases = [r0], rowOf = k => (k === "bf16" ? r0 : null), lab = c => `NP${c.np} · ${kn(c.input)} · ${c.output}`;
    $("gvSmoke").innerHTML = smokeConclusion(r0)
      + S("Select conditions", "選擇條件", `<p class="kv-fine">One condition only: ${esc(lab(r0))}.<small class="zhs">冒煙測試只有這一組條件。</small></p>`)
      + S("Key parameters", "測試參數", keyParams({ weights: "bf16 (not quantized)", input: `${r0.input.toLocaleString("en-US")} (${kn(r0.context)})`, output: `${r0.output} tokens`, np: String(r0.np), ctx: r0.context.toLocaleString("en-US"), wlist: "bf16" }))
      + S("TTFT · TPOT · TPS", "四項指標", legend(withData(cases, rowOf)) + cmpTable(cases, rowOf, lab));
  }

  /* ---------- Standard ---------- */
  function standard() {
    const runs = (DS.gb10_runs || []).filter(r => r.phase === "run").sort((a, b) => a.np - b.np || a.input - b.input || a.output - b.output);
    const rowOf = k => null, lab = c => `NP${c.np} · ${kn(c.context)} · ${c.output}`;
    const rows = runs; const ro = (k, c) => (k === "bf16" ? c : null);
    $("gvStdCmp").innerHTML = conclusion(rows, ro)
      + S("Weight precisions on the same conditions", "各權重精度對照（同條件）", `${legend(withData(rows, ro))}<p class="kv-fine">Only bf16 was run on these standard conditions so far; the other precisions were measured on the Weight quantization matrix (next tab).<small class="zhs">標準測試條件目前只有 bf16 測過，其他精度的數字在「Weight quantization」分頁（另一組條件）。</small></p>${cmpTable(rows, ro, lab)}`);
  }

  /* ---------- Weight quantization ---------- */
  function wq() {
    const by = {}; (WQ.weights || []).forEach(w => { by[w.key] = w; }); BYK = by;
    const rowOf = (k, c) => { const w = by[k]; return w ? (w.rows || []).find(r => r.np === c.np && r.input === c.input && r.output === c.output) : null; };
    const cases = []; [1, 3, 5].forEach(np => [8192, 65536, 131072].forEach(i => [256, 512].forEach(o => cases.push({ np, input: i, output: o, context: i + o }))));
    const lab = c => `NP${c.np} · ${kn(c.input)} · ${c.output}`;
    const pick = (list, key, label) => `<div class="cmp-pick"><span>${label}</span><div class="st-tabs cmp-tabs">${list.map(([v, t]) => `<button type="button" class="has${v === sel[key] ? " on" : ""}" data-wqsel="${key}" data-v="${v}">${esc(t)}</button>`).join("")}</div></div>`;
    const here = cases.filter(c => c.input === sel.input && c.output === sel.output), b0 = by.bf16 || {};
    // charts: x = NP, one line per precision (Input / Output chosen above)
    const groups = [1, 3, 5].map(np => ({ label: "NP" + np, sub: "", np }));
    const charts = BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups, width: Math.max(320, ($("gvWq").clientWidth || 860) - 100), context: `${kn(sel.input)} in · ${sel.output} out`, rowHead: "NP",
      series: W.filter(w => by[w[0]] && (by[w[0]].rows || []).length).map(w => ({ key: w[0], label: w[0] === "bf16" ? "bf16 (baseline)" : w[1], sum: w[1], color: w[3] })),
      get: (key, g) => { const r = rowOf(key, { np: g.np, input: sel.input, output: sel.output }); return r && r.status === "PASS" && Number.isFinite(r[k]) ? r : null; }, baseline: "bf16", message: "" })));
    const missing = W.filter(w => !by[w[0]] || !(by[w[0]].rows || []).length).map(w => { const x = by[w[0]]; return `<li><b>${esc(w[1])}</b> ${x && x.start_failed ? failHtml(x): NOT}${x && (x.attempts || []).length > 1 ? ` <small class="zhs">${x.attempts.length} attempts · ${x.attempts.length} 次嘗試</small>` : ""}</li>`; }).join("");
    const srv = W.map(w => by[w[0]]).filter(Boolean);
    const srvDl = `<dl class="st-params">${kv("Max model len", num(b0.max_model_len, 0))}${kv("Max num seqs", esc(b0.max_num_seqs || "—"))}${kv("Max batched tokens", `${num(b0.max_num_batched_tokens, 0)} · chunked prefill ${b0.chunked_prefill ? "ON" : "OFF"}`)}${kv("Prefix cache <small class=\"zhs\">前綴快取</small>", b0.prefix_caching ? "ON" : "OFF")}${kv("GPU memory share <small class=\"zhs\">記憶體比例</small>", esc(b0.gpu_memory_utilization || "—"))}${kv("Execution mode <small class=\"zhs\">執行模式</small>", "Eager (--enforce-eager)")}</dl>`;
    const byW = srv.map(w => { const st = w.status === "COMPLETE" ? `Done 完成 (${(w.rows || []).filter(r => r.status === "PASS").length}/${cases.length})` : w.status === "PARTIAL" ? `Partial 部分 (${(w.rows || []).length}/${cases.length})` : w.start_failed ? `<span title="${esc(String(w.start_error).replace(/~\//g, ""))}">Failed to start 無法啟動 · ${why(w.start_error, (w.attempts || []).length)}</span>` : "not run yet 未測";
      return kv(`${esc(w.label[0])} <small class="zhs">${esc(w.label[1])}</small>`, `${esc(w.model)}<br><small>vLLM extra args: ${esc((w.extra_vllm_args || []).join(" ") || "—")}</small><br><small>KV cache capacity: ${w.kv_cache_tokens ? num(w.kv_cache_tokens, 0) + " tokens (measured)" : "—"}</small><br><small>${st}</small>`); }).join("");
    const srvTab = `<h3 class="kv-h3">By weight precision<small class="zhs">依權重精度：檢查點 · 額外 vLLM 參數 · KV cache 實測容量 · 狀態</small></h3><dl class="st-params wq-by">${byW}</dl>`;
    $("gvWq").innerHTML = conclusion(cases, rowOf)
      + S("Select conditions", "選擇條件", pick([[8192, "Input 8K"], [65536, "Input 64K"], [131072, "Input 128K"]], "input", 'Input <small class="zhs">輸入</small>') + pick([[256, "Output 256"], [512, "Output 512"]], "output", 'Output <small class="zhs">輸出</small>') + `<p class="kv-fine">NP 1 / 3 / 5 are on the x axis of the charts and in the table.<small class="zhs">NP 1 / 3 / 5 在圖的橫軸與下方表格。</small></p>`)
      + PZ(keyParams({ weights: "bf16 / fp8 / AWQ checkpoints", input: "8K (8,192) / 64K (65,536) / 128K (131,072)", output: "256 / 512 tokens (forced, ignore_eos)", np: "1 / 3 / 5", seqs: b0.max_num_seqs, ctx: "input + output (132,096 max model len)", wlist: W.map(w => w[1]).join(" / ") }), srvDl + srvTab, `<p class="kv-fine">${WQ.generated_at ? "Snapshot " + esc(String(WQ.generated_at).slice(0, 16).replace("T", " ")) : ""} <a class="v2-dl" href="data/benchmark-gb10/AISO_GB10_vLLM_gemma26_weightquant.json" download>Download .JSON</a></p>`)
      + S("TTFT · TPOT · TPS", "四項指標", legend(withData(cases, rowOf)) + `<div id="wqCharts">${charts}</div>`)
      + F("Values by scenario", `逐情境數值（${cases.length} 組）`, cmpTable(cases, rowOf, lab))
;
  }

  function show(v) {
    view = v;
    document.querySelectorAll(".gv-std").forEach(e => { e.hidden = v !== "std"; });
    ["gvSmoke", "gvWq"].forEach(id => { $(id).hidden = (id === "gvSmoke" ? "smoke" : "wq") !== v; });
    $("gvStdCmp").hidden = v !== "std";
    document.querySelectorAll("#gbView button").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.dispatchEvent(new Event("resize"));
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("#gbView button"); if (b) { show(b.dataset.view); return; }
    const s = e.target.closest("[data-wqsel]"); if (s) { sel[s.dataset.wqsel] = Number(s.dataset.v); wq(); }
  });
  /* the Progress block is a fold (closed): one line next to its title, the steps open on hover / click */
  (function () {
    const sec = $("secProgress"); if (!sec) return;
    let tries = 0; const t = setInterval(() => {
      const li = sec.querySelectorAll("#pProgress li"); tries++;
      if (li.length || tries > 20) {
        clearInterval(t); if (!li.length) return;
        const d = [...li].filter(x => /done|✓/i.test(x.className + x.innerText)).length, h = sec.querySelector("header");
        if (h && !h.querySelector(".hv-sum")) h.insertAdjacentHTML("beforeend", `<span class="hv-sum">${d === li.length ? "Finished" : "Running"} ${d}/${li.length}<small class="zhs">${d === li.length ? "已完成" : "進行中"}</small></span>`);
      }
    }, 300);
  })();
  Promise.all([
    fetch("data/benchmark-registry.json", { cache: "no-store" }).then(r => r.json()).then(reg => { const e = (reg.single_machines || []).find(x => x.machine === "gb10"); return e ? fetch(e.file, { cache: "no-store" }).then(r => r.json()) : null; }),
    fetch("data/benchmark-gb10/AISO_GB10_vLLM_gemma26_weightquant.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null))
  ]).then(([ds, wqd]) => {
    DS = ds || { gb10_runs: [] }; WQ = wqd || { weights: [] };
    const dec = r => { r.decode_only_tps = Number.isFinite(r.tpot_ms) && r.tpot_ms > 0 ? 1000 / r.tpot_ms : null; };      // from TPOT only (the platform's old decode_tps field holds the Normalized value: not used)
    (DS.gb10_runs || []).forEach(dec); (WQ.weights || []).forEach(w => (w.rows || []).forEach(dec));
    smoke(); standard(); wq();
    const h = (location.hash || "").slice(1); show(["smoke", "std", "wq"].includes(h) ? h : "wq");
  }).catch(e => { const x = $("stErr"); if (x) x.textContent = "載入失敗：" + e.message; });
})();
if (window.HoverFold) { const m = document.querySelector("main"); if (m) new MutationObserver(() => HoverFold.init(document)).observe(m, { childList: true, subtree: true }); HoverFold.init(document); }
