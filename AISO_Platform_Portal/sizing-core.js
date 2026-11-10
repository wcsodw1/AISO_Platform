/* GPU Sizing core — pure functions, no DOM. Used by sizing.js (browser) and tests/sizing-core.test.js (node).
   Units: GB = 1e9 bytes (decimal), same as GPU marketing capacity. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SizingCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Model presets: total params (B), layers, KV heads, head dim.
     Architecture numbers are from public config.json files and are PRESETS ONLY —
     always re-check against the customer's actual model config. MoE: params = TOTAL, not active. */
  const MODELS = [
    { id: "custom", name: "自訂（手動輸入）", params: 70, layers: 80, kvHeads: 8, headDim: 128 },
    { id: "llama33-70b", name: "Llama 3.3 70B", params: 70, layers: 80, kvHeads: 8, headDim: 128 },
    { id: "qwen3-32b", name: "Qwen3 32B", params: 32, layers: 64, kvHeads: 8, headDim: 128 },
    { id: "gptoss-20b", name: "gpt-oss-20B（MoE）", params: 21, layers: 24, kvHeads: 8, headDim: 64, note: "sliding window 混合 attention，KV 實際較小，此為上限估算" },
    { id: "gptoss-120b", name: "gpt-oss-120B（MoE）", params: 117, layers: 36, kvHeads: 8, headDim: 64, note: "sliding window 混合 attention，KV 實際較小，此為上限估算" },
    { id: "qwen3-235b", name: "Qwen3 235B-A22B（MoE）", params: 235, layers: 94, kvHeads: 4, headDim: 128 },
    { id: "qwen3-coder-480b", name: "Qwen3-Coder 480B-A35B（MoE）", params: 480, layers: 62, kvHeads: 8, headDim: 128 },
    { id: "llama31-405b", name: "Llama 3.1 405B", params: 405, layers: 126, kvHeads: 8, headDim: 128 }
  ];

  /* GPU catalog. vram in GB, perServer = GPUs in one chassis (editable in UI).
     assumed:true → value is a planning assumption, confirm with real hardware. */
  const GPUS = [
    { id: "rtxpro6000", vendor: "NVIDIA", model: "RTX PRO 6000", name: "NVIDIA RTX PRO 6000", vram: 96, perServer: 8, configs: [2, 4, 8] },
    { id: "b300", vendor: "NVIDIA", model: "B300", name: "NVIDIA B300（HGX）", vram: 288, perServer: 8, configs: [8], assumed: true },
    { id: "h200", vendor: "NVIDIA", model: "H200", name: "NVIDIA H200", vram: 141, perServer: 8, configs: [4, 8] },
    { id: "h100", vendor: "NVIDIA", model: "H100", name: "NVIDIA H100", vram: 80, perServer: 8, configs: [4, 8] },
    { id: "l40s", vendor: "NVIDIA", model: "L40S", name: "NVIDIA L40S", vram: 48, perServer: 8, configs: [2, 4, 8] },
    { id: "b200", vendor: "NVIDIA", model: "B200", name: "NVIDIA B200（HGX）", vram: 180, perServer: 8, configs: [8], assumed: true },
    { id: "b70", vendor: "Intel", model: "Arc Pro B70", name: "Intel Arc Pro B70（AISO 平台）", vram: 32, perServer: 2, configs: [2, 4], basis: "依 TPI B70 測試機：2 張＝64 GB" },
    { id: "b60", vendor: "Intel", model: "Arc Pro B60", name: "Intel Arc Pro B60（AISO 平台）", vram: 24, perServer: 4, configs: [2, 4], basis: "依 TPI B60 測試機：4 張＝96 GB" },
    { id: "gaudi3", vendor: "Intel", model: "Gaudi 3", name: "Intel Gaudi 3", vram: 128, perServer: 8, configs: [8], assumed: true },
    { id: "aiso1", vendor: "AMD", model: "AISO1", name: "AMD AISO1（統一記憶體）", vram: 96, perServer: 1, configs: [1], assumed: true },
    { id: "mi300x", vendor: "AMD", model: "Instinct MI300X", name: "AMD Instinct MI300X", vram: 192, perServer: 8, configs: [8] },
    { id: "mi325x", vendor: "AMD", model: "Instinct MI325X", name: "AMD Instinct MI325X", vram: 256, perServer: 8, configs: [8], assumed: true },
    { id: "mi355x", vendor: "AMD", model: "Instinct MI355X", name: "AMD Instinct MI355X", vram: 288, perServer: 8, configs: [8], assumed: true }
  ];
  const VENDORS = ["NVIDIA", "AMD", "Intel"];

  const num = (v, d) => (Number.isFinite(+v) && v !== "" && v !== null ? +v : d);

  function weightsGB(paramsB, bits, overheadPct) {
    return (paramsB * bits / 8) * (1 + overheadPct / 100);
  }
  function kvBytesPerToken(layers, kvHeads, headDim, kvBits) {
    return 2 * layers * kvHeads * headDim * (kvBits / 8);
  }
  /* KV memory of ONE request. Hybrid models list `groups` (full attention, or sliding window capped at `window`
     tokens); linear-attention layers keep a fixed recurrent state (`stateMB`, independent of context). */
  function kvPerRequestGB(m, context, kvBits) {
    if (!m.groups) return kvBytesPerToken(m.layers, m.kvHeads, m.headDim, kvBits) * context / 1e9;
    const b = kvBits / 8;
    let bytes = (m.stateMB || 0) * 1048576;
    m.groups.forEach(g => { bytes += g.layers * 2 * g.kvHeads * g.headDim * b * Math.min(context, g.window || context); });
    return bytes / 1e9;
  }
  function kvGB(m, contextPerReq, concurrent, kvBits) {
    return kvPerRequestGB(m, contextPerReq, kvBits) * concurrent;
  }
  function concurrentFromUsers(users, activePct, inflightPct) {
    return Math.max(1, Math.ceil(users * (activePct / 100) * (inflightPct / 100)));
  }

  /* M_required = weights + KV + runtime + headroom%(of the sum) */
  function budget(i) {
    const w = weightsGB(i.params, i.weightBits, i.metaPct);
    const kv = kvGB(i, i.context, i.concurrent, i.kvBits);
    const sub = w + kv + i.runtimeGB;
    const head = sub * i.headroomPct / 100;
    return { weights: w, kv, runtime: i.runtimeGB, headroom: head, total: sub + head,
             kvPerTokenKiB: kvBytesPerToken(i.layers, i.kvHeads, i.headDim, i.kvBits) / 1024 };
  }

  const pow2Up = n => { let p = 1; while (p < n) p *= 2; return p; };

  /* Capacity floor + tensor-parallel-friendly GPU count + server count for one GPU type. */
  function sizeFor(totalGB, gpu, usablePct, opts) {
    opts = opts || {};
    const usable = gpu.vram * usablePct / 100;
    const gpusMin = Math.max(1, Math.ceil(totalGB / usable));
    const gpusTP = pow2Up(gpusMin);
    const serversByMem = Math.ceil(gpusTP / gpu.perServer);
    const crossNode = gpusTP > gpu.perServer;
    const serversByTps = opts.requiredTps > 0 && opts.perServerTps > 0 ? Math.ceil(opts.requiredTps / opts.perServerTps) : 0;
    const servers = Math.max(serversByMem, serversByTps, 1);
    const withHA = opts.ha ? servers + 1 : servers;
    return { usablePerGpu: usable, gpusMin, gpusTP, serversByMem, serversByTps, servers, withHA,
             crossNode, physicalVram: withHA * gpu.perServer * gpu.vram };
  }

  /* ---- multi-model (e.g. VIS: three models served side by side) ----
     Architecture numbers come from each model's public config.json (read 2026-11-10). Weights use the effective
     bits-per-weight of the format (GGUF scales included), not "bits + metadata%". */
  const QUANTS = {
    bf16: { label: "BF16", bpw: 16 },
    fp8: { label: "FP8", bpw: 8 },
    q8: { label: "Q8_0", bpw: 8.5 },
    q4km: { label: "Q4_K_M", bpw: 4.85 }
  };
  /* Weights = REAL file sizes read from Hugging Face on 2026-11-10 (data/sizing-model-sizes.json, scripts/check_model_sizes.py);
     the bpw above is only a fallback. All GGUF sizes come from ONE publisher (bartowski) so quant levels are comparable; FP8 is the official Qwen repo; Qwen3.8 MTP heads (bartowski has none) come from ggml-org. mtp = the MTP draft head file that matches the quant; dflash = DFlash draft model (not counted). */
  const F = (bytes, repo, file) => ({ bytes, repo, file });
  const ST = "__safetensors_total__";
  const VIS_MODELS = [
    { id: "qwen36-35b", name: "Qwen3.6-35B-A3B", params: 35.95, quants: ["bf16", "fp8", "q8", "q4km"],
      files: { bf16: F(71065941536, "bartowski/Qwen_Qwen3.6-35B-A3B-GGUF", "Qwen_Qwen3.6-35B-A3B-bf16"), fp8: F(37463662160, "Qwen/Qwen3.6-35B-A3B-FP8", ST),
               q8: F(37812647552, "bartowski/Qwen_Qwen3.6-35B-A3B-GGUF", "Qwen_Qwen3.6-35B-A3B-Q8_0"), q4km: F(22285080192, "bartowski/Qwen_Qwen3.6-35B-A3B-GGUF", "Qwen_Qwen3.6-35B-A3B-Q4_K_M") },
      mtp: { bf16: 3735545920, fp8: 1989597056, q8: 1989597056, q4km: 1190098816 }, dflashGB: 0.421,
      groups: [{ layers: 10, kvHeads: 2, headDim: 256 }], stateMB: 62,
      arch: "MoE（256 專家，全部常駐）· 40 層：10 層 full attention（2 KV heads × 256）、30 層 linear attention（固定 state）", src: "Qwen/Qwen3.6-35B-A3B config.json" },
    { id: "qwen38-27b", name: "Qwen3.8-27B", params: 27.78, quants: ["q8", "q4km"],
      files: { bf16: F(54657734144, "bartowski/Qwen3.8-27B-GGUF", "Qwen3.8-27B-bf16"), fp8: F(30866866928, "Qwen/Qwen3.8-27B-FP8", ST),
               q8: F(29116388960, "bartowski/Qwen3.8-27B-GGUF", "Qwen3.8-27B-Q8_0"), q4km: F(17442399968, "bartowski/Qwen3.8-27B-GGUF", "Qwen3.8-27B-Q4_K_M") },
      mtp: { bf16: 5946010176, q8: 3164006976, q4km: 1680271936 }, dflashGB: 2.056,
      groups: [{ layers: 16, kvHeads: 4, headDim: 256 }], stateMB: 147,
      arch: "Dense · 64 層：16 層 full attention（4 KV heads × 256）、48 層 linear attention（固定 state）", src: "Qwen/Qwen3.8-27B config.json" },
    { id: "gemma4-31b", name: "Gemma 4 31B", params: 31.27, quants: ["q8", "q4km"],
      files: { bf16: F(61413189920, "bartowski/google_gemma-4-31B-it-GGUF", "google_gemma-4-31B-it-bf16"),
               q8: F(32635677024, "bartowski/google_gemma-4-31B-it-GGUF", "google_gemma-4-31B-it-Q8_0"), q4km: F(19598489952, "bartowski/google_gemma-4-31B-it-GGUF", "google_gemma-4-31B-it-Q4_K_M") },
      mtp: { q8: 514705920, q4km: 349161984 }, dflashGB: 1.648,
      groups: [{ layers: 50, kvHeads: 16, headDim: 256, window: 1024 }, { layers: 10, kvHeads: 4, headDim: 512 }], stateMB: 0,
      arch: "Dense · 60 層：50 層 sliding window（1024 tokens，16 KV heads × 256）、10 層 global（4 KV heads × 512；K、V 以各自存放保守估算）", src: "google/gemma-4-31B-it config.json" }
  ];

  /* weights in GB: real file size if known, else params × bits-per-weight */
  function weightsOf(m, quant) {
    const f = m.files && m.files[quant];
    if (f) return { gb: f.bytes / 1e9, real: true, repo: f.repo, file: f.file, bpw: f.bytes * 8 / (m.params * 1e9), vsBf16: m.files.bf16 ? f.bytes / m.files.bf16.bytes : null };
    return { gb: m.params * QUANTS[quant].bpw / 8, real: false, bpw: QUANTS[quant].bpw, vsBf16: null };
  }
  /* MTP head that matches the quant (GB), 0 if none listed */
  const mtpOf = (m, quant) => ((m.mtp && m.mtp[quant]) || 0) / 1e9;

  /* one model's budget: M = (W + KV + runtime + extra) × (1 + headroom%) */
  function modelBudget(m, cfg) {
    const w = weightsOf(m, cfg.quant), weights = w.gb, perReq = kvPerRequestGB(m, cfg.context, cfg.kvBits || 16);
    const kv = perReq * cfg.concurrent, sub = weights + kv + cfg.runtimeGB + (cfg.extraGB || 0), headroom = sub * cfg.headroomPct / 100;
    return { weights, w, perReq, kv, runtime: cfg.runtimeGB, extra: cfg.extraGB || 0, headroom, total: sub + headroom, quant: QUANTS[cfg.quant].label, bpw: w.bpw };
  }

  /* Split `total` concurrent requests by share weights; remainders go to the largest shares, sum stays exact. */
  function splitConcurrency(total, shares) {
    const sum = shares.reduce((a, b) => a + b, 0) || 1, raw = shares.map(x => total * x / sum), out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return out;
  }

  /* Place models on GPUs. A model larger than one GPU is split into k (power of two) equal tensor-parallel shards that
     must sit on k different GPUs. pack=false: every model gets its own GPUs. pack=true: first-fit-decreasing lets
     shards of different models share a GPU (fewest GPUs; several server processes per GPU). */
  function place(items, gpu, usablePct, pack) {
    const cap = gpu.vram * usablePct / 100, bins = [];
    const sorted = items.map(it => ({ ...it, k: pow2Up(Math.max(1, Math.ceil(it.total / cap))) })).sort((a, b) => b.total - a.total);
    sorted.forEach(it => {
      const shard = it.total / it.k;
      for (let s = 0; s < it.k; s++) {
        let bin = pack ? bins.find(b => b.used + shard <= cap + 1e-9 && !b.names.has(it.name)) : null;
        if (!bin) { bin = { used: 0, names: new Set(), shards: [] }; bins.push(bin); }
        bin.used += shard; bin.names.add(it.name); bin.shards.push({ name: it.name, gb: shard, k: it.k });
      }
    });
    return { cap, gpus: bins.length, bins: bins.map(b => ({ used: b.used, shards: b.shards })), tp: sorted.map(i => ({ name: i.name, k: i.k })),
             servers: Math.ceil(bins.length / gpu.perServer), crossNode: sorted.some(i => i.k > gpu.perServer) };
  }

  const f1 = (n, d = 1) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* "154.0 GB（0.15 TB）"; at 1000 GB and above TB leads: "1.52 TB（1,523 GB）" */
  function memText(gb) {
    const tb = gb / 1000;
    return gb >= 1000 ? `${f1(tb, 2)} TB（${f1(gb, 0)} GB）` : `${f1(gb)} GB（${f1(tb, 2)} TB）`;
  }

  /* the calculation, symbolic and with the current parameters substituted */
  function formula(i, b) {
    const w = f1(b.weights), kv = f1(b.kv), r = f1(b.runtime), h = f1(b.headroom);
    return [
      { k: "M_weights", sym: "P × b ÷ 8 × (1 + δ)", sub: `${i.params}B × ${i.weightBits} ÷ 8 × (1 + ${i.metaPct}%)`, out: b.weights },
      { k: "M_KV", sym: "2 × L × H_KV × D × (b_KV ÷ 8) × T × C", sub: `2 × ${i.layers} × ${i.kvHeads} × ${i.headDim} × (${i.kvBits} ÷ 8) × ${f1(i.context, 0)} × ${i.concurrent}`, out: b.kv, note: `每 token ${f1(b.kvPerTokenKiB, 0)} KiB；T＝每請求 Context，C＝同時請求數` },
      { k: "M_runtime", sym: "固定開銷（輸入值）", sub: `${r} GB`, out: b.runtime },
      { k: "M_headroom", sym: "(M_weights + M_KV + M_runtime) × h", sub: `(${w} + ${kv} + ${r}) × ${i.headroomPct}%`, out: b.headroom },
      { k: "M_required", sym: "M_weights + M_KV + M_runtime + M_headroom", sub: `${w} + ${kv} + ${r} + ${h}`, out: b.total, total: true, fin: true }
    ];
  }

  /* GPU count for one option, with the substituted line */
  function gpuFormula(totalGB, gpu, usablePct, size) {
    return { sym: "N_GPU = ⌈ M_required ÷ (V × u) ⌉",
             sub: `⌈ ${f1(totalGB)} ÷ (${gpu.vram} × ${usablePct}%) ⌉ = ⌈ ${f1(totalGB / size.usablePerGpu, 2)} ⌉ = ${size.gpusMin}`,
             tp: `TP 建議取 2 的次方：${size.gpusMin} → ${size.gpusTP} 張` };
  }

  /* every GPU option sized and ranked: fewest servers first, then fewest GPUs; first = suggested */
  /* one entry per (GPU model x GPUs-per-server option): e.g. RTX PRO 6000 as a 2-, 4- or 8-GPU server. id = "<model>@<k>" */
  function variants(gpus) {
    return gpus.flatMap(g => {
      const ks = [...new Set([...(g.configs || []), g.perServer])].filter(k => k > 0).sort((a, b) => a - b);
      return ks.map(k => ({ ...g, id: g.id + "@" + k, baseId: g.id, perServer: k, nCfg: ks.length }));
    });
  }
  /* rank: single-node first, then fewest GPUs to buy (servers x GPUs per server), then fewest servers, then larger VRAM */
  function options(totalGB, gpus, usablePct, opts) {
    return gpus.map(g => ({ gpu: g, size: sizeFor(totalGB, g, usablePct, opts) }))
      .sort((a, b) => (a.size.crossNode - b.size.crossNode) || (a.size.withHA * a.gpu.perServer - b.size.withHA * b.gpu.perServer) || a.size.withHA - b.size.withHA || a.size.gpusTP - b.size.gpusTP || b.gpu.vram - a.gpu.vram);
  }

  /* ---- calculation box (shared by single and multi-model views) ---- */
  const escH = x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* "M_weights = P × b ÷ 8" -> variables in italics, names after "_" as subscripts */
  function sci(t) {
    return escH(t).replace(/\b([A-Za-z]{1,3})_([A-Za-z]+)\b/g, "<var>$1<sub>$2</sub></var>")
      .replace(/(^|[\s(×÷+=⌈,])(KV|[PbLDTChUARVuWE]|δ)(?=[\s)×÷+=⌉,]|$)/g, "$1<var>$2</var>");
  }
  const rowHtml = r => `<div class="sz-row${r.fin ? " fin" : ""}"><div class="sz-ck">${sci(r.k)}</div><div class="sz-cb">` +
    (r.fin ? `<div class="sz-eq sym">= ${sci(r.sym)} <span class="sz-num">= ${escH(r.sub)}</span></div>`
           : (r.sym ? `<div class="sz-eq sym">= ${sci(r.sym)}</div>` : "") + `<div class="sz-eq">= ${escH(r.sub)}</div>`) + `<div class="sz-eq out">= ${escH(typeof r.out === "number" ? memText(r.out) : r.out)}</div>` +
    (r.note ? `<small>${escH(r.note)}</small>` : "") + `</div></div>`;
  const legendHtml = items => `<div class="sz-legend">${items.map(([sym, name, val]) => `<div class="sz-lg"><span class="sy">${sci(sym)}</span><span class="mn">${escH(name)}</span><b>${escH(val)}</b></div>`).join("")}</div>`;
  /* 💡 hint: the explanation lives in the bubble, not on the page */
  const tip = text => `<span class="hint" tabindex="0" role="note">💡<span class="hintbox">${escH(text)}</span></span>`;
  const tabHtml = (p, title, sub, zh) => `<button type="button" class="sz-hn-tab" role="tab" data-p="${p}" aria-expanded="false"><b>${escH(title)}${zh ? `<span class="bz">${escH(zh)}</span>` : ""}</b><small>${escH(sub)}</small><span class="car" aria-hidden="true">▾</span></button>`;
  /* sections: [{title, rows:[{k,sym,sub,out,note,fin}]}]
     Visible: the formula line and the highlighted result row (fin). Dropdowns (hover): substituted calculation, parameter meanings. */
  function calcBoxHtml(o) {
    const fin = o.sections.flatMap(sec => sec.rows).filter(r => r.fin);
    const detail = o.sections.map(sec => ({ ...sec, rows: sec.rows.filter(r => !r.fin) })).filter(sec => sec.rows.length);
    /* order: dropdown tabs on top (left = calculation, right = parameter meaning), then the always-visible result */
    return `<div class="sz-hn sz-hn-calc"><div class="sz-hn-tabs" role="tablist">${tabHtml("calc", "Calculation", "算式與代入數字", "計算方式")}${tabHtml("sym", "Parameter meaning", "各參數代表什麼", "參數意涵")}</div>` +
      `<div class="sz-hn-panels"><div class="sz-hn-panel" data-p="calc"><div class="sz-rows">` +
      detail.map(sec => (sec.title ? `<div class="sz-sec">${escH(sec.title)}</div>` : "") + sec.rows.map(rowHtml).join("")).join("") +
      `</div></div><div class="sz-hn-panel" data-p="sym">${legendHtml(o.legend)}</div></div></div>` +
      `<div class="sz-rows sz-final">${fin.map(rowHtml).join("")}</div>`;
  }

  /* legend of the single-model formula with the current values */
  function legendFor(i, b) {
    return [
      ["M_required", "總 GPU 顯存需求", memText(b.total)], ["M_weights", "模型權重", memText(b.weights)], ["M_KV", "KV Cache（上下文暫存）", memText(b.kv)],
      ["M_runtime", "框架／CUDA 固定開銷", memText(b.runtime)], ["M_headroom", "安全餘裕", memText(b.headroom)],
      ["P", "模型總參數量（MoE 取總數）", `${f1(i.params, i.params % 1 ? 2 : 0)} B`], ["b", "權重位元數", `${i.weightBits} bit`], ["δ", "量化 metadata 加成", `${i.metaPct}%`],
      ["L", "Transformer 層數", String(i.layers)], ["H_KV", "KV attention heads 數", String(i.kvHeads)], ["D", "每個 head 的維度", String(i.headDim)],
      ["b_KV", "KV 每元素位元數", `${i.kvBits} bit`], ["T", "每個請求的 Context", `${f1(i.context, 0)} tokens`], ["C", "同時推論的請求數", String(i.concurrent)],
      ["h", "安全餘裕比例", `${i.headroomPct}%`]
    ];
  }

  /* Read the KV-relevant fields of a Hugging Face config.json (top level or text_config).
     Plain full-attention models only: hybrid (linear attention / sliding window) is detected and flagged, never guessed. */
  function parseConfig(input) {
    let cfg;
    try { cfg = typeof input === "string" ? JSON.parse(input) : input; } catch (e) { throw new Error("不是有效的 JSON，請貼上完整的 config.json 內容"); }
    if (!cfg || typeof cfg !== "object") throw new Error("不是有效的 JSON 物件");
    const t = cfg.text_config && typeof cfg.text_config === "object" ? cfg.text_config : cfg;
    const layers = t.num_hidden_layers || t.n_layer || t.num_layers, heads = t.num_attention_heads || t.n_head;
    const kvHeads = t.num_key_value_heads || t.num_kv_heads || heads;
    const headDim = t.head_dim || (t.hidden_size && heads ? Math.round(t.hidden_size / heads) : 0);
    const types = Array.isArray(t.layer_types) ? new Set(t.layer_types) : null;
    const notes = [];
    const hybrid = !!((types && types.size > 1) || t.sliding_window);
    if (hybrid) notes.push("偵測到混合架構（linear attention 或 sliding window）：這裡只能當成每層都存完整 KV，會高估；內建的 VIS 模型已分層計算。");
    if (t.num_experts || t.num_local_experts || t.n_routed_experts) notes.push("MoE 模型：總參數量請填「全部專家」的總數，不是 active 參數。");
    if (!layers || !kvHeads || !headDim) throw new Error("找不到 num_hidden_layers / num_key_value_heads / head_dim（或 hidden_size）");
    return { layers, kvHeads, headDim, hybrid, notes };
  }

  /* ---- machine chooser: an always-visible 3-pane panel  Vendor | Model | Server size  (click to browse, click a size to choose)
     items: [{gpu, servers, need, tp, cross, best}] ranked best-first ; a server is sold fully populated: servers x gpu.perServer GPUs
     browse: {v, m} = what the user is looking at (not necessarily chosen) ; pickedId = chosen variant id or null */
  const physical = o => o.servers * o.gpu.perServer;
  const resEn = (servers, gpus) => `${servers} server${servers === 1 ? "" : "s"} · ${gpus} GPU${gpus === 1 ? "" : "s"}`;
  function pickPanelHtml(items, pickedId, ns, browse) {
    const base = o => o.gpu.baseId || o.gpu.id;
    const cur = items.find(o => o.gpu.id === pickedId) || null;
    const best = items.find(o => o.best) || items[0];
    const per = o => `${o.gpu.perServer} GPU${o.gpu.perServer === 1 ? "" : "s"} / server`;
    const marks = o => (o.best ? '<em class="star">★</em>' : "") + (o.cross ? '<em class="warn">⚠</em>' : "");
    const vendors = VENDORS.filter(v => items.some(o => o.gpu.vendor === v));
    let bv = (browse && browse.v) || (cur ? cur.gpu.vendor : best.gpu.vendor);
    if (!vendors.includes(bv)) bv = vendors[0];
    const ofV = items.filter(o => o.gpu.vendor === bv);
    const models = [...new Set(ofV.map(base))];
    let bm = browse && browse.m;
    if (!models.includes(bm)) bm = cur && cur.gpu.vendor === bv ? base(cur) : (best.gpu.vendor === bv ? base(best) : models[0]);
    const cfgs = ofV.filter(o => base(o) === bm);
    const head = cur
      ? `<div class="pp-sel"><span class="pp-k">Selected<span class="bz">已選</span></span><b>${escH(cur.gpu.vendor)} · ${escH(cur.gpu.model)}</b><span class="pp-per">${per(cur)}</span><strong>${resEn(cur.servers, physical(cur))}</strong>${marks(cur)}<span class="bz">${cur.servers} 台 · ${physical(cur)} 張 GPU</span></div>`
      : `<div class="pp-sel ask"><b>Choose a machine</b><span class="bz">選擇機型</span><span class="pp-hint">Vendor → Model → Server size · ★ = recommended<span class="bz">★ 為建議</span></span></div>`;
    const colV = vendors.map(v => {
      const n = new Set(items.filter(o => o.gpu.vendor === v).map(base)).size, hasBest = items.some(o => o.gpu.vendor === v && o.best);
      return `<button type="button" class="pp-v${v === bv ? " on" : ""}${cur && cur.gpu.vendor === v ? " sel" : ""}" data-v="${v}"><b>${v}</b><span>${n} model${n === 1 ? "" : "s"}${hasBest ? ' <em class="star">★</em>' : ""}</span></button>`;
    }).join("");
    const colM = models.map(m => {
      const opts = ofV.filter(o => base(o) === m), top = opts[0];
      return `<button type="button" class="pp-m${m === bm ? " on" : ""}${cur && base(cur) === m ? " sel" : ""}" data-m="${m}"><b>${escH(top.gpu.model)}</b>${top.gpu.assumed ? '<i class="sz-flag">Assumed 假設</i>' : ""}<span>${top.gpu.vram} GB · ${opts.length} size${opts.length === 1 ? "" : "s"}${opts.some(o => o.best) ? ' <em class="star">★</em>' : ""}</span></button>`;
    }).join("");
    const top = cfgs[0];
    const colC = `<div class="pp-ch"><b>${escH(top.gpu.model)}</b><span>Server size<span class="bz">每台幾張</span></span></div>` + cfgs.map(o =>
      `<button type="button" class="pp-c${cur && o.gpu.id === cur.gpu.id ? " sel" : ""}${o.cross ? " cross" : ""}" data-id="${o.gpu.id}"><b>${per(o)}</b><span>${resEn(o.servers, physical(o))}</span>${marks(o)}<small>Needs ${o.need} GPU${o.need === 1 ? "" : "s"}${o.tp && o.tp !== o.need ? ` · TP ${o.tp}` : ""}${o.cross ? " · cross-node 需跨節點" : ""}</small></button>`).join("");
    return `<div class="pp" id="${ns}Pp">${head}<div class="pp-cols"><div class="pp-col pp-cv"><div class="pp-ch"><span>Vendor<span class="bz">品牌</span></span></div>${colV}</div>` +
      `<div class="pp-col pp-cm"><div class="pp-ch"><span>Model<span class="bz">機型</span></span></div>${colM}</div><div class="pp-col pp-cc">${colC}</div></div></div>`;
  }

  /* GPU reference card (right side of Step 3): grouped by vendor, VRAM as a bar, server sizes as chips.
     info(g) -> html line for the current scenario (or "" / null); editable adds VRAM and default GPUs-per-server inputs (data-i = index in `gpus`). */
  function refRowsHtml(gpus, info, editable) {
    const maxV = Math.max(...gpus.map(g => g.vram), 1);
    return VENDORS.map(v => {
      const list = gpus.map((g, i) => ({ g, i })).filter(x => x.g.vendor === v);
      if (!list.length) return "";
      return `<section class="sz-ref-v"><h4>${v}</h4>` + list.map(({ g, i }) => {
        const ks = [...new Set([...(g.configs || []), g.perServer])].sort((a, b) => a - b);
        const inf = info ? info(g) : "";
        return `<div class="sz-ref-row${inf && inf.warn ? " warn" : ""}"><div class="rr-top"><b>${escH(g.model)}</b>${g.assumed ? '<i class="sz-flag">Assumed 假設</i>' : ""}` +
          `<span class="rr-vram">${editable ? `<input class="sz-mini" data-i="${i}" data-k="vram" type="number" min="1" value="${g.vram}" aria-label="VRAM GB">` : g.vram} GB</span></div>` +
          `<div class="rr-bar"><i style="width:${(g.vram / maxV * 100).toFixed(1)}%"></i></div>` +
          `<div class="rr-opts">${ks.map(k => `<em>${k}</em>`).join("")}<span>GPUs / server</span>${editable ? `<label class="rr-def">default <input class="sz-mini" data-i="${i}" data-k="perServer" type="number" min="1" value="${g.perServer}" aria-label="GPUs per server"></label>` : ""}</div>` +
          (inf ? `<div class="rr-need">${inf.html || inf}</div>` : "") + (g.basis ? `<div class="rr-note">${escH(g.basis)}</div>` : "") + `</div>`;
      }).join("") + `</section>`;
    }).join("");
  }

  return { VENDORS, refRowsHtml, physical, resEn, pickPanelHtml, tip, tabHtml, parseConfig, sci, calcBoxHtml, legendFor, MODELS, GPUS, num, weightsGB, kvBytesPerToken, kvGB, concurrentFromUsers, budget, sizeFor, pow2Up, memText, formula, gpuFormula, options, variants, kvPerRequestGB, QUANTS, VIS_MODELS, weightsOf, mtpOf, modelBudget, splitConcurrency, place };
});
