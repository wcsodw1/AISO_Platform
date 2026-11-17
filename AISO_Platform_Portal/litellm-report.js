/* LiteLLM gateway: the same benchmark with and without LiteLLM, on our real machines and models.
   KPI = TTFT, TPOT and TPS (Normalized and Aggregate), each at three input sizes. Numbers shown before a run are the mean of two earlier
   smoke-test runs on 2026-11-17 (the same code path as the Run button). No addresses, keys or paths. */
(function () {
  "use strict";
  var M = { a: "AISO1", b: "PRO6000", ma: "Gemma 4 26B Q4", mb: "Gemma 4 26B BF16" };
  var D = {
    tested: "2026-11-17", np: 4,
    sizes: [{"key": "short", "tok": 29, "a": {"ttft_s": 2.67, "tpot_ms": 23.4, "agg_tps": 79.2, "norm_tps": 19.8}, "ab": {"ttft_s": 0.7, "tpot_ms": 15.6, "agg_tps": 127.7, "norm_tps": 31.9}}, {"key": "mid", "tok": 110, "a": {"ttft_s": 2.96, "tpot_ms": 24.8, "agg_tps": 72.8, "norm_tps": 18.2}, "ab": {"ttft_s": 0.73, "tpot_ms": 11.8, "agg_tps": 137.6, "norm_tps": 34.4}}, {"key": "long", "tok": 910, "a": {"ttft_s": 4.77, "tpot_ms": 31.2, "agg_tps": 49.1, "norm_tps": 12.2}, "ab": {"ttft_s": 1.46, "tpot_ms": 21.1, "agg_tps": 82.2, "norm_tps": 20.5}}],
    notes: [
      [M.a + " runs Q4 and " + M.b + " runs BF16: not like-for-like. The gain shows gateway scaling, not a hardware ranking.", M.a + " 用 Q4、" + M.b + " 用 BF16，精度不同；倍數代表閘道分流效果，不是機器排名"],
      ["Both machines are shared with other users. Numbers move between runs.", "兩台機器都與他人共用，每次跑的數字會浮動"],
      ["Without LiteLLM = " + M.a + " only (today's setup). With LiteLLM = the same requests spread over both machines. TTFT drops mostly because fewer requests wait in a queue.", "沒有 LiteLLM ＝ 只接 " + M.a + "（現況）；有 LiteLLM ＝ 同樣的請求分給兩台。TTFT 變短主要是排隊的請求變少"],
      ["An app can also split between the two machines by itself and gets about the same speed. LiteLLM saves each app from writing that.", "應用自己手動分流速度差不多；LiteLLM 的價值是每個應用都不用自己寫"],
      ["Tokens are counted as streamed pieces; output is capped at 100 tokens per request.", "token 以串流片段計算；每個請求輸出上限 100 個 token"],
      ["It is one more service to run and keep alive.", "多了一個要維運的服務"]
    ]
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f1 = function (n) { return n.toFixed(1); }, f2 = function (n) { return n.toFixed(2); };

  /* ---------- KPI: four metrics, each Without -> With LiteLLM at three input sizes ---------- */
  var notes = '<div class="lr-notes" tabindex="0"><span class="lr-nb">Notes<small class="zhs"> 備註</small></span><div class="lr-nf"><ul>' +
    D.notes.map(function (n) { return "<li>" + esc(n[0]) + "<small>" + esc(n[1]) + "</small></li>"; }).join("") + "</ul></div></div>";
  var SIZE = { short: ["Short", "一句話"], mid: ["Medium", "中等"], long: ["Long", "很長"] };
  /* lower is better for TTFT and TPOT, higher is better for TPS */
  var METRICS = [
    { f: "ttft_s", name: "TTFT", zh: "首字等待", low: true, show: function (v) { return f2(v) + " s"; } },
    { f: "tpot_ms", name: "TPOT", zh: "每字間隔", low: true, show: function (v) { return f1(v) + " ms"; } },
    { f: "norm_tps", name: "TPS · Normalized", zh: "單一請求", low: false, show: function (v) { return f1(v); } },
    { f: "agg_tps", name: "TPS · Aggregate", zh: "全部請求", low: false, show: function (v) { return f1(v); } }
  ];
  function change(m, a, ab) {
    var pct = m.low ? (1 - ab / a) * 100 : (ab / a - 1) * 100;      // positive = better with LiteLLM
    return { txt: m.low ? (pct >= 0 ? "−" + Math.round(pct) + "%" : "+" + Math.round(-pct) + "%") : "×" + (ab / a).toFixed(2), good: pct >= 0 };
  }
  function conclusion(live) {
    var el = $("lrConcl");
    el.classList.toggle("prelim", !live);
    var cards = METRICS.map(function (m) {
      var rows = D.sizes.map(function (z) {
        var c = change(m, z.a[m.f], z.ab[m.f]);
        return '<div class="lr-mr"><span class="lr-ms">' + SIZE[z.key][0] + '<small class="zhs">' + SIZE[z.key][1] + " · " + z.tok + ' tok</small></span>' +
          '<span class="lr-mv"><i class="no">' + m.show(z.a[m.f]) + '</i><em aria-hidden="true">→</em><i class="yes">' + m.show(z.ab[m.f]) + '</i></span><b class="' + (c.good ? "good" : "bad") + '">' + c.txt + "</b></div>";
      }).join("");
      var mean = D.sizes.reduce(function (t, z) { return t + (m.low ? 1 - z.ab[m.f] / z.a[m.f] : z.ab[m.f] / z.a[m.f]); }, 0) / D.sizes.length;
      var hero = m.low ? "−" + Math.round(mean * 100) + "%" : "×" + mean.toFixed(2);
      return '<div class="lr-kpi"><h4>' + m.name + '<small class="zhs">' + m.zh + '</small></h4><p class="lr-dir">' + (m.low ? "Lower is better" : "Higher is better") + '<small class="zhs">' + (m.low ? "越低越好" : "越高越好") + '</small></p>' + rows +
        '<p class="lr-kd"><b>' + hero + '</b><span>on average<small class="zhs">平均</small></span></p></div>';
    }).join("");
    el.innerHTML = '<span class="lr-cl">KPI<small class="zhs">速度差異</small>' + (live ? '<em class="lr-live">LIVE · ' + esc(D.liveAt || "") + '</em>' : '<em class="lr-pend">Preliminary<small class="zhs">先前兩次實測平均，待這次實測</small></em>') + '</span>' + notes +
      '<p class="lr-cols"><span>Without LiteLLM<small class="zhs">沒有 LiteLLM · ' + M.a + ' only</small></span><em aria-hidden="true">→</em><span>With LiteLLM<small class="zhs">有 LiteLLM · ' + M.a + ' + ' + M.b + '</small></span></p>' +
      '<div class="lr-kpis">' + cards + "</div>";
  }
  conclusion(false);

  /* ---------- 1 · the picture: real clients, real machines, real models ---------- */
  var W = 560, CH = 30;
  var rect = function (x, y, w, h, fill, stroke, sw) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw || 1.5) + '"/>'; };
  var txt = function (x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.a || "middle") + '" fill="' + (o.c || "#f3efe5") + '" font-size="' + (o.s || 18) + '" font-weight="' + (o.w || 700) + '">' + esc(t) + "</text>"; };
  var line = function (x1, y1, x2, y2, c) { return '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="' + c + '" stroke-width="2" fill="none"/>'; };
  var APPS = ["Office AI", "AISO Platform", "Scripts"], AY = [40, 140, 240];
  var MA = { y: 14, h: 158, title: M.a, chips: ["Gemma 4 26B Q4", "Qwen3.6 35B Q4", "Qwen3.8 27B Q4"], c: ["rgba(193,154,107,.12)", "#c19a6b"] };
  var MB = { y: 196, h: 122, title: M.b, chips: ["Gemma 4 26B BF16", "Gemma 4 E4B"], c: ["rgba(157,184,140,.12)", "#9db88c"] };
  var machine = function (m, x, w) {
    var s = rect(x, m.y, w, m.h, m.c[0], m.c[1]) + txt(x + 14, m.y + 28, m.title, { a: "start", s: 20 });
    m.chips.forEach(function (c, i) { s += rect(x + 12, m.y + 42 + i * 36, w - 24, CH, "rgba(255,255,255,.07)", "rgba(255,255,255,.18)", 1) + txt(x + w / 2, m.y + 42 + i * 36 + 21, c, { s: 17, w: 600 }); });
    return s;
  };
  var apps = function () { return APPS.map(function (a, i) { return rect(8, AY[i], 150, 44, "rgba(255,255,255,.06)", "#a89c88") + txt(83, AY[i] + 29, a, { s: 18 }); }).join(""); };
  var MX = 330, MW = 222;
  var svgWithout = apps() + AY.map(function (y) { return line(158, y + 22, MX, MA.y + 30, "#d98a66") + line(158, y + 22, MX, MB.y + 30, "#d98a66"); }).join("") + machine(MA, MX, MW) + machine(MB, MX, MW);
  var svgWith = apps() + AY.map(function (y) { return line(158, y + 22, 188, 168, "#a89c88"); }).join("") +
    rect(188, 132, 84, 72, "rgba(214,178,107,.14)", "#d6b26b", 2) + txt(230, 174, "LiteLLM", { c: "#d6b26b", s: 17, w: 800 }) +
    line(272, 150, MX, MA.y + 60, "#d6b26b") + line(272, 186, MX, MB.y + 60, "#d6b26b") + machine(MA, MX, MW) + machine(MB, MX, MW);
  var svg = function (inner, label) { return '<svg class="lr-svg" viewBox="0 0 ' + W + ' 330" role="img" aria-label="' + label + '">' + inner + "</svg>"; };
  $("lrFlow").innerHTML = '<div class="lr-vs">' +
    '<div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LiteLLM</small></h3>' + svg(svgWithout, "Three clients each connect to both machines: six links") +
    '<p class="lr-pt">To use both machines, every app needs <b>6 links</b> and its own split and failover code<small class="zhs">要兩台一起用，每個應用都要 6 條連線，並自己寫分流與備援</small></p></div>' +
    '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3>' + svg(svgWith, "Three clients connect to one gateway, which connects to both machines") +
    '<p class="lr-pt"><b>1 place</b> holds the split, failover and keys; apps stay the same<small class="zhs">分流、備援、金鑰都在一個地方，應用都不用改</small></p></div></div>';


  /* ---------- the four things LiteLLM does, in plain words, each with its proof status ---------- */
  var FUNCS = [
    ["One entry", "統一入口", "Apps use one address and one key.", "應用只用一個位址和一把金鑰", "Used in every test", "每項測試都用到", "ok"],
    ["Spread requests", "分流", "Requests are shared by both machines.", "請求分給兩台機器一起處理", "Measured below ↓", "下方有實測數字", "ok"],
    ["Switch on failure", "故障切換", "A broken machine is skipped; the other one answers.", "壞掉的機器被跳過，改由另一台回答", "PoC: 10 / 10 answered with one machine off", "PoC：關掉一台，10 個問題都有回覆", "poc"],
    ["Key limits", "金鑰管控", "A key can only use the models it is given.", "金鑰只能用被授權的模型", "PoC: another model was refused", "PoC：用別的模型會被拒絕", "poc"]
  ];
  $("lrFuncs").innerHTML = FUNCS.map(function (f, i) {
    return '<div class="lr-fn"><h4><i>' + (i + 1) + "</i>" + f[0] + '<small class="zhs">' + f[1] + '</small></h4><p>' + f[2] + '<small class="zhs">' + f[3] + '</small></p><span class="lr-proof ' + f[6] + '">' + f[4] + '<small class="zhs">' + f[5] + "</small></span></div>";
  }).join("");

  /* ---------- smoke test: runs on the LOCAL platform only (needs the backend described in the design) ---------- */
  var logNext = 0, API = "/api/litellm", runEl = $("lrRun"), job = null, poll = null;

  /* What the smoke test does, as ticking checklists. Mirrors plan() in benchmark/litellm_smoke.py (the backend sends its own copy when available). */
  var it = function (en, zh) { return { label: en, zh: zh }; };
  var PLAN = { steps: [
    { name: "Preflight", zh: "檢查", sends: [], items: [it("Gateway is up", "閘道正常"), it("Machines reachable", "機器連得到"), it("Nothing else is running", "沒有其他測試在跑"), it("Test key and model present", "測試金鑰與模型都在")] },
    { name: "Benchmark", zh: "速度", sends: [{ prompt: "Short passage + “Now write about 80 words about Taipei night markets.”", tokens: 100, meta: "8 requests, 4 at once, x 2" }], items: [it("Short input", "一句話"), it("About 100 input tokens", "約 100 個 input token"), it("About 1000 input tokens", "約 1000 個 input token"), it("LiteLLM raises Aggregate TPS at least 1.3x (mean)", "LiteLLM 讓 Aggregate TPS 平均至少 1.3 倍")] }
  ] };
  var TICK = { wait: "○", run: "◔", ok: "✓", fail: "✗", skip: "–" }, DONE = { wait: ["Waiting", "等待"], run: ["Running", "執行中"], ok: ["complete", "完成"], fail: ["failed", "未通過"], skip: ["skipped", "略過"] };
  var shown = {};   // item states already drawn, so only a newly finished item pops
  function planHtml(st, items) {
    return '<ol class="lr-plan">' + PLAN.steps.map(function (p, i) {
      var x = (st && st[i]) || { state: "wait", detail: "" }, lab = DONE[x.state] || DONE.wait, its = (items && items[i]) || [];
      var q = (p.sends || []).map(function (q) { return '<p class="lr-qs"><span class="lr-q">“' + esc(q.prompt) + '”</span><span class="lr-meta">' + esc(q.meta || "") + "</span></p>"; }).join("");
      var list = p.items.map(function (m, j) {
        var y = its[j] || { state: "wait", value: "" }, key = i + "-" + j, pop = (y.state === "ok" || y.state === "fail") && shown[key] !== y.state;
        shown[key] = y.state;
        return '<li class="' + esc(y.state) + (pop ? " pop" : "") + '"><i aria-hidden="true">' + (TICK[y.state] || "○") + '</i><span>' + esc(m.label) + '<small class="zhs">' + esc(m.zh) + "</small></span>" + (y.value ? "<b>" + esc(y.value) + "</b>" : "") + "</li>";
      }).join("");
      var done = x.state === "ok" ? "✓ " + (i + 1) + " · " + esc(p.name) + " " + lab[0] : x.state === "fail" ? "✗ " + (i + 1) + " · " + esc(p.name) + " " + lab[0] : x.state === "skip" ? "– " + (i + 1) + " · " + esc(p.name) + " " + lab[0] : x.state === "run" ? "… " + lab[0] : "○ " + lab[0];
      return '<li class="' + esc(x.state) + '"><div class="lr-ph"><b>' + (i + 1) + " · " + esc(p.name) + '<small class="zhs">' + esc(p.zh) + "</small></b></div>" + q + '<ul class="lr-ck">' + list + '</ul><p class="lr-done ' + esc(x.state) + '">' + done + '<small class="zhs">' + lab[1] + "</small></p>" + (x.state === "skip" ? '<p class="lr-skiphint">Not measured. Tick “Include ' + esc(M.b) + '” and run again.<small class="zhs">這項沒有量；勾選「包含 ' + esc(M.b) + '」後再跑一次</small></p>' : "") + "</li>";
    }).join("") + "</ol>";
  }
  function runUI(mode, msg, st, items) {
    runEl.innerHTML = '<div class="lr-runrow"><button type="button" class="lr-runbtn' + (mode === "running" ? " busy" : "") + '" id="lrRunBtn"' + (mode === "ready" ? "" : " disabled") + '><span>' + (mode === "running" ? "Running" : "Run smoke test") + '</span><small class="zhs">' + (mode === "running" ? "執行中" : "實測") + '</small><i aria-hidden="true">→</i></button><span class="lr-runmsg">' + (msg || "") + "</span></div>" + planHtml(st, items);
    var row = runEl.querySelector(".lr-runrow");
    row.insertAdjacentHTML("beforeend", '<span class="lr-pwnote">*Test password: ask staff<small class="zhs">測試密碼請洽工作人員</small></span>');
    row.insertAdjacentHTML("afterend", '<div class="lr-lights" id="lrLights" role="status" aria-label="Connection status">' + lightsHtml() + "</div>");
    if (mode === "ready") $("lrRunBtn").onclick = startRun;
  }
  var info = function (en, zh) { return en + '<small class="zhs">' + zh + "</small>"; };

  /* terminal: the log lines of the run, as the backend writes them */
  function termReset(first) { var b = $("lrTermBody"); b.textContent = ""; if (first) termAdd([first]); $("lrTerm").hidden = false; }
  function termAdd(lines) {
    var b = $("lrTermBody"), stick = b.scrollTop + b.clientHeight >= b.scrollHeight - 30;
    lines.forEach(function (l) { var d = document.createElement("div"); d.textContent = l; d.className = /ALL PASS|\bPASS\b/.test(l) ? "ok" : /FAIL|NOT CONFIRMED|skipped/.test(l) ? "bad" : /^\S+\s+\[\d\/\d\]|^\$/.test(l) ? "hd" : ""; b.appendChild(d); });
    if (stick) b.scrollTop = b.scrollHeight;
    $("lrTermN").textContent = b.children.length + " lines";
  }

  /* connection lights: one per thing the test needs; a red light says why */
  var lights = [], healthB = null;
  var WHY = { "no connection": ["No connection", "連不上"], "gateway unreachable": ["Gateway down", "閘道連不上"], "not set": ["Not set", "沒設定"], "refused by the gateway": ["Key refused", "金鑰被拒"] };
  function why(d) { if (WHY[d]) return WHY[d][0] + '<small class="zhs">' + WHY[d][1] + "</small>"; if (/benchmark/i.test(d)) return 'Benchmark running<small class="zhs">有測試在跑</small>'; return esc(d); }
  function lightsHtml() {
    return lights.map(function (l) { return '<span class="lr-light ' + (l.ok ? "ok" : "bad") + '"><i aria-hidden="true"></i><span class="lr-ln2">' + esc(l.name) + "</span>" + (l.ok ? "" : '<em>' + why(l.detail) + "</em>") + "</span>"; }).join("");
  }
  function refreshHealth() {
    fetch(API + "/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.checks) return;
      lights = d.checks; var b = lights.filter(function (c) { return c.name === M.b; })[0]; healthB = b ? b.ok : null;
      var el = $("lrLights"); if (el) el.innerHTML = lightsHtml();
    }).catch(function () {});
  }
  function checkStatus() {
    runUI("checking", "");
    fetch(API + "/status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
      if (d && d.ok) { fetch(API + "/plan", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (pl) { if (pl && pl.steps) { PLAN = pl; if (!job || !poll) runUI("ready", ""); } }).catch(function () {}); runUI("ready", ""); }
      else runUI("off", info("The gateway is not reachable from this platform.", "平台連不到閘道") + (d && d.reason ? " · " + esc(d.reason) : ""));
    }).catch(function () { runUI("off", info("Local platform only: needs the smoke-test backend on this computer.", "只能在本機平台按；需要本機裝上 smoke test 後端")); });
  }
  function startRun() {
    if (!window.RunGate) { runUI("ready", info("Test-password dialog is not loaded.", "測試密碼視窗沒有載入")); return; }
    runUI("running", "");
    RunGate.ticket().then(function (t) { return fetch(API + "/smoke", { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": t }, body: "{}" }); })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
      .then(function (d) { job = d.job_id; logNext = 0; termReset(""); poll = setInterval(tick, 1000); tick(); })
      .catch(function (e) { runUI("ready", /Cancelled/.test(String(e && e.message)) ? info("Cancelled. No password was entered.", "已取消，沒有輸入密碼") : esc(e.message || e)); });
  }
  function tick() {
    fetch(API + "/smoke/" + job + "?since=" + logNext, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.log) { termAdd(d.log); logNext = d.log_next; }
      runUI("running", "", d.steps, d.items);
      if (d.state === "running" || d.state === "queued") return;
      clearInterval(poll); poll = null;
      if (d.state === "done" && d.result) applyLive(d.result, d.steps, d.items); else runUI("ready", info("Stopped: ", "已停止：") + esc(d.error || d.state), d.steps, d.items);
    }).catch(function () { clearInterval(poll); poll = null; runUI("ready", info("Lost contact with the platform.", "和平台失去連線")); });
  }
  /* result: bench.sizes[{key, tokens, a:{ttft_s,tpot_ms,agg_tps,norm_tps}, ab:{...}, gain_agg}], bench.gain_agg, bench.pass */
  function applyLive(r, steps, items) {
    D.sizes = r.bench.sizes.map(function (z) { return { key: z.key, tok: z.tokens, a: z.a, ab: z.ab }; });
    D.np = r.bench.np; D.live = true; D.liveAt = r.finished || new Date().toLocaleTimeString();
    conclusion(!!r.bench.pass);
    runUI("ready", r.bench.pass ? "" : info("Done. The gain is below 1.3x, so this is not confirmed.", "完成，但提升低於 1.3 倍，不算確認"), steps, items);
  }

  var termBig = false;
  $("lrTermBig").onclick = function () { termBig = !termBig; $("lrTermBody").classList.toggle("big", termBig); this.firstChild.nodeValue = termBig ? "Collapse " : "Expand "; this.querySelector("small").textContent = termBig ? "收合" : "展開全部"; };
  $("lrTermCopy").onclick = function () { var t = $("lrTermBody").innerText, b = this; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.querySelector("small").textContent = "已複製"; setTimeout(function () { b.querySelector("small").textContent = "複製"; }, 1500); }).catch(function () { var r = document.createRange(); r.selectNodeContents($("lrTermBody")); var g = getSelection(); g.removeAllRanges(); g.addRange(r); }); };
  var scriptLoaded = false;
  $("lrScriptBox").addEventListener("toggle", function () {
    if (!this.open || scriptLoaded) return;
    fetch(API + "/script", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) { $("lrScript").textContent = d.text; scriptLoaded = true; })
      .catch(function () { $("lrScript").textContent = "The script is shown on the local platform only.\nIt lives in the repository at benchmark/litellm_smoke.py."; });
  });
  checkStatus();
  refreshHealth(); setInterval(function () { if (!poll) refreshHealth(); }, 10000);
})();
