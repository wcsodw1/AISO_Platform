// Run: node AISO_Platform_Portal/tests/repeat-chart.test.js
const assert = require("assert");
const RC = require("../repeat-chart.js");

// Normalized TPS per repeat = per-repeat Aggregate ÷ NP
const run = { np: 2, input: 8192, repeats: { aggregate_tps: [33.84, 33.9, 33.93], ttft_s: [17, 18, 17.5] } };
assert.deepStrictEqual(RC.repeatsOf(run, "norm_tps").map(v => +v.toFixed(2)), [16.92, 16.95, 16.96]);
assert.deepStrictEqual(RC.repeatsOf(run, "ttft_s"), [17, 18, 17.5]);
assert.strictEqual(RC.repeatsOf(run, "tpot_ms"), null, "missing metric must stay missing");
assert.strictEqual(RC.repeatsOf({ np: 1 }, "ttft_s"), null, "run without repeats");

// axis: always starts at 0 and covers the max
let ax = RC.niceAxis(32.9); assert.ok(ax.ticks[0] === 0 && ax.max >= 32.9 && ax.ticks.length >= 4, JSON.stringify(ax));
ax = RC.niceAxis(0.8); assert.ok(ax.max >= 0.8 && ax.step <= 0.25);
assert.ok(RC.niceAxis(0).max > 0);

// spread: (max-min)/mean, worst input reported
const s = RC.spread([{ input: 4096, values: [10, 10, 10] }, { input: 8192, values: [9, 10, 11] }, { input: 16384, values: null }]);
assert.strictEqual(s.input, 8192); assert.ok(Math.abs(s.pct - 0.2) < 1e-9);

// html: card per machine, honest missing messages, 3 lines for 3 repeats
const runs = k => k === "a" ? [4096, 8192, 16384].map(i => ({ np: 1, input: i, repeats: { aggregate_tps: [30, 31, 32] } })) : k === "b" ? [{ np: 1, input: 4096 }] : [];
const out = RC.html({ machines: [{ key: "a", label: "A", color: "#fff" }, { key: "b", label: "B", color: "#fff" }, { key: "c", label: "C", color: "#fff" }],
  runsFor: runs, metric: "aggregate_tps", inputs: [4096, 8192, 16384], np: 1, title: "Gemma26 / NP1" });
assert.strictEqual((out.match(/class="rp-line"/g) || []).length, 3, "three repeat lines");
assert.ok(out.includes("各輸入長度均已完成 Repeat 3"));
assert.ok(out.includes("沒有逐次 Repeat"), "machine with averages only");
assert.ok(out.includes("此組合沒有資料"), "machine without data");
console.log("repeat-chart: all assertions passed");
