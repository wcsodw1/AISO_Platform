"use strict";
/* AMD AI MAX laptops (ROG AI MAX 395, TUF AI MAX 392): llama.cpp Vulkan, Q4_K_M, NP1, imported 2026-08-28 results.
   Data: data/benchmark-consumer-amd/AISO_{ROG395,TUF392}_llamacpp_Q4KM_20260828.json (scripts/ingest_consumer_amd_aug2026.py).
   Machine and Model both have "All": every machine / model side by side at the same Input and Output. Decode TPS = 1000 / TPOT. Nothing is estimated. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const kn = i => `${Math.round(i / 1024)}K`;
  const MACH = [["rog395", "ROG AI MAX 395", "#8f9bff"], ["tuf392", "TUF AI MAX 392", "#e0a283"]];
  const MODELS = [["gemma26", "Gemma 4 26B A4B"], ["gptoss20", "GPT-OSS 20B"]];
  const M = {
    ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false, d: 2 },
    tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false, d: 1 },
    decode_only_tps: { short: "TPS (Decode only)", zh: "純產生速度＝1000÷TPOT，不含首字等待", unit: "tok/s", higher: true, d: 1 },
    aggregate_tps: { short: "TPS (Aggregate = Normalized at NP1)", zh: "每秒輸出 token（含首字等待）", unit: "tok/s", higher: true, d: 1 }
  };
  const mean = a => { a = a.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const gain = (v, b, hi) => (Number.isFinite(v) && Number.isFinite(b) && b ? 100 * (hi ? v / b - 1 : 1 - v / b) : null);
  const pct = v => (v === null ? "—" : `${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
  const S = (h, zh, body) => `<section class="report-section kvx"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  const F = (h, zh, body) => `<section class="report-section kvx hv-fold hv-closed"><header><h2>${h}<span class="zh">${zh}</span></h2></header>${body}</section>`;
  let D = {}, sel = { machine: "all", model: "all" };
  const runs = (mk, model) => ((D[mk] || {}).runs || []).filter(r => !model || r.model === model);
  const mName = k => (MODELS.find(m => m[0] === k) || [0, k])[1];
  const mLab = k => (MACH.find(m => m[0] === k) || [0, k])[1];
  const inputs = () => [...new Set(Object.values(D).flatMap(d => d.runs.map(r => r.input)))].sort((a, b) => a - b);
  const pick = (list, key, label) => `<div class="cmp-pick"><span>${label}</span><div class="st-tabs cmp-tabs">${list.map(([v, t, zh]) => `<button type="button" class="has${v === sel[key] ? " on" : ""}" data-qsel="${key}" data-v="${v}">${esc(t)}${zh ? `<small class="zhs">${esc(zh)}</small>` : ""}</button>`).join("")}</div></div>`;
  const selMach = () => (sel.machine === "all" ? MACH : MACH.filter(m => m[0] === sel.machine));
  const selModels = () => (sel.model === "all" ? MODELS : MODELS.filter(m => m[0] === sel.model));
  const width = () => Math.max(320, ($("qBody").clientWidth || 860) - 100);

  function conclusion() {
    const lines = MODELS.map(([mk, name]) => {
      const a = runs("rog395", mk), b = runs("tuf392", mk), ds = [];
      a.forEach(r => { const t = b.find(x => x.input === r.input); if (t) ds.push([gain(r.decode_only_tps, t.decode_only_tps, true), gain(r.ttft_s, t.ttft_s, false), gain(r.tpot_ms, t.tpot_ms, false)]); });
      return ds.length ? `<li><b>${esc(name)}</b><span class="kv-d">ROG 395 vs TUF 392 · Decode TPS ${pct(mean(ds.map(x => x[0])))} · TTFT ${pct(mean(ds.map(x => x[1])))} · TPOT ${pct(mean(ds.map(x => x[2])))}<small class="zhs">平均 ${ds.length} 種輸入長度</small></span></li>` : "";
    }).join("");
    const notes = `<div class="kv-notes" tabindex="0"><b>Notes<small>備註</small></b><div>
      <p>Windows laptops, NP1 only, Output 300, batch 2048, KV cache f16 (default). Not comparable with the AISO1 / B60 / B70 stress test (other models, Linux, batch 1024, Output 1024).</p>
      <p>ROG 395 ran 32 threads with High Performance + OEM Turbo power and driver 32.0.31035; TUF 392 ran 24 threads with the Performance plan and driver 32.0.22032. The difference between the two machines includes these settings.</p>
      <p>Not run: NP2 and above, Gemma 4 31B, Laguna XS 2.1, Nemotron 3.5, vLLM, SGLang.</p>
      <p>Windows 筆電、只有 NP1、輸出 300、batch 2048，與 AISO1 / B60 / B70 壓力測試條件不同，不可直接比較。ROG 395 與 TUF 392 的差距包含執行緒、電源計畫與驅動版本的不同。</p></div></div>`;
    return `<section class="report-section kvx" style="position:relative">${notes}<header><h2>Conclusion<span class="zh">結論</span></h2></header>
      <p class="kv-big">ROG AI MAX 395 against TUF AI MAX 392 · NP1 · Q4_K_M<small>兩台筆電對照（以 TUF 392 為基準，+ 表示 ROG 395 較好）</small></p><ul class="kv-list">${lines}</ul>
      <p class="kv-fine">Mean over Input 1K to 32K, Output 300.<small class="zhs">六種輸入長度的平均，輸出 300 token。</small></p></section>`;
  }

  /* the model files that were really benchmarked: quantization and the actual file size (David 2026-11-25) */
  function modelsSec() {
    const rows = selModels().map(([mk, name]) => {
      const f = MACH.map(m => ((D[m[0]] || {}).models || []).find(x => x.model === mk)).filter(Boolean), x = f[0];
      if (!x) return "";
      const same = f.length > 1 && f.every(y => y.sha256 === x.sha256);
      return `<tr><td><b>${esc(name)}</b></td><td><b>${esc(x.quant || "—")}</b>${x.quant_variant ? `<small class="zhs">${esc(x.quant_variant)}</small>` : ""}</td><td><b>${num(x.size_gb, 2)} GB</b><small class="zhs">${num(x.size_gib, 2)} GiB</small></td><td>${esc(x.repository)}<small class="zhs">${esc(x.file)}</small></td><td>${f.length > 1 ? (same ? "✓ same file on both" : "✗ differs") : "—"}</td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead><tr><th>Model<small>模型</small></th><th>Quantization<small>量化類型</small></th><th>Size<small>檔案大小</small></th><th>Source file<small>來源檔案</small></th><th>SHA256</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="kv-fine">Size = the GGUF file on disk (1 GB = 10^9 bytes, 1 GiB = 2^30 bytes). KV cache stays f16.<small class="zhs">大小為實際 GGUF 檔案；KV cache 為 f16。</small></p>`;
  }

  function params() {
    const P = k => (D[k] || {}).profile || {}, both = f => MACH.map(m => `${esc(m[1].replace(" AI MAX", ""))}: ${esc(f(P(m[0])) == null ? "—" : f(P(m[0])))}`).join("<br>");
    const same = (f) => MACH.every(m => f(P(m[0])) === f(P(MACH[0][0]))) ? esc(f(P(MACH[0][0])) == null ? "—" : f(P(MACH[0][0]))) : both(f);
    const row = (t, zh, v) => `<div><dt>${t}${zh ? ` <small class="zhs">${zh}</small>` : ""}</dt><dd>${v}</dd></div>`;
    return `<dl class="st-params">${row("Computer", "機器", both(p => p.computer))}${row("CPU", "", same(p => p.cpu))}${row("Framework", "", same(p => `llama.cpp ${p.build.replace("version: ", "")} · ${p.backend}`))}${row("OS", "系統", same(p => p.os))}
      ${row("GPU device", "GPU", both(p => p.vulkan_device))}${row("Weights", "權重", same(p => p.weights))}${row("KV cache type", "KV 型別", same(p => p.kv_cache))}${row("Threads", "執行緒", both(p => p.threads))}
      ${row("Power plan", "電源計畫", both(p => (p.power_plan || "").replace(/^.*GUID:[^(]*/, "").trim()))}${row("AMD driver", "驅動", both(p => p.amd_driver))}${row("Batch / ubatch", "", same(p => `${p.batch} / ${p.ubatch}`))}
      ${row("NP", "並發", "1")}${row("Input", "輸入", inputs().map(kn).join(" / "))}${row("Output", "輸出", same(p => `${p.output_tokens} tokens`))}${row("Repeat", "重複", "3 runs, mean")}${row("Prompt cache", "", same(p => p.prompt_cache))}</dl>`;
  }

  /* one line per chosen combination in ONE chart set (David 2026-11-25: 「395 all 怎麼下面只有一條線 明明兩個 mode 測試」):
     Machine All = a line per machine; Model All = a line per model; both All = a line per machine and model */
  const MCOL = { gemma26: "#4fd1b0", gptoss20: "#d8c779" }, PAL4 = ["#8f9bff", "#e0a283", "#4fd1b0", "#d8c779"];
  function seriesList() {
    const ms = selMach(), mo = selModels(), out = [];
    ms.forEach(m => mo.forEach(([mk, name]) => {
      if (!runs(m[0], mk).length) return;
      const key = m[0] + "/" + mk, only = ms.length > 1 && mo.length === 1 ? m[1] : mo.length > 1 && ms.length === 1 ? name : `${m[1].replace(" AI MAX", "")} · ${name}`;
      out.push({ key, mach: m[0], model: mk, label: only, sum: only, color: ms.length > 1 && mo.length === 1 ? m[2] : mo.length > 1 && ms.length === 1 ? MCOL[mk] : PAL4[out.length % PAL4.length] });
    }));
    return out;
  }
  function charts() {
    const series = seriesList(), groups = inputs().map(i => ({ label: kn(i), sub: i.toLocaleString("en-US"), i })), base = selMach().length > 1 && selModels().length === 1;
    const ctx = `${sel.machine === "all" ? "All machines" : mLab(sel.machine)} · ${sel.model === "all" ? "All models" : mName(sel.model)} · NP1 · Output 300`;
    return BV.blocks(Object.entries(M).map(([k, def]) => ({ k, def, groups, width: width(), context: ctx,
      series: series.map(x => ({ key: x.key, label: x.label + (base && x.mach === "tuf392" ? " (baseline)" : ""), sum: x.sum, color: x.color })),
      get: (key, g) => { const x = series.find(t => t.key === key), r = x && runs(x.mach, x.model).find(y => y.input === g.i); return r && Number.isFinite(r[k]) ? r : null; },
      baseline: base ? "tuf392/" + selModels()[0][0] : null, message: "" })));
  }

  function table() {
    const rows = selMach().flatMap(m => selModels().flatMap(([mk, name]) => runs(m[0], mk).map(r => `<tr><td><i class="v2-sw" style="background:${m[2]}"></i>${esc(m[1])}</td><td>${esc(name)}</td><td>${kn(r.input)}</td>
      <td>${num(r.ttft_s, 2)}</td><td>${num(r.tpot_ms, 1)}</td><td>${num(r.decode_only_tps, 1)}</td><td>${num(r.aggregate_tps, 1)}</td><td>${r.repeats ? r.repeats.aggregate_tps.map(v => num(v, 1)).join(" / ") : "—"}</td></tr>`)));
    return `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc wq-tab"><thead><tr><th>Machine<small>機器</small></th><th>Model<small>模型</small></th><th>Input</th><th>TTFT s</th><th>TPOT ms</th><th>TPS (Decode only)</th><th>TPS (Agg.)</th><th>3 repeats<small>三次</small></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function render() {
    $("qBody").innerHTML = conclusion()
      + S("Select conditions", "選擇條件", pick([["all", "All", "全部"], ...MACH.map(m => [m[0], m[1]])], "machine", 'Machine <small class="zhs">機器</small>') + pick([["all", "All", "全部"], ...MODELS.map(m => [m[0], m[1]])], "model", 'Model <small class="zhs">模型</small>'))
      + S("Models", "模型與量化", modelsSec()) + F("Parameters", "測試參數", params()) + S("TTFT · TPOT · TPS", "四項指標", `<p class="wq-leg">${seriesList().map(x => `<span><i style="background:${x.color}"></i>${esc(x.label)}</span>`).join("")}</p><div>${charts()}</div>`)
      + F("Values by scenario", "逐情境數值", table());
    if (window.HoverFold) HoverFold.init(document);
  }
  document.addEventListener("click", e => { const s = e.target.closest("[data-qsel]"); if (s && Object.keys(D).length) { sel[s.dataset.qsel] = s.dataset.v; render(); } });
  if (/rog395|tuf392/.test(location.hash)) sel.machine = location.hash.replace("#", "");
  Promise.all(MACH.map(m => fetch(`data/benchmark-consumer-amd/AISO_${m[0].toUpperCase()}_llamacpp_Q4KM_20260828.json`, { cache: "no-store" }).then(r => (r.ok ? r.json() : Promise.reject())).then(d => { D[m[0]] = d; })))
    .then(render).catch(() => { $("stErr").textContent = "Data not available. 資料暫時無法顯示。"; });
})();
