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
  function kvGB(m, contextPerReq, concurrent, kvBits) {
    return kvBytesPerToken(m.layers, m.kvHeads, m.headDim, kvBits) * contextPerReq * concurrent / 1e9;
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

  return { MODELS, GPUS, num, weightsGB, kvBytesPerToken, kvGB, concurrentFromUsers, budget, sizeFor, pow2Up };
});
