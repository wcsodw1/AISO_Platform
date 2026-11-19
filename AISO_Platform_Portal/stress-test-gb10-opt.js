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
  const key = r => `${r.np}|${r.input}|${r.output}`;
  const REPORTS = [["GB10_GB10_MTP_QAT_and_NVFP4_KV_variants_20261119.md", "MTP, QAT and NVFP4 KV variants", "MTP、QAT 與 NVFP4 KV 變體（整合報告）"],
    ["GB10_GB10_MTP_on_NVFP4_weights_with_NVFP4_KV_20261119.md", "MTP on NVFP4 weights with NVFP4 KV", "NVFP4 權重 + NVFP4 KV 開 MTP"],
    ["GB10_GB10_NVFP4_weights_with_NVFP4_KV_cache_20261119.md", "NVFP4 weights with NVFP4 KV cache", "NVFP4 權重 + NVFP4 KV cache"]];
  let V = null, WQ = null;

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
  function render() {
    const vs = ((V && V.variants) || []).filter(v => (v.rows || []).length);
    const reports = `<ul class="gb-reports">${REPORTS.map(([file, en, zh]) => `<li><a class="v2-dl" href="data/reports/${file}" target="_blank" rel="noopener">${esc(en)}<small class="zhs">${esc(zh)}</small></a> <a class="v2-dl" href="data/reports/${file}" download>↓ .md</a></li>`).join("")}</ul>`;
    $("gvOpt").innerHTML = S("MTP · QAT · NVFP4 KV", "MTP、QAT 與 NVFP4 KV", vs.length ? summary(vs) : `<p class="v2-fine">No data yet. 尚無資料。</p>`)
      + S("Values by variant", "逐變體數值", vs.map(detail).join(""))
      + S("Benchmark Result reports", "測試報告（可下載）", reports + `<p class="v2-fine"><a class="v2-dl" href="data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json" download>Download .JSON</a></p>`);
  }
  document.addEventListener("click", e => {
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
