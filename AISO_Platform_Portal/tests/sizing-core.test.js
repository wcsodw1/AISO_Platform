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
console.log("sizing-core: all assertions passed");
