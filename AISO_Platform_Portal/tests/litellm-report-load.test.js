/* The LiteLLM page script must load without throwing and must draw the four function cards and an empty result slot.
   Runs the real file against a minimal fake DOM (no browser needed). */
const fs = require("fs"), path = require("path"), assert = require("assert");
const html = fs.readFileSync(path.join(__dirname, "..", "litellm-report.html"), "utf8");
const ids = [...html.matchAll(/id="(lr[A-Za-z0-9]+)"/g)].map(m => m[1]);
const els = {};
const mk = id => (els[id] = { id, innerHTML: "", textContent: "", hidden: new RegExp("id=\"" + id + "\"[^>]*\\bhidden").test(html), className: "", classList: { toggle() {}, add() {}, remove() {} }, style: {}, children: [],
  addEventListener() {}, querySelector() { return mk("_q"); }, querySelectorAll() { return []; }, insertAdjacentHTML() {}, firstChild: { nodeValue: "" }, scrollTop: 0, clientHeight: 0, scrollHeight: 0, appendChild() {} });
ids.forEach(mk);
global.document = { getElementById: id => els[id] || mk(id), createElement: () => mk("_c"), createRange: () => ({ selectNodeContents() {} }) };
global.window = { matchMedia: () => ({ matches: false }), RunGate: null };
global.matchMedia = window.matchMedia; global.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
global.fetch = () => Promise.reject(new Error("offline"));      // the public site has no backend
global.setInterval = () => 0; global.clearInterval = () => {}; global.navigator = {};
require("vm").runInThisContext(fs.readFileSync(path.join(__dirname, "..", "litellm-report.js"), "utf8"), { filename: "litellm-report.js" });
const rows = (els.lrFuncs.innerHTML.match(/<li[ >]/g) || []).length;
assert.strictEqual(rows, 4, "exactly four sentences");
assert.ok(/Apps call one address/.test(els.lrFuncs.innerHTML) && /Faster response, higher throughput/.test(els.lrFuncs.innerHTML) && /another keeps answering/.test(els.lrFuncs.innerHTML) && /Add a machine to the list/.test(els.lrFuncs.innerHTML), "the four benefits are drawn");
assert.ok(!/\d\.\d+ s/.test(els.lrFuncs.innerHTML), "no result numbers before a test has run");
assert.strictEqual(els.lrConcl.hidden, true, "results stay hidden until a test has finished");
assert.ok(/lr-plan/.test(els.lrRun.innerHTML), "stage list drawn");
assert.strictEqual(els.lrPrev.hidden, true, "no previous run to show on a fresh browser");
console.log("litellm-report page script: ok");
