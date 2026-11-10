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
    { id: "rtxpro6000", name: "NVIDIA RTX PRO 6000", vram: 96, perServer: 8 },
    { id: "b300", name: "NVIDIA B300（HGX）", vram: 288, perServer: 8, assumed: true },
    { id: "h200", name: "NVIDIA H200", vram: 141, perServer: 8 },
    { id: "h100", name: "NVIDIA H100", vram: 80, perServer: 8 },
    { id: "l40s", name: "NVIDIA L40S", vram: 48, perServer: 8 },
    { id: "b70", name: "Intel Arc Pro B70（AISO 平台）", vram: 32, perServer: 2, assumed: true },
    { id: "b60", name: "Intel Arc Pro B60（AISO 平台）", vram: 24, perServer: 2 },
    { id: "aiso1", name: "AMD AISO1（統一記憶體）", vram: 96, perServer: 1, assumed: true }
  ];

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
  const VIS_MODELS = [
    { id: "qwen36-35b", name: "Qwen3.6-35B-A3B", params: 35.95, quants: ["bf16", "fp8", "q8", "q4km"], mtp: true,
      groups: [{ layers: 10, kvHeads: 2, headDim: 256 }], stateMB: 62,
      arch: "MoE（256 專家，全部常駐）· 40 層：10 層 full attention（2 KV heads × 256）、30 層 linear attention（固定 state）", src: "Qwen/Qwen3.6-35B-A3B config.json" },
    { id: "qwen38-27b", name: "Qwen3.8-27B", params: 27.78, quants: ["q8", "q4km"], mtp: true,
      groups: [{ layers: 16, kvHeads: 4, headDim: 256 }], stateMB: 147,
      arch: "Dense · 64 層：16 層 full attention（4 KV heads × 256）、48 層 linear attention（固定 state）", src: "Qwen/Qwen3.8-27B config.json" },
    { id: "gemma4-31b", name: "Gemma 4 31B", params: 31.27, quants: ["q8", "q4km"], mtp: true,
      groups: [{ layers: 50, kvHeads: 16, headDim: 256, window: 1024 }, { layers: 10, kvHeads: 4, headDim: 512 }], stateMB: 0,
      arch: "Dense · 60 層：50 層 sliding window（1024 tokens，16 KV heads × 256）、10 層 global（4 KV heads × 512；K、V 以各自存放保守估算）", src: "google/gemma-4-31B-it config.json" }
  ];

  /* one model's budget: M = (W + KV + runtime + extra) × (1 + headroom%) */
  function modelBudget(m, cfg) {
    const q = QUANTS[cfg.quant], weights = m.params * q.bpw / 8, perReq = kvPerRequestGB(m, cfg.context, cfg.kvBits || 16);
    const kv = perReq * cfg.concurrent, sub = weights + kv + cfg.runtimeGB + (cfg.extraGB || 0), headroom = sub * cfg.headroomPct / 100;
    return { weights, perReq, kv, runtime: cfg.runtimeGB, extra: cfg.extraGB || 0, headroom, total: sub + headroom, quant: q.label, bpw: q.bpw };
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
      { k: "M_weights", sym: "P × b ÷ 8 × (1 + metadata%)", sub: `${i.params}B × ${i.weightBits} ÷ 8 × (1 + ${i.metaPct}%)`, out: b.weights },
      { k: "M_KV", sym: "2 × L × H_KV × D × (b_KV ÷ 8) × T × C", sub: `2 × ${i.layers} × ${i.kvHeads} × ${i.headDim} × (${i.kvBits} ÷ 8) × ${f1(i.context, 0)} × ${i.concurrent}`, out: b.kv, note: `每 token ${f1(b.kvPerTokenKiB, 0)} KiB；T＝每請求 Context，C＝同時請求數` },
      { k: "M_runtime", sym: "Runtime overhead", sub: `${r} GB`, out: b.runtime },
      { k: "M_headroom", sym: "(M_weights + M_KV + M_runtime) × headroom%", sub: `(${w} + ${kv} + ${r}) × ${i.headroomPct}%`, out: b.headroom },
      { k: "M_required", sym: "M_weights + M_KV + M_runtime + M_headroom", sub: `${w} + ${kv} + ${r} + ${h}`, out: b.total, total: true }
    ];
  }

  /* GPU count for one option, with the substituted line */
  function gpuFormula(totalGB, gpu, usablePct, size) {
    return { sym: "N_GPU = ⌈ M_required ÷ (VRAM × usable%) ⌉",
             sub: `⌈ ${f1(totalGB)} ÷ (${gpu.vram} × ${usablePct}%) ⌉ = ⌈ ${f1(totalGB / size.usablePerGpu, 2)} ⌉ = ${size.gpusMin}`,
             tp: `TP 建議取 2 的次方：${size.gpusMin} → ${size.gpusTP} 張` };
  }

  /* every GPU option sized and ranked: fewest servers first, then fewest GPUs; first = suggested */
  function options(totalGB, gpus, usablePct, opts) {
    return gpus.map(g => ({ gpu: g, size: sizeFor(totalGB, g, usablePct, opts) }))
      .sort((a, b) => a.size.withHA - b.size.withHA || a.size.gpusTP - b.size.gpusTP || b.gpu.vram - a.gpu.vram);
  }

  return { MODELS, GPUS, num, weightsGB, kvBytesPerToken, kvGB, concurrentFromUsers, budget, sizeFor, pow2Up, memText, formula, gpuFormula, options, kvPerRequestGB, QUANTS, VIS_MODELS, modelBudget, splitConcurrency, place };
});
