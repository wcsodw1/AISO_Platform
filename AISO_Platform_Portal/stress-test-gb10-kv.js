"use strict";
/* GB10 results page, 4th view: KV cache type - KV full precision (auto) against KV fp8, same conditions (bf16 weights,
   NP 1/3/5 x Input 8K/64K/128K x Output 256/512). Data: data/benchmark-gb10/AISO_GB10_vLLM_gemma26_kvdtype.json (scripts/export_gb10_kvdtype.py).
   Difference in % is against KV fp8 (the type every other GB10 test uses). Nothing is estimated; a case above the KV capacity is flagged, not hidden. */
(function () {
  const START_HASH = location.hash;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const kn = i => `${Math.round(i / 1024)}K`;
  const T = [["fp8", "KV fp8", "KV fp8（8 位元）", "#4fd1b0"], ["auto", "KV full precision", "KV 全精度（auto）", "#8f9bff"]];
  const M = { ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false, d: 2 }, tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false, d: 1 },
    decode_only_tps: { short: "TPS (Decode only)", zh: "純產生速度（不含首字等待）= 1000 ÷ TPOT，每請求", unit: "tok/s", higher: true, d: 1 },
    normalized_tps: { short: "TPS (Normalized)", zh: "每請求每秒輸出 token", unit: "tok/s", higher: true, d: 2 }, aggregate_tps: { short: "TPS (Aggregate)", zh: "NP 個請求合計每秒輸出 token", unit: "tok/s", higher: true, d: 2 } };
  const gain = (v, b, hi) => (Number.isFinite(v) && Number.isFinite(b) && b ? 100 * (hi ? v / b - 1 : 1 - v / b) : null);
  const mean = a => { a = a.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const dl = v => (Number.isFinite(v) ? `<span class="wq-d ${v > 0.05 ? "up" : v < -0.05 ? "dn" : ""}">${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%</span>` : "");
  const S = (h, zh, body) => `<section class="report-section kvx"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  const F = (h, zh, body) => `<section class="report-section kvx hv-fold hv-closed"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  let KV = null, BYK = {}, sel = { input: 8192, output: 256 };
  const lab = c => `NP${c.np} · ${kn(c.input)} · ${c.output}`;
  const rowOf = (k, c) => { const t = BYK[k]; return t ? (t.rows || []).find(r => r.np === c.np && r.input === c.input && r.output === c.output) : null; };
  const cases = () => { const o = []; ((KV.protocol || {}).nps || [1, 3, 5]).forEach(np => ((KV.protocol || {}).inputs || [8192, 65536, 131072]).forEach(i => ((KV.protocol || {}).outputs || [256, 512]).forEach(x => o.push({ np, input: i, output: x })))); return o; };
  const both = c => { const a = rowOf("auto", c), b = rowOf("fp8", c); return a && b && a.status === "PASS" && b.status === "PASS" ? [a, b] : null; };

  function conclusion(cs) {
    const line = (name, list) => {
      const ds = list.map(both).filter(Boolean).map(([a, b]) => [gain(a.aggregate_tps, b.aggregate_tps, true), gain(a.ttft_s, b.ttft_s, false), gain(a.tpot_ms, b.tpot_ms, false)]);
      if (!ds.length) return "";
      return `<li><span class="kv-pill" style="border-color:${T[1][3]};color:${T[1][3]}">${esc(name)}</span><span class="kv-d">TPS ${dl(mean(ds.map(x => x[0])))} · TTFT ${dl(mean(ds.map(x => x[1])))} · TPOT ${dl(mean(ds.map(x => x[2])))}<small class="zhs">${ds.length} / ${list.length} 個情境對照 KV fp8</small></span></li>`;
    };
    const ins = [...new Set(cs.map(c => c.input))].sort((a, b) => a - b);
    const lines = ins.map(i => line("Input " + kn(i), cs.filter(c => c.input === i))).join("");
    const sa = (BYK.auto || {}).servers || {}, sf = (BYK.fp8 || {}).servers || {}, ka = (sa.ryan || {}).kv_cache_tokens, kf = (sf.ryan || {}).kv_cache_tokens;
    const cap = ka && kf ? `<p class="kv-fine">KV capacity: full precision holds ${num(ka, 0)} tokens, fp8 holds ${num(kf, 0)} (${Math.round(100 * ka / kf)}%).<small class="zhs">KV cache 容量：全精度 ${num(ka, 0)} tokens，fp8 ${num(kf, 0)}（約 ${Math.round(100 * ka / kf)}%）。</small></p>` : "";
    return S("Conclusion", "結論", `<p class="kv-big">KV full precision against KV fp8 (bf16 weights)<small>KV 全精度對照 KV fp8（權重 bf16）</small></p><ul class="kv-list">${lines}</ul>${cap}
      <p class="kv-fine">+ is better (more TPS, lower TTFT / TPOT) for full precision. Longer input, bigger gap. TPOT is measured by the client (an estimate); TPS (Decode only) is 1000 ÷ TPOT per request.<small class="zhs">+ 表示全精度較好；輸入越長差距越大。TPOT 為用戶端量到的估計值；Decode TPS 是它的倒數（每請求，不含首字等待）。</small></p>`);
  }
  const pick = (list, key, label) => `<div class="cmp-pick"><span>${label}</span><div class="st-tabs cmp-tabs">${list.map(([v, t]) => `<button type="button" class="has${v === sel[key] ? " on" : ""}" data-kvsel="${key}" data-v="${v}">${esc(t)}</button>`).join("")}</div></div>`;
  const legend = () => `<p class="wq-leg">${T.map(t => `<span><i style="background:${t[3]}"></i>${esc(t[1])}</span>`).join("")}</p>`;
  function table(cs) {
    const cols = Object.entries(M);
    const head = `<tr><th rowspan="2">Case<small>情境</small></th>${cols.map(([, m]) => `<th class="l" colspan="2">${m.short}<small>${m.unit}</small></th>`).join("")}</tr><tr>${cols.map(() => T.map(t => `<th><i class="v2-sw" style="background:${t[3]}"></i>${esc(t[1])}</th>`).join("")).join("")}</tr>`;
    const body = cs.map(c => `<tr><td>${lab(c)}${["auto", "fp8"].some(k => (rowOf(k, c) || {}).kv_tight) ? ' <span class="wq-fail" title="The tokens needed were above the KV capacity; vLLM queued the requests and the case still finished.">⚠</span>' : ""}</td>${cols.map(([k, m]) => T.map(t => {
      const r = rowOf(t[0], c), b = rowOf("fp8", c);
      if (!r) return `<td class="wq-g"><span class="wq-not">not run yet<small class="zhs">未測</small></span></td>`;
      if (r.status !== "PASS") return `<td class="wq-f" title="${esc(r.error || "")}"><b>FAIL</b></td>`;
      return `<td><b>${num(r[k], m.d)}</b>${t[0] === "auto" && b && b.status === "PASS" ? " " + dl(gain(r[k], b[k], m.higher)) : t[0] === "fp8" ? ' <span class="wq-d">baseline</span>' : ""}</td>`;
    }).join("")).join("")}</tr>`).join("");
    return `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function render() {
    const cs = cases(), p = KV.protocol || {};
    const groups = (p.nps || [1, 3, 5]).map(np => ({ label: "NP" + np, sub: "", np }));
    const charts = BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups, width: Math.max(320, ($("gvKv").clientWidth || 860) - 100), context: `${kn(sel.input)} in · ${sel.output} out`, rowHead: "NP",
      series: T.map(t => ({ key: t[0], label: t[0] === "fp8" ? "KV fp8 (baseline)" : t[1], sum: t[1], color: t[3] })),
      get: (key, g) => { const r = rowOf(key, { np: g.np, input: sel.input, output: sel.output }); return r && r.status === "PASS" && Number.isFinite(r[k]) ? r : null; }, baseline: "fp8", message: "" })));
    const sv = k => (BYK[k] || {}).servers || {};
    const capRow = (name, k) => `<div><dt>${name}</dt><dd>${[["in8k", "8K runs"], ["ryan", "64K / 128K runs"]].map(([s, l]) => sv(k)[s] ? `${num(sv(k)[s].kv_cache_tokens, 0)} tokens <small>(${l})</small>` : "").filter(Boolean).join("<br>")}</dd></div>`;
    const tight = cs.filter(c => ["auto", "fp8"].some(k => (rowOf(k, c) || {}).kv_tight));
    const notes = tight.length ? F("Notes", "備註", `<ul class="kv-list">${tight.map(c => `<li>${esc(lab(c))}<span class="kv-d">full precision: tokens needed were above the KV capacity, vLLM queued the requests and the case still finished.<small class="zhs">全精度：需要的 token 數超過 KV 容量，vLLM 排隊處理，仍跑完。</small></span></li>`).join("")}</ul>`) : "";
    $("gvKv").innerHTML = conclusion(cs)
      + S("Select conditions", "選擇條件", pick([[8192, "Input 8K"], [65536, "Input 64K"], [131072, "Input 128K"]], "input", 'Input <small class="zhs">輸入</small>') + pick([[256, "Output 256"], [512, "Output 512"]], "output", 'Output <small class="zhs">輸出</small>') + `<p class="kv-fine">NP 1 / 3 / 5 are on the x axis of the charts and in the table.<small class="zhs">NP 1 / 3 / 5 在圖的橫軸與下方表格。</small></p>`)
      + S("TTFT · TPOT · TPS", "四項指標", legend() + `<div id="kvCharts">${charts}</div>`)
      + F("Values by scenario", `逐情境數值（${cs.length} 組）`, table(cs))
      + S("Parameters", "測試參數", `<dl class="st-params"><div><dt>Weights <small class="zhs">權重</small></dt><dd>bf16 (not quantized)</dd></div><div><dt>KV cache type <small class="zhs">KV cache 型別</small></dt><dd>fp8 / full precision (auto)</dd></div><div><dt>NP <small class="zhs">並發</small></dt><dd>1 / 3 / 5</dd></div>
        <div><dt>Input <small class="zhs">輸入</small></dt><dd>8K / 64K / 128K</dd></div><div><dt>Output <small class="zhs">輸出</small></dt><dd>256 / 512 tokens</dd></div><div><dt>Repeat <small class="zhs">重複</small></dt><dd>1 run per case, not averaged</dd></div>
        ${capRow('KV capacity · fp8 <small class="zhs">KV 容量</small>', "fp8")}${capRow('KV capacity · full precision <small class="zhs">KV 容量</small>', "auto")}</dl>`)
      + notes;
    if (window.HoverFold) HoverFold.init(document);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("#gbView button");
    if (b) { const kvOn = b.dataset.view === "kv"; $("gvKv").hidden = !kvOn; if (kvOn) { ["gvSmoke", "gvWq", "gvStdCmp"].forEach(id => { const x = $(id); if (x) x.hidden = true; }); document.querySelectorAll(".gv-std").forEach(x => { x.hidden = true; }); if (KV) render(); window.dispatchEvent(new Event("resize")); } return; }
    const s = e.target.closest("[data-kvsel]"); if (s && KV) { sel[s.dataset.kvsel] = Number(s.dataset.v); render(); }
  });
  fetch("data/benchmark-gb10/AISO_GB10_vLLM_gemma26_kvdtype.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return;
    KV = d; (d.kv_types || []).forEach(t => { BYK[t.key] = t; (t.rows || []).forEach(r => { r.decode_only_tps = Number.isFinite(r.tpot_ms) && r.tpot_ms > 0 ? 1000 / r.tpot_ms : null; }); });
    const nav = $("gbView"); if (!nav || nav.querySelector('[data-view="kv"]')) return;
    nav.insertAdjacentHTML("beforeend", '<button type="button" role="tab" data-view="kv" aria-selected="false">KV cache<small>KV 型別</small></button>');
    if (START_HASH === "#kv") { let n = 0; const t = setInterval(() => { n++; const w = $("gvWq"); if ((w && w.innerHTML.trim()) || n > 40) { clearInterval(t); nav.querySelector('[data-view="kv"]').click(); } }, 150); }
  }).catch(() => {});
})();
