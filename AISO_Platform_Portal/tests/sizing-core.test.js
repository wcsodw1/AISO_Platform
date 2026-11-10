// Run: node AISO_Platform_Portal/tests/sizing-core.test.js
const assert = require("assert");
const C = require("../sizing-core.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}`);

// Reference case from the sizing write-up: 70B, 4-bit weights (+10% metadata), BF16 KV,
// 80 layers / 8 KV heads / 128 dim, 32768 ctx × 20 concurrent, runtime 15 GB, 15% headroom.
const ref = { params: 70, weightBits: 4, metaPct: 10, kvBits: 16, context: 32768, concurrent: 20,
              layers: 80, kvHeads: 8, headDim: 128, runtimeGB: 15, headroomPct: 15 };
const b = C.budget(ref);
near(b.weights, 38.5, 0.05, "weights");
near(b.kvPerTokenKiB, 320, 0.001, "KV KiB/token");
near(b.kv, 214.7, 0.1, "KV GB");
near(b.headroom, 40.2, 0.1, "headroom");
near(b.total, 308.4, 0.2, "total");

const gpu = id => C.GPUS.find(g => g.id === id);
assert.strictEqual(C.sizeFor(b.total, gpu("rtxpro6000"), 90).gpusMin, 4, "PRO6000 min GPUs");
assert.strictEqual(C.sizeFor(b.total, gpu("b300"), 90).gpusMin, 2, "B300 min GPUs");

// TP rounding: 3 GPUs of capacity must round up to 4 for tensor parallel.
assert.strictEqual(C.pow2Up(3), 4);
assert.strictEqual(C.sizeFor(200, gpu("rtxpro6000"), 90).gpusTP, 4);
// Cross-node flag when a single model needs more GPUs than one chassis holds.
const big = C.sizeFor(1000, gpu("rtxpro6000"), 90); // 11.6 → 12 → 16 GPUs → 2 servers
assert.ok(big.crossNode && big.serversByMem === 2, "cross-node");
// Throughput can dominate; HA adds one server.
const t = C.sizeFor(100, gpu("rtxpro6000"), 90, { requiredTps: 5000, perServerTps: 1200, ha: true });
assert.strictEqual(t.serversByTps, 5);
assert.strictEqual(t.servers, 5);
assert.strictEqual(t.withHA, 6);
// Concurrency estimator: 500 users × 40% × 25% = 50.
assert.strictEqual(C.concurrentFromUsers(500, 40, 25), 50);
// formula lines carry the substituted numbers and sum to the total
const fl = C.formula(ref, b);
assert.strictEqual(fl.length, 5);
assert.ok(fl[1].sub.includes("2 × 80 × 8 × 128 × (16 ÷ 8) × 32,768 × 20"), fl[1].sub);
assert.ok(fl[0].sub.startsWith("70B × 4 ÷ 8"));
near(fl.slice(0, 4).reduce((a, x) => a + x.out, 0), fl[4].out, 1e-6, "formula parts sum to total");
// memory text: GB with TB, TB first from 1000 GB
assert.strictEqual(C.memText(308.4), "308.4 GB（0.31 TB）");
assert.strictEqual(C.memText(1523), "1.52 TB（1,523 GB）");
// GPU formula + ranked options (suggested = fewest servers, then fewest GPUs)
const sz = C.sizeFor(b.total, gpu("b300"), 90);
const gf = C.gpuFormula(b.total, gpu("b300"), 90, sz);
assert.ok(gf.sub.endsWith("= 2"), gf.sub);
const ops = C.options(b.total, C.GPUS, 90, {});
assert.ok(ops[0].size.withHA <= ops[ops.length - 1].size.withHA);
assert.strictEqual(ops[0].gpu.id, "b300", "B300 x2 is the smallest build for the reference case");
// ---- multi-model: hybrid KV, quantised weights, placement ----
const vm = id => C.VIS_MODELS.find(m => m.id === id);
// Qwen3.6-35B-A3B: 10 full-attn layers x 2 x 2 kv heads x 256 x 2 B = 20 KiB/token (+62 MiB fixed state)
near(C.kvPerRequestGB(vm("qwen36-35b"), 32768, 16) * 1e9, 20480 * 32768 + 62 * 1048576, 1, "Qwen3.6 KV/request");
// Qwen3.8-27B: 16 x 2 x 4 x 256 x 2 B = 64 KiB/token
near(C.kvPerRequestGB(vm("qwen38-27b"), 1000, 16) * 1e9 - 147 * 1048576, 65536 * 1000, 1, "Qwen3.8 KV");
// Gemma 4 31B: sliding layers stop growing at the 1024-token window; global layers keep growing
const g1 = C.kvPerRequestGB(vm("gemma4-31b"), 1024, 16), g2 = C.kvPerRequestGB(vm("gemma4-31b"), 2048, 16);
near((g2 - g1) * 1e9, 10 * 2 * 4 * 512 * 2 * 1024, 1, "Gemma growth comes only from global layers");
// the dense single-model path is unchanged (reference case still 214.7 GB)
near(C.kvGB(ref, 32768, 20, 16), 214.7, 0.1, "legacy KV");
// weights: Q4_K_M 4.85 bpw, Q8_0 8.5 bpw
const mb4 = C.modelBudget(vm("gemma4-31b"), { quant: "q4km", context: 32768, concurrent: 34, runtimeGB: 5, extraGB: 1, headroomPct: 15 });
near(mb4.weights, 19.598489952, 1e-9, "Q4_K_M weights are the real file size");
assert.ok(mb4.w.real && mb4.w.repo === "bartowski/google_gemma-4-31B-it-GGUF");
near(mb4.total, (mb4.weights + mb4.kv + 5 + 1) * 1.15, 1e-9, "model total");
// every real size must match the dated Hugging Face snapshot, and quant ratios must be plausible vs BF16
const snap = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../data/sizing-model-sizes.json"), "utf8")).repos;
C.VIS_MODELS.forEach(m => Object.entries(m.files).forEach(([q, f]) => {
  assert.strictEqual(snap[f.repo][f.file], f.bytes, `${m.id} ${q} differs from snapshot`);
  const ratio = f.bytes / m.files.bf16.bytes;
  if (q === "q4km") assert.ok(ratio > 0.25 && ratio < 0.36, `${m.id} Q4 ratio ${ratio}`);
  if (q === "q8") assert.ok(ratio > 0.5 && ratio < 0.56, `${m.id} ${q} ratio ${ratio}`);
  if (q === "fp8") assert.ok(ratio > 0.5 && ratio < 0.6, `${m.id} ${q} ratio ${ratio} (official FP8 keeps some layers in BF16)`);
}));
// MTP head follows the quant
near(C.mtpOf(C.VIS_MODELS[0], "q4km"), 1.190098816, 1e-9, "Qwen3.6 MTP Q4_0 file");
// one publisher for every GGUF size
C.VIS_MODELS.forEach(m => Object.entries(m.files).forEach(([q, f]) => { if (!/safetensors/.test(f.file) && !/^Qwen\//.test(f.repo)) assert.ok(f.repo.startsWith("bartowski/"), `${m.id} ${q} not from bartowski`); }));
// concurrency split keeps the exact total
assert.deepStrictEqual(C.splitConcurrency(100, [1, 1, 1]), [34, 33, 33]);
assert.strictEqual(C.splitConcurrency(100, [2, 1, 1]).reduce((a, b) => a + b, 0), 100);
// placement: a 170 GB model needs 2 shards of 85 GB on 96 GB cards (86.4 usable); small ones can share a GPU when packed
const P6 = gpu("rtxpro6000");
const iso = C.place([{ name: "A", total: 170 }, { name: "B", total: 40 }, { name: "C", total: 40 }], P6, 90, false);
const pk = C.place([{ name: "A", total: 170 }, { name: "B", total: 40 }, { name: "C", total: 40 }], P6, 90, true);
assert.strictEqual(iso.gpus, 4);                 // 2 + 1 + 1
assert.strictEqual(pk.gpus, 3);                  // B and C share one GPU? 40+40=80 <= 86.4
assert.ok(pk.bins.every(b => b.used <= pk.cap + 1e-9), "no bin over capacity");
// shards of one model never share a GPU
const tp = C.place([{ name: "A", total: 200 }], P6, 90, true);
assert.strictEqual(tp.gpus, 4); assert.ok(tp.bins.every(b => b.shards.length === 1));
assert.strictEqual(C.sci("(W + KV + R + E) × (1 + h)"), "(<var>W</var> + <var>KV</var> + <var>R</var> + <var>E</var>) × (1 + <var>h</var>)");
// calculation box: variables as <var>, subscripts, one box, exactly one highlighted result row
assert.strictEqual(C.sci("M_weights = P × b ÷ 8"), "<var>M<sub>weights</sub></var> = <var>P</var> × <var>b</var> ÷ 8");
assert.ok(C.sci("2 × L × H_KV × D × (b_KV ÷ 8) × T × C").includes("<var>H<sub>KV</sub></var>"));
const box = C.calcBoxHtml({ line: "M_required = M_weights + M_KV", legend: C.legendFor(ref, b), sections: [{ rows: C.formula(ref, b) }] });
assert.strictEqual((box.match(/class="sz-row fin"/g) || []).length, 1, "one highlighted M_required row");
assert.strictEqual((box.match(/sz-legend/g) || []).length, 1);
assert.ok(box.includes("模型總參數量") && box.includes("70 B"), "legend carries meaning and current value");
assert.ok(box.includes("= 38.5 GB（0.04 TB）") && box.includes("= 308.5 GB（0.31 TB）"), "numeric results are formatted as GB (TB)");
assert.ok(!/= \d+\.\d{4,}/.test(box), "no raw floating point numbers");
// options that need cross-node TP are never ranked above practical ones
const refOps = C.options(b.total, C.GPUS, 90, {});
const firstCross = refOps.findIndex(o => o.size.crossNode);
assert.ok(firstCross > 0 && refOps.slice(firstCross).every(o => o.size.crossNode), "cross-node options come last");
assert.ok(!refOps[0].size.crossNode, "the suggested option is practical");
// per-server counts follow the TPI test machines (B60: 4 GPUs = 96 GB, B70: 2 GPUs = 64 GB)
assert.strictEqual(C.GPUS.find(g => g.id === "b60").perServer * C.GPUS.find(g => g.id === "b60").vram, 96);
assert.strictEqual(C.GPUS.find(g => g.id === "b70").perServer * C.GPUS.find(g => g.id === "b70").vram, 64);
console.log("sizing-core: all assertions passed");
