"use strict";
/* PRO6000 Q4_K_M (llama.cpp) results, GB10-style: Standard (baseline KV f16) and Optimize · KV cache (KV q8_0 / KV q4_0, same conditions).
   Data: data/benchmark-pro6000/AISO_PRO6000_llamacpp_Q4KM_20261123.json (scripts/export_pro6000_q4km.py), median of 3 repeats per case.
   Difference in % is against KV f16 (baseline). Nothing is estimated. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const kn = i => `${Math.round(i / 1024)}K`;
  const MODELS = [["gemma26", "Gemma 4 26B", "#4fd1b0"], ["gemma31", "Gemma 4 31B", "#8f9bff"], ["laguna", "Laguna XS 2.1", "#e0a283"], ["nemotron", "Nemotron 3.5 30B", "#d8c779"]];
  const KVC = { baseline: "#4fd1b0", kv_q8: "#8f9bff", kv_q4: "#e0a283", qat: "#8f9bff", mtp: "#d8c779" };
  const GROUPS = { kv: ["baseline", "kv_q8", "kv_q4"], wt: ["baseline", "qat", "mtp"] }, WTM = ["gemma26", "gemma31"];
  const M = { ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false, d: 2 }, tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false, d: 1 },
    normalized_tps: { short: "TPS (Normalized)", zh: "每請求每秒輸出 token", unit: "tok/s", higher: true, d: 2 }, aggregate_tps: { short: "TPS (Aggregate)", zh: "NP 個請求合計每秒輸出 token", unit: "tok/s", higher: true, d: 2 } };
  const gain = (v, b, hi) => (Number.isFinite(v) && Number.isFinite(b) && b ? 100 * (hi ? v / b - 1 : 1 - v / b) : null);
  const mean = a => { a = a.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const dl = v => (Number.isFinite(v) ? `<span class="wq-d ${v > 0.05 ? "up" : v < -0.05 ? "dn" : ""}">${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%</span>` : "");
  const S = (h, zh, body) => `<section class="report-section kvx"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  const F = (h, zh, body) => `<section class="report-section kvx hv-fold hv-closed"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  let D = null, BYK = {}, view = "std", sel = { input: 4096, model: "gemma26" };
  const row = (k, m, np, i) => ((BYK[k] || {}).rows || []).find(r => r.model === m && r.np === np && r.input === i);
  const mname = m => (MODELS.find(x => x[0] === m) || [0, m])[1];
  const pick = (list, key, label) => `<div class="cmp-pick"><span>${label}</span><div class="st-tabs cmp-tabs">${list.map(([v, t]) => `<button type="button" class="has${String(v) === String(sel[key]) ? " on" : ""}" data-qsel="${key}" data-v="${v}">${esc(t)}</button>`).join("")}</div></div>`;
  const inputs = () => D.protocol.inputs, nps = () => D.protocol.nps;
  const params = () => `<dl class="st-params"><div><dt>Machine <small class="zhs">機器</small></dt><dd>RTX PRO 6000 Blackwell · GPU 1 · 96 GB</dd></div><div><dt>Framework</dt><dd>llama.cpp CUDA (build 11561)</dd></div>
    <div><dt>Weights <small class="zhs">權重</small></dt><dd>${view === "wt" ? "see below" : "Q4_K_M"}</dd></div><div><dt>KV cache type <small class="zhs">KV 型別</small></dt><dd>${view === "kv" ? "f16 (baseline) / q8_0 / q4_0" : "f16"}</dd></div>${view === "wt" ? '<div><dt>Weights <small class="zhs">權重（變數）</small></dt><dd>Q4_K_M (baseline) / QAT Q4_0 / QAT + MTP draft</dd></div>' : ""}
    <div><dt>NP <small class="zhs">並發</small></dt><dd>${nps().join(" / ")}</dd></div><div><dt>Input <small class="zhs">輸入</small></dt><dd>${inputs().map(kn).join(" / ")}</dd></div>
    <div><dt>Output <small class="zhs">輸出</small></dt><dd>1024 tokens</dd></div><div><dt>Repeat <small class="zhs">重複</small></dt><dd>3 runs, median</dd></div>
    <div><dt>Batch / ubatch</dt><dd>1024 / 512</dd></div><div><dt>Context <small class="zhs">上下文</small></dt><dd>18432 / slot</dd></div></dl>`;
  const legend = L => `<p class="wq-leg">${L.map(t => `<span><i style="background:${t[2]}"></i>${esc(t[1])}</span>`).join("")}</p>`;
  const groups = () => nps().map(np => ({ label: "NP" + np, sub: "", np }));
  const width = () => Math.max(320, ($("qBody").clientWidth || 860) - 100);

  function std() {
    const L = MODELS.map(m => [m[0], m[1], m[2]]);
    const base = (BYK.baseline || {}).rows || [], ok = (BYK.baseline.results ? Object.values(BYK.baseline.results).reduce((s, r) => s + r.pass, 0) : base.length);
    const fail = Object.values(BYK.baseline.results || {}).reduce((s, r) => s + r.fail, 0);
    const best = MODELS.map(m => [m[1], Math.max(...base.filter(r => r.model === m[0]).map(r => r.aggregate_tps))]).sort((a, b) => b[1] - a[1]);
    const charts = BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups: groups(), width: width(), context: `${kn(sel.input)} in · 1024 out`, rowHead: "NP",
      series: L.map(t => ({ key: t[0], label: t[1], sum: t[1], color: t[2] })), get: (key, g) => { const r = row("baseline", key, g.np, sel.input); return r && Number.isFinite(r[k]) ? r : null; }, baseline: null, message: "" })));
    const tab = `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead><tr><th>Model<small>模型</small></th><th>NP</th><th>Input</th><th>TTFT s</th><th>TPOT ms</th><th>TPS (Norm.)</th><th>TPS (Agg.)</th></tr></thead><tbody>${base.map(r => `<tr><td>${esc(mname(r.model))}</td><td>${r.np}</td><td>${kn(r.input)}</td><td>${num(r.ttft_s, 2)}</td><td>${num(r.tpot_ms, 1)}</td><td>${num(r.normalized_tps, 2)}</td><td><b>${num(r.aggregate_tps, 1)}</b></td></tr>`).join("")}</tbody></table></div>`;
    return S("Conclusion", "結論", `<p class="kv-big">${ok} / ${ok + fail} cases passed on all 4 models<small>4 個模型 ${ok} / ${ok + fail} 個條件全數通過</small></p>
      <ul class="kv-list">${best.map(b => `<li>${esc(b[0])}<span class="kv-d">peak ${num(b[1], 0)} tok/s<small class="zhs">最高合計吞吐</small></span></li>`).join("")}</ul>`)
      + S("Select conditions", "選擇條件", pick(inputs().map(i => [i, "Input " + kn(i)]), "input", 'Input <small class="zhs">輸入</small>') + `<p class="kv-fine">NP ${nps().join(" / ")} are on the x axis of the charts.<small class="zhs">NP 在圖的橫軸。</small></p>`)
      + S("Parameters", "測試參數", params()) + S("TTFT · TPOT · TPS", "四項指標", legend(L) + `<div>${charts}</div>`) + F("Values by scenario", `逐情境數值（${base.length} 組）`, tab);
  }

  function kv() {
    const g = view === "wt" ? "wt" : "kv", T = D.kv_types.filter(t => GROUPS[g].includes(t.key)).map(t => [t.key, t.label[0], KVC[t.key]]), ML = g === "wt" ? MODELS.filter(x => WTM.includes(x[0])) : MODELS, m = ML.some(x => x[0] === sel.model) ? sel.model : ML[0][0], ins = inputs();
    const line = (name, k, ref) => {
      const ds = []; nps().forEach(np => ins.forEach(i => { const a = row(k, m, np, i), b = row(ref || "baseline", m, np, i); if (a && b) ds.push([gain(a.aggregate_tps, b.aggregate_tps, true), gain(a.ttft_s, b.ttft_s, false), gain(a.tpot_ms, b.tpot_ms, false)]); }));
      return ds.length ? `<li><span class="kv-pill" style="border-color:${KVC[k]};color:${KVC[k]}">${esc(name)}</span><span class="kv-d">TPS ${dl(mean(ds.map(x => x[0])))} · TTFT ${dl(mean(ds.map(x => x[1])))} · TPOT ${dl(mean(ds.map(x => x[2])))}<small class="zhs">${ds.length} 個情境對照 ${ref ? "QAT" : g === "wt" ? "Q4_K_M 基準" : "KV f16"}</small></span></li>` : "";
    };
    const charts = BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups: groups(), width: width(), context: `${mname(m)} · ${kn(sel.input)} in · 1024 out`, rowHead: "NP",
      series: T.map(t => ({ key: t[0], label: t[0] === "baseline" ? "KV f16 (baseline)" : t[1], sum: t[1], color: t[2] })), get: (key, g) => { const r = row(key, m, g.np, sel.input); return r && Number.isFinite(r[k]) ? r : null; }, baseline: "baseline", message: "" })));
    const cs = []; nps().forEach(np => ins.forEach(i => cs.push([np, i])));
    const cols = Object.entries(M);
    const head = `<tr><th rowspan="2">Case<small>情境</small></th>${cols.map(([, x]) => `<th class="l" colspan="3">${x.short}<small>${x.unit}</small></th>`).join("")}</tr><tr>${cols.map(() => T.map(t => `<th><i class="v2-sw" style="background:${t[2]}"></i>${esc(t[1])}</th>`).join("")).join("")}</tr>`;
    const body = cs.map(([np, i]) => `<tr><td>NP${np} · ${kn(i)} · 1024</td>${cols.map(([k, x]) => T.map(t => { const r = row(t[0], m, np, i), b = row("baseline", m, np, i); if (!r) return `<td class="wq-g">—</td>`; return `<td><b>${num(r[k], x.d)}</b>${t[0] !== "baseline" && b ? " " + dl(gain(r[k], b[k], x.higher)) : t[0] === "baseline" ? ' <span class="wq-d">baseline</span>' : ""}</td>`; }).join("")).join("")}</tr>`).join("");
    const concl = g === "wt" ? `<p class="kv-big">QAT, and QAT + MTP, against Q4_K_M (${esc(mname(m))})<small>QAT、QAT + MTP 對照 Q4_K_M 基準（${esc(mname(m))}）</small></p><ul class="kv-list">${line("QAT Q4_0", "qat")}${line("QAT + MTP", "mtp")}${line("MTP alone (vs QAT)", "mtp", "qat")}</ul>
      <p class="kv-fine">+ is better (more TPS, lower TTFT / TPOT). QAT changes the weight file; MTP adds a draft model on top of it, so "MTP alone" is the gain of speculative decoding. MTP draft: community GGUF (magnitudedev), temperature 0, draft length 3.<small class="zhs">+ 表示較好。QAT 換了權重檔；MTP 在其上加草稿模型，所以「MTP 單獨」才是推測解碼本身的增益。MTP 草稿為社群 GGUF，溫度 0，草稿長度 3。</small></p>`
      : `<p class="kv-big">KV q8_0 and KV q4_0 against KV f16 (${esc(mname(m))})<small>KV q8_0、KV q4_0 對照 KV f16（${esc(mname(m))}）</small></p><ul class="kv-list">${line("KV q8_0", "kv_q8")}${line("KV q4_0", "kv_q4")}</ul>
      <p class="kv-fine">+ is better (more TPS, lower TTFT / TPOT). KV quantization mainly saves VRAM; it did not make this machine faster.<small class="zhs">+ 表示較好。KV 量化主要是省顯存，在這台機器上沒有變快。</small></p>`;
    return S("Conclusion", "結論", concl)
      + S("Select conditions", "選擇條件", pick(ML.map(x => [x[0], x[1]]), "model", 'Model <small class="zhs">模型</small>') + pick(ins.map(i => [i, "Input " + kn(i)]), "input", 'Input <small class="zhs">輸入</small>'))
      + S("Parameters", "測試參數", params()) + S("TTFT · TPOT · TPS", "四項指標", legend(T) + `<div>${charts}</div>`)
      + F("Values by scenario", `逐情境數值（${cs.length} 組）`, `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
  }

  function render() {
    $("qBody").innerHTML = view === "kv" || view === "wt" ? kv() : std();
    document.querySelectorAll("#qView button").forEach(b => { const on = b.dataset.view === view; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    if (window.HoverFold) HoverFold.init(document);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("#qView button"); if (b && D) { view = b.dataset.view; render(); return; }
    const s = e.target.closest("[data-qsel]"); if (s && D) { sel[s.dataset.qsel] = s.dataset.qsel === "model" ? s.dataset.v : Number(s.dataset.v); render(); }
  });
  fetch("data/benchmark-pro6000/AISO_PRO6000_llamacpp_Q4KM_20261123.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : Promise.reject())).then(d => {
    D = d; d.kv_types.forEach(t => { BYK[t.key] = t; }); if (location.hash === "#kv") view = "kv"; if (location.hash === "#wt") view = "wt"; render();
  }).catch(() => { $("stErr").textContent = "Data not available. 資料暫時無法顯示。"; });
})();
