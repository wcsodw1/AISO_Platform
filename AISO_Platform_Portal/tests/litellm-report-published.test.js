/* With no run in this browser, the page shows the published run (data/litellm-published-run.json) in the Spread load card. */
const fs = require("fs"), path = require("path"), assert = require("assert");
const html = fs.readFileSync(path.join(__dirname, "..", "litellm-report.html"), "utf8");
const pub = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "litellm-published-run.json"), "utf8"));
const els = {};
const mk = id => (els[id] = { id, innerHTML: "", textContent: "", hidden: new RegExp("id=\"" + id + "\"[^>]*\\bhidden").test(html), className: "", classList: { toggle() {}, add() {}, remove() {} }, style: {}, children: [],
  addEventListener() {}, querySelector() { return mk("_q"); }, querySelectorAll() { return []; }, insertAdjacentHTML() {}, firstChild: { nodeValue: "" }, scrollTop: 0, clientHeight: 0, scrollHeight: 0, appendChild() {} });
[...html.matchAll(/id="(lr[A-Za-z0-9]+)"/g)].forEach(m => mk(m[1]));
global.document = { getElementById: id => els[id] || mk(id), createElement: () => mk("_c"), createRange: () => ({ selectNodeContents() {} }) };
global.window = { matchMedia: () => ({ matches: false }), RunGate: null };
global.matchMedia = window.matchMedia; global.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
global.fetch = url => /litellm-published-run\.json$/.test(url) ? Promise.resolve({ ok: true, json: () => Promise.resolve(pub) }) : Promise.reject(new Error("offline"));
global.setInterval = () => 0; global.clearInterval = () => {}; global.navigator = {};
require("vm").runInThisContext(fs.readFileSync(path.join(__dirname, "..", "litellm-report.js"), "utf8"), { filename: "litellm-report.js" });
setTimeout(() => {
  assert.ok(!/Run the test to see the numbers/.test(els.lrFuncs.innerHTML), "published numbers replace the empty note");
  assert.ok(/lr-charts/.test(els.lrFuncs.innerHTML), "line charts drawn from the published run");
  console.log("litellm-report published run: ok");
}, 50);
