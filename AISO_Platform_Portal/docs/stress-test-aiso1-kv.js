"use strict";
/* AISO1 page, second view "KV cache quantization" (David 2026-11-18): the KV cache test results next to the Standard test, every KV precision against f16 of the SAME campaign
   (same machine, same settings - a like-for-like comparison). Charts are the shared BV line charts, f16 is the baseline, so each chart says how much better / worse a precision is.
   Data: on this computer the live answer of /api/benchmark/kvcache/status (fills in while the test runs); elsewhere the snapshot data/benchmark-aiso1/AISO_AISO1_llamacpp_KVcache_B1024.json. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MODELS = [["gemma26", "Gemma 4 26B"], ["gemma31", "Gemma 4 31B"], ["laguna", "Laguna XS 2.1"], ["nemotron", "Nemotron 3.5 30B"]];
  const mName = k => (MODELS.find(m => m[0] === k) || [k, k])[1];
  const KVS = ["f16", "bf16", "f32", "f8_e4m3", "q8_0", "q5_0", "q5_1", "q4_0", "q4_1", "iq4_nl"];
  const QUANT = ["q8_0", "q5_0", "q5_1", "q4_0", "q4_1", "iq4_nl"];
  const COL = { f16: "#8f9bff", bf16: "#e0a040", f32: "#6fdc9a", f8_e4m3: "#bbbbbb", q8_0: "#e07a8f", q5_0: "#5cc8d6", q5_1: "#c58fff", q4_0: "#f0d060", q4_1: "#ff9966", iq4_nl: "#9fd36a" };
  const METRICS = {
    ttft_s: { short: "TTFT", zh: "首字延遲", unit: "s", higher: false },
    tpot_ms: { short: "TPOT", zh: "每個字的間隔", unit: "ms/token", higher: false },
    decode_only_tps: { short: "TPS (Decode only)", zh: "平均每秒產生幾個字（每個請求，不含首字等待）", unit: "tok/s", higher: true },
    norm_tps: { short: "TPS (Normalized)", zh: "每請求每秒輸出 token", unit: "tok/s", higher: true },
    aggregate_tps: { short: "TPS (Aggregate)", zh: "NP 個請求合計每秒輸出 token", unit: "tok/s", higher: true }
  };
  const SNAPSHOT = "data/benchmark-aiso1/AISO_AISO1_llamacpp_KVcache_B1024.json";
  let D = null, MODEL = "all", NP = 1, INPUT = 4096, built = false;
  const NPS = [1, 2, 4, 8], INPUTS = [4096, 8192, 16384], OUT = 1024;
  const faOf = np => (np === 8 ? "on" : "off");      // NP8 is its own campaign with Flash Attention on (f16 / q8_0 / q4_0); NP1/2/4 run with it off
  const n = v => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
  const kn = i => `${i / 1024}K`;

  /* the live status answer -> the same shape as the snapshot file */
  function fromStatus(st) {
    const rows = [], smoke = [], smoke8 = [], types = new Set(), byNp = {};
    ["np1", "np24", "np8fa"].forEach(stage => {
      const c = (st.stages && st.stages[stage] && st.stages[stage].campaign) || null;
      if (!c) return;
      (c.kv_types || []).forEach(t => types.add(t));
      (stage === "np1" ? [1] : stage === "np24" ? [2, 4] : [8]).forEach(np => { byNp[np] = c.kv_types || []; });      // the precisions PLANNED for this NP (found by its preflight), not only those with numbers so far
      (c.smoke || []).forEach(r => { if (stage === "np1") smoke.push({ kv: r.kv_cache_k, model: r.model, status: r.status }); else if (stage === "np8fa") smoke8.push({ kv: r.kv_cache_k, model: r.model, status: r.status }); });
      Object.entries(c.results || {}).forEach(([np, list]) => (list || []).forEach(r => {
        if (r.status !== "PASS") return;
        rows.push({ np: Number(np.slice(2)), kv: r.kv_cache_k, model: r.model, input: Number(r.input_tokens), ttft_s: n(r.ttft_ms) === null ? null : n(r.ttft_ms) / 1000, tpot_ms: n(r.tpot_ms), aggregate_tps: n(r.tps_aggregate), norm_tps: n(r.tps_normalized) });
      }));
    });
    /* NP8 smoke is written to its table only when the smoke step ends; while it runs, take the live KV_SMOKE lines of the log */
    if (!smoke8.length && st.busy && /platform_kvcache_np8fa_/.test(st.log || "")) ((st.progress || {}).smoke || []).forEach(x => smoke8.push({ kv: x.kv, model: x.model, status: x.status }));
    return { rows, smoke, smoke_np8: smoke8, kv_types: [...types], kv_by_np: byNp, running: !!st.busy, live: true };
  }
  async function load() {
    try {
      const r = await fetch("/api/benchmark/kvcache/status", { cache: "no-store" });
      if (r.ok) { const st = await r.json(); if (st && st.ok) return fromStatus(st); }
    } catch (e) { /* not on this computer: use the snapshot */ }
    try { const r = await fetch(SNAPSHOT, { cache: "no-store" }); if (r.ok) return { ...(await r.json()), live: false }; } catch (e) { /* none yet */ }
    return null;
  }

  const smokeOf = () => (NP === 8 ? D.smoke_np8 : D.smoke) || [];
  const has = (m, np) => D.rows.some(r => (!m || r.model === m) && (!np || r.np === np));
  const rowsOf = () => D.rows.filter(r => (MODEL === "all" || r.model === MODEL) && r.np === NP);      // MODEL "all" = every model at once (David 2026-11-18)
  const mm = () => (MODEL === "all" ? null : MODEL);
  const mean = a => { a = a.filter(x => x !== null && isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const gain = (v, b, hi) => (v === null || b === null || !b ? null : hi ? (v / b - 1) * 100 : (1 - v / b) * 100);
  const pct = v => (v === null ? "—" : `${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);

  /* conclusion (David 2026-11-18): same Input and Output for every precision - for every model of this NP, the best precision against f16 at the chosen Input */
  function conclusion() {
    const lines = [];
    MODELS.forEach(([m]) => {
      const rs = D.rows.filter(r => r.model === m && r.np === NP && r.input === INPUT), base = rs.filter(r => r.kv === "f16");
      if (!rs.length) return;
      const per = {};
      rs.filter(r => r.kv !== "f16").forEach(r => { const b = base.find(x => x.input === r.input); if (b) (per[r.kv] = per[r.kv] || []).push([gain(r.aggregate_tps, b.aggregate_tps, true), gain(r.ttft_s, b.ttft_s, false), gain(r.tpot_ms, b.tpot_ms, false)]); });
      const best = Object.entries(per).map(([kv, a]) => ({ kv, tps: mean(a.map(x => x[0])), ttft: mean(a.map(x => x[1])), tpot: mean(a.map(x => x[2])) })).filter(x => x.tps !== null).sort((a, b) => b.tps - a.tps)[0];
      lines.push(best && best.tps < 0
        ? `<li><b>${esc(mName(m))}</b><span class="kv-pill" style="border-color:${COL.f16};color:${COL.f16}">f16</span><span class="kv-d">fastest · best other: ${esc(best.kv)} TPS ${pct(best.tps)} · TTFT ${pct(best.ttft)} · TPOT ${pct(best.tpot)}<small class="zhs">f16 最快；其他最佳為 ${esc(best.kv)}</small></span></li>`
        : best
        ? `<li><b>${esc(mName(m))}</b><span class="kv-pill" style="border-color:${COL[best.kv]};color:${COL[best.kv]}">${esc(best.kv)}</span><span class="kv-d">TPS ${pct(best.tps)} · TTFT ${pct(best.ttft)} · TPOT ${pct(best.tpot)}</span></li>`
        : `<li><b>${esc(mName(m))}</b><span class="kv-d">f16 only so far · 目前只有 f16</span></li>`);
    });
    const quantFail = NP !== 8 && D.smoke.length && QUANT.every(q => D.smoke.filter(r => r.kv === q).every(r => r.status !== "PASS"));
    const notes = quantFail ? `<div class="kv-notes" tabindex="0"><b>Notes<small>備註</small></b><div><p>Quantized KV (q8_0, q5_0, q5_1, q4_0, q4_1, iq4_nl) cannot start in this test: all 24 cases stop with "quantized V cache requires flash_attn" (checked in every server log). This test keeps Flash Attention off, the same as the original AISO1 F16 results. It is a setting, not a hardware limit.</p><p>量化 KV 在這一輪無法啟動：24 組全部是「量化 V cache 需要 Flash Attention」（已逐一查 server.log）。這一輪為了和原本 AISO1 F16 成績同條件，Flash Attention 是關的；這是設定問題，不是硬體不支援。</p></div></div>` : "";
    const run = D.live && D.running ? `<p class="kv-run">● Test running: cases appear here as they finish<small>測試進行中，完成的情境會陸續出現</small></p>` : "";
    $("kvConcl").innerHTML = `${notes}<header><h2>Conclusion<span class="zh">結論</span></h2></header>${run}
      ${lines.length ? `<p class="kv-big">Best KV precision per model · Input ${kn(INPUT)} · Output ${OUT} · NP${NP}<small>各模型最佳 KV 精度（同輸入 ${kn(INPUT)}、同輸出 ${OUT}，對照 f16）</small></p><ul class="kv-list">${lines.join("")}</ul><p class="kv-fine">Every precision gets the same ${INPUT.toLocaleString("en-US")}-token input and ${OUT}-token output; + is better (more TPS, lower TTFT / TPOT).<small>每種精度都是相同輸入與輸出 token；+ 代表較好。</small></p>` : `<p class="kv-big">No finished cases at Input ${kn(INPUT)} · NP${NP} yet<small>這個輸入長度還沒有完成的情境</small></p>`}`;
  }

  function btn(group, items, cur) {
    return items.map(([k, label, ok, sub]) => `<button type="button" role="tab" class="${String(k) === String(cur) ? "on" : ""}${ok ? " has" : ""}" aria-selected="${String(k) === String(cur)}" data-kvg="${group}" data-k="${k}"${ok ? "" : " disabled"}>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`).join("");
  }
  function pick() {
    if (MODEL !== "all" && !has(MODEL, NP)) { const f = MODELS.find(([m]) => has(m, NP)) || MODELS.find(([m]) => has(m)); if (f) MODEL = f[0]; }
    if (!has(mm(), NP)) { const np = NPS.find(x => has(mm(), x)); if (np) NP = np; }
    const hasIn = i => rowsOf().some(r => r.input === i);
    if (!hasIn(INPUT)) { const i = INPUTS.find(hasIn); if (i) INPUT = i; }
    $("kvModel").innerHTML = btn("m", [["all", "All models", has(null, NP), "全部模型"], ...MODELS.map(([m, l]) => [m, l, has(m, NP)])], MODEL);
    $("kvNp").innerHTML = btn("np", NPS.map(x => [x, "NP" + x, has(mm(), x), has(mm(), x) ? (x === 8 ? "Flash Attention on · 開 FA" : "") : "not run yet · 未測"]), NP);
    $("kvInput").innerHTML = btn("in", INPUTS.map(i => [i, kn(i), hasIn(i), `${i.toLocaleString("en-US")} in · ${OUT} out`]), INPUT);
  }

  /* the main view (David 2026-11-18: 「比較同樣的 input token 以及 output token，不同精度速度的差異」): one Input, one Output, every precision side by side against f16 */
  function same() {
    const all = rowsOf().filter(r => r.input === INPUT), cols = ["ttft_s", "tpot_ms", "decode_only_tps", "aggregate_tps", "norm_tps"];
    if (!all.length) { $("kvSame").innerHTML = `<p class="v2-fine st-empty">No data for Input ${kn(INPUT)} yet.<small class="zhs">這個輸入長度還沒有資料。</small></p>`; return; }
    const groupRows = (rs, ncol) => {
      const kvs = KVS.filter(k => rs.some(r => r.kv === k)), base = rs.find(r => r.kv === "f16"), top = Math.max(...rs.map(r => n(r.aggregate_tps) || 0));
      const cell = (r, k) => {
        const v = n(r[k]); if (v === null) return `<td class="na">—</td>`;
        const d = base && r.kv !== "f16" && n(base[k]) ? BV.pct(BV.gain(v, n(base[k]), METRICS[k].higher)) : r.kv === "f16" ? `<span class="v2-d flat">baseline</span>` : "";
        const bar = k === "aggregate_tps" && top ? `<i class="kv-bar" style="width:${(v / top * 100).toFixed(1)}%;background:${COL[r.kv]}"></i>` : "";
        return `<td><b>${BV.fmt(k, v)}</b>${d}${bar}</td>`;
      };
      return kvs.map(kv => { const r = rs.find(x => x.kv === kv); return `<tr><th><i class="v2-sw" style="background:${COL[kv]}"></i>${esc(kv)}</th>${cols.map(k => cell(r, k)).join("")}</tr>`; }).join("")
        + (base ? "" : `<tr><td colspan="${ncol}" class="na">f16 not finished here: no baseline yet · f16 尚未完成，暫無基準</td></tr>`);
    };
    const body = MODEL === "all"
      ? MODELS.filter(([m]) => all.some(r => r.model === m)).map(([m, l]) => `<tr class="kv-mrow"><th colspan="${cols.length + 1}">${esc(l)}</th></tr>${groupRows(all.filter(r => r.model === m), cols.length + 1)}`).join("")
      : groupRows(all, cols.length + 1);
    $("kvSame").innerHTML = `<p class="kv-sub">${MODEL === "all" ? "All models" : esc(mName(MODEL))} · NP${NP} · Input ${INPUT.toLocaleString("en-US")} · Output ${OUT} · Flash Attention ${faOf(NP)}<small class="zhs">${MODEL === "all" ? "全部模型，" : ""}同並發、同輸入與輸出 token，只換 KV 精度</small></p>
      <div class="table-wrap"><table class="v2-table kv-same"><thead><tr><th>KV<small>精度</small></th>${cols.map(k => `<th>${esc(METRICS[k].short)} <span class="kv-dir">${METRICS[k].higher ? "↑" : "↓"}</span><small>${esc(METRICS[k].zh)} · ${esc(METRICS[k].unit)}</small></th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function metrics() {
    const rs = rowsOf();
    if (!rs.length) { $("kvMetrics").innerHTML = `<p class="v2-fine st-empty">No data for this model and NP yet.<small class="zhs">這個模型與 NP 還沒有資料。</small></p>`; return; }
    const w = Math.max(320, ($("kvMetrics").clientWidth || 860) - 100);
    const one = (rm, m) => {
      const kvs = KVS.filter(k => rm.some(r => r.kv === k)), groups = [...new Set(rm.map(r => r.input))].sort((a, b) => a - b).map(i => ({ label: kn(i), sub: i.toLocaleString("en-US"), i }));
      return BV.blocks(Object.entries(METRICS).map(([k, def]) => ({
        k, def, groups, width: w, context: `${mName(m)} · NP${NP}`,
        series: kvs.map(kv => ({ key: kv, label: kv === "f16" ? "f16 (baseline)" : kv, sum: kv, color: COL[kv] })),
        get: (kv, g) => { const x = rm.find(r => r.kv === kv && r.input === g.i); return x && isFinite(x[k]) && x[k] !== null ? x : null; },
        baseline: kvs.includes("f16") ? "f16" : null,
        message: kvs.includes("f16") ? "" : "f16 not finished yet: no baseline to compare · f16 尚未完成，無法比較"
      })));
    };
    $("kvMetrics").innerHTML = MODEL === "all"
      ? MODELS.filter(([m]) => rs.some(r => r.model === m)).map(([m, l]) => `<h3 class="kv-mh">${esc(l)}</h3>${one(rs.filter(r => r.model === m), m)}`).join("")
      : one(rs, MODEL);
  }

  function smoke() {
    const sm = smokeOf();
    if (!sm.length) { $("kvSmoke").hidden = true; return; }
    $("kvSmoke").hidden = false;
    const by = {}; sm.forEach(r => { by[r.kv + "/" + r.model] = r.status; });
    const kvRows = NP === 8 ? KVS.filter(k => ["f16", "q8_0", "q4_0"].includes(k)) : KVS;
    const cls = s => (s === "PASS" ? "ok" : !s || s === "PENDING" ? "wait" : "bad"), lab = s => (s === "UNSUPPORTED_FLAGS" ? "n/a" : s || "—");
    $("kvSmoke").innerHTML = `<header><h2>Which precisions start<span class="zh">哪些精度能啟動（冒煙測試）</span></h2></header>
      <div class="table-wrap"><table class="v2-table kv-smoke"><thead><tr><th>KV</th>${MODELS.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${kvRows.map(k => `<tr><th><i class="v2-sw" style="background:${COL[k]}"></i>${esc(k)}</th>${MODELS.map(([m]) => { const s = by[k + "/" + m]; return `<td class="${cls(s)}">${esc(lab(s))}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="v2-fine">n/a = this llama.cpp build does not list the type · FAIL = listed, but the model server did not start<small class="zhs">n/a＝此版本沒有此型別；FAIL＝有列出但模型伺服器無法啟動</small></p>`;
    $("kvSmoke").hidden = false;
  }

  function data() {
    const src = D.live ? "Live from AISO1 (this computer)<small class=\"zhs\">即時讀取 AISO1（本機）</small>" : `Snapshot${D.generated_at ? " · " + esc(String(D.generated_at).slice(0, 16).replace("T", " ")) : ""}<small class="zhs">資料快照</small>`;
    $("kvData").innerHTML = `<header><h2>Data<span class="zh">KV cache 資料</span></h2><a class="v2-dl" href="${SNAPSHOT}" download>Download .JSON</a></header>
      <p class="v2-fine">${src} · llama.cpp (Vulkan) · K = V · Batch 1024 · Ubatch 512 · 18432 / slot · Flash Attention ${faOf(NP)} · Output ${OUT} · 3 repeats<small class="zhs">每個數值都是 3 次重複全部通過的平均；f16 是同一輪的基準</small></p>`;
  }

  /* the optimization test plan (data/benchmark-aiso1/aiso1_optimization_plan.json): folded, one line per method, its state */
  async function plan() {
    let p = null;
    try { const r = await fetch("data/benchmark-aiso1/aiso1_optimization_plan.json", { cache: "no-store" }); if (r.ok) p = await r.json(); } catch (e) { /* no plan file */ }
    if (!p) { $("kvPlan").hidden = true; return; }
    const LV = { must: ["Must", "必用"], recommended: ["Recommended", "推薦"], try: ["Try", "可嘗試"] }, ST = { running: ["Running", "進行中"], next: ["Next", "下一步"], todo: ["Not started", "未開始"], done: ["Done", "完成"] };
    $("kvPlan").innerHTML = `<details class="kv-plan"><summary><h2>Optimization tests<span class="zh">AISO1 優化測試清單 · ${p.items.length} 項</span></h2></summary>
      <p class="kv-fine">${esc(p.order)}<small>先核對 GPU 卸載與失敗日誌 → F16 測 Flash Attention on/off → 同一 FA 設定下比各 KV 精度；一次只改一個變數</small></p>
      <div class="table-wrap"><table class="v2-table kv-plan-t"><thead><tr><th>#</th><th>Method<small>方法</small></th><th>Now<small>AISO1 現況</small></th><th>Watch<small>觀察</small></th><th>State<small>狀態</small></th></tr></thead><tbody>
      ${p.items.map(x => `<tr class="lv-${esc(x.level)}"><td>${x.n}<small>${esc(LV[x.level][0])} · ${esc(LV[x.level][1])}</small></td><td><b>${esc(x.en)}</b><small>${esc(x.zh)}</small></td><td>${esc(x.now_en)}<small>${esc(x.now_zh)}</small></td><td>${esc(x.watch)}</td><td class="st-${esc(x.status)}">${esc(ST[x.status][0])}<small>${esc(ST[x.status][1])}</small></td></tr>`).join("")}
      </tbody></table></div><p class="kv-fine">${esc(p.source)}</p></details>`;
    $("kvPlan").hidden = $("kvConcl").hidden;
  }

  /* Key parameters, exactly the fields of the original Stress Test page, for the model / NP / Input picked above (+ the one thing that changes here: the KV cache type) */
  function params() {
    const r = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`, rs = rowsOf(), planned = (D.kv_by_np && D.kv_by_np[NP]) || [], kvs = KVS.filter(k => planned.includes(k) || rs.some(x => x.kv === k)).join(" / ") || "—", fa = faOf(NP);
    $("kvParams").innerHTML = `<header><h2>Key parameters<span class="zh">測試參數</span></h2></header>
      <dl class="st-params">${r('Machine <small class="zhs">機器</small>', "AISO1 · Radeon 8060S 統一記憶體")}${r("Framework", "llama.cpp")}${r('Model <small class="zhs">模型</small>', MODEL === "all" ? "All 4: " + MODELS.map(m => esc(m[1])).join(" / ") : esc(mName(MODEL)))}
      ${r('Input <small class="zhs">輸入</small>', "4K / 8K / 16K")}${r('Output <small class="zhs">輸出</small>', "1,024 tokens")}${r('NP <small class="zhs">並發</small>', String(NP))}
      ${r('Repeat <small class="zhs">重複</small>', "3 次取平均")}${r("Batch size", "1024")}${r("Ubatch", "512")}
      ${r("Context / slot", "18432")}${r("Slots", "10")}${r('總 Context', (NP * 18432).toLocaleString("en-US").replace(/,/g, ""))}
      ${r('KV cache type <small class="zhs">KV 精度（唯一變數）</small>', "K = V · " + esc(kvs))}${r('Flash Attention <small class="zhs">閃存注意力</small>', esc(fa) + (fa === "off" ? " (same as the original AISO1 results)" : ""))}</dl>`;
  }

  function render() { if (!D) return; pick(); conclusion(); params(); same(); metrics(); smoke(); data(); plan(); }

  function view(v) {
    const kv = v === "kv";
    document.querySelectorAll(".st-std").forEach(s => { s.hidden = kv; });
    document.querySelectorAll(".st-kv").forEach(s => { s.hidden = !kv || (s.id === "kvSmoke" && !(D && smokeOf().length)); });
    document.querySelectorAll("#stView button").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    if (kv && !built) { built = true; refresh(); }
    if (location.hash !== (kv ? "#kv" : "") && (kv || location.hash === "#kv")) history.replaceState(null, "", kv ? "#kv" : location.pathname + location.search);
  }
  async function refresh() {
    const d = await load();
    if (!d) { $("kvConcl").innerHTML = `<header><h2>Conclusion<span class="zh">結論</span></h2></header><p class="kv-big">No KV cache results yet<small>還沒有 KV cache 測試結果</small></p>`; return; }
    d.rows.forEach(r => { r.decode_only_tps = r.tpot_ms > 0 ? 1000 / r.tpot_ms : null; });      /* Decode TPS = 1000 / TPOT, the wait for the first token is not in it */
    D = d; render();
    if (D.live && D.running) setTimeout(() => { if (!$("kvConcl").hidden) refresh(); }, 30000);      // while the test runs, new cases appear by themselves
  }
  document.addEventListener("click", e => {
    const v = e.target.closest("#stView button"); if (v) { view(v.dataset.view); return; }
    const b = e.target.closest("[data-kvg]"); if (!b || b.disabled) return;
    if (b.dataset.kvg === "m") MODEL = b.dataset.k; else if (b.dataset.kvg === "in") INPUT = Number(b.dataset.k); else NP = Number(b.dataset.k);
    render();
  });
  view(location.hash === "#kv" ? "kv" : "std");
})();
