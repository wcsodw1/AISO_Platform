/* LiteLLM gateway: with vs without, on our real machines and models.
   Every number comes from one proof-of-concept run on 2026-11-17 (pass criteria fixed before the run, real requests, nothing mocked).
   The scenarios on this page REPLAY that run; nothing here calls a live gateway. No addresses, keys or paths. */
(function () {
  "use strict";
  var M = { a: "AISO1", b: "PRO6000", ma: "Gemma 4 26B Q4", mb: "Gemma 4 26B BF16" };
  var D = {
    tested: "2026-11-17",
    nreq: 8, load: "8 requests, 4 at once, median of 3 repeats; mean of 2 earlier runs",
    sec: { a: 7.1, b: 5.7, hand: 3.5, ab: 4.1 },
    cost: { direct: 0.16, gw: 0.2, add: 0.04 },
    wrong: { direct: 200, key: 403 },
    fail: { n: 10, direct: 0, gw: 10, median: 1.31 },
    ctl: { block: 6, cap: 0.0005 },
    usage: [["Key 1 · limited", "金鑰 1・限定", 0.00015], ["Key 2 · open", "金鑰 2・不設限", 0.000126]],
    notes: [
      ["An app can also split between the two machines by itself and gets about the same speed (a little faster, since there is no gateway in between). The gain of LiteLLM is that no app has to write the split, the failover or the key checks.", "應用自己手動分流，速度差不多（略快一點，因為中間沒有閘道）；LiteLLM 的價值是每個應用都不用自己寫分流、備援和金鑰檢查"],
      [M.a + " runs Q4 and " + M.b + " runs BF16: not like-for-like. The gain shows gateway scaling, not a hardware ranking.", M.a + " 用 Q4、" + M.b + " 用 BF16，精度不同；倍數代表閘道分流效果，不是機器排名"],
      ["Both machines are shared with other users. Timings move a little between runs.", "兩台機器都與他人共用，每次跑的時間會有些浮動"],
      ["Failover: the first PoC run failed 2 of 10 (a retry could land on the dead machine again). We added a fixed fallback to " + M.a + ", reran, 10 of 10 passed.", "備援：PoC 第一次跑 10 個失敗 2 個（重試可能又選到壞掉的機器）；加上固定改送 " + M.a + " 的備援後重跑，10 個全過"],
      ["Failover cuts only our own connection to " + M.b + " and restores it after the test. The machine itself is not touched.", "備援測試只切斷我們這邊到 " + M.b + " 的連線，測完還原，沒有動機器本身"],
      ["Budget: spend is recorded a few seconds late, so a key can pass its cap before it is blocked (5× over on test backends, not seen with real models).", "預算：用量晚幾秒才記帳，所以可能超過上限才被擋（測試後端曾超過 5 倍，真實模型沒有看到）"],
      ["It is one more service to run and keep alive.", "多了一個要維運的服務"]
    ]
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f1 = function (n) { return n.toFixed(1); }, f2 = function (n) { return n.toFixed(2); };
  var gain, gainB, gainH; function recalc() { gain = D.sec.a / D.sec.ab; gainB = D.sec.b / D.sec.ab; gainH = D.sec.hand / D.sec.ab; } recalc();
  var raf = null, timer = null, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stop = function () { if (raf) cancelAnimationFrame(raf); if (timer) clearInterval(timer); raf = timer = null; };

  /* ---------- conclusion ---------- */
  var notes = '<div class="lr-notes" tabindex="0"><span class="lr-nb">Notes<small class="zhs"> 備註</small></span><div class="lr-nf"><ul>' +
    D.notes.map(function (n) { return "<li>" + esc(n[0]) + "<small>" + esc(n[1]) + "</small></li>"; }).join("") + "</ul></div></div>";
  /* The conclusion is PRELIMINARY until the smoke test has run on this platform (David, 2026-11-17).
     Replay data (proof-of-concept run) -> "Preliminary estimate". A live smoke test result -> "Confirmed". */
  function conclusion(live) {
    var el = $("lrConcl"), dmax = Math.max(D.cost.direct, D.cost.gw);
    el.classList.toggle("prelim", !live);
    /* [name, zh, tag, without label, with label, hero, hero en, hero zh, without bar 0..1 or null, with bar 0..1 or null] */
    var cards = [
      ["Speed", "速度", "", f1(D.sec.a) + " s", f1(D.sec.ab) + " s", f1(gain) + "×", "faster", "更快", 1, D.sec.ab / D.sec.a],
      ["Delay per request", "單次延遲", "", f2(D.cost.direct) + " s", f2(D.cost.gw) + " s", "+" + f2(D.cost.add) + " s", "the cost", "代價", D.cost.direct / dmax, D.cost.gw / dmax],
      ["Unauthorized model", "打到沒授權的模型", "", "answered · " + D.wrong.direct + "|照樣回答", "refused · " + D.wrong.key + "|被拒絕", "blocked", "by the key", "被金鑰擋下", null, null],
      ["Machine down", "機器掛掉", "PoC", "0 / " + D.fail.n + " answered", D.fail.gw + " / " + D.fail.n + " answered", "+" + D.fail.gw, "answered", "有回覆", 0, D.fail.gw / D.fail.n]
    ].map(function (k) {
      var row = function (cls, en, zh, label, frac) {
        return '<div class="lr-kr ' + cls + '"><span class="lr-kl">' + en + '<small class="zhs">' + zh + '</small></span>' +
          (frac === null ? '<b class="lr-kpill">' + esc(String(label).split("|")[0]) + (String(label).split("|")[1] ? '<small class="zhs">' + esc(String(label).split("|")[1]) + "</small>" : "") + '</b>' : '<i class="lr-kbar"><u style="width:' + Math.max(frac * 100, frac > 0 ? 3 : 0).toFixed(1) + '%"></u></i><b>' + esc(label) + '</b>') + '</div>';
      };
      return '<div class="lr-kpi"><h4>' + k[0] + '<small class="zhs">' + k[1] + '</small>' + (k[2] ? '<em class="lr-tag">' + k[2] + '</em>' : "") + '</h4>' +
        '<p class="lr-kd"><b>' + k[5] + '</b><span>' + k[6] + '<small class="zhs">' + k[7] + '</small></span></p>' +
        row("no", "Without", "沒有", k[3], k[8]) + row("yes", "With", "有", k[4], k[9]) + '</div>';
    }).join("");
    el.innerHTML = '<span class="lr-cl">KPI<small class="zhs">效果差異</small>' + (live ? '<em class="lr-live">LIVE · ' + esc(D.liveAt || "") + '</em>' : '<em class="lr-pend">Preliminary<small class="zhs">初步估算，待實測</small></em>') + '</span>' + notes + '<div class="lr-kpis">' + cards + '</div>';
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

  /* ---------- 2 · replays ---------- */
  var TABS = [["speed", "Speed", "速度"], ["fail", "Failover", "備援"], ["control", "Control", "管控"]];
  var cur = "speed";
  var solved = function (en, zh) { return '<p class="lr-solve"><span>Solves<small class="zhs">解決</small></span> ' + en + '<small class="zhs">' + zh + "</small></p>"; };
  var lane = function (id, label) { return '<div class="lr-lane"><span class="lr-ln">' + label + '</span><span class="lr-sq" id="' + id + '"></span></div>'; };

  function paintLanes(withG, t) {
    var n = D.nreq, sec = withG ? D.sec.ab : D.sec.a, i, A = "", B = "", done = 0;
    for (i = 0; i < n; i++) { var ok = t >= sec * (i + 1) / n - 1e-9; if (ok) done++; var sq = '<i class="' + (ok ? "ok" : "wait") + '"></i>'; if (withG && i % 2) B += sq; else A += sq; }
    var p = withG ? "y" : "n";
    $(p + "A").innerHTML = A; if (withG) $("yB").innerHTML = B;
    $(p + "Clock").textContent = f1(Math.min(t, sec)) + " s"; $(p + "Done").textContent = done + " / " + n;
  }

  /* speed improvement: three bars on one time scale + the multiplier and the seconds saved */
  function impHtml() {
    var mx = Math.max(D.sec.a, D.sec.b, D.sec.hand, D.sec.ab), saved = D.sec.a - D.sec.ab, pct = Math.round((1 - D.sec.ab / D.sec.a) * 100);
    var rows = [["a", M.a + " only (today)", "只接 " + M.a + "（現況）", "#c19a6b"], ["b", M.b + " only", "只接 " + M.b, "#9db88c"], ["hand", "Both, app splits by hand", "兩台，應用自己分流", "#a89c88"], ["ab", "Both, via LiteLLM", "兩台，經 LiteLLM", "#d6b26b"]].map(function (r) {
      return '<div class="lr-bar' + (r[0] === "ab" ? " best" : "") + '"><span class="lr-name">' + r[1] + '<small class="zhs">' + r[2] + '</small></span><span class="lr-track"><span class="lr-fill" style="width:' + (D.sec[r[0]] / mx * 100).toFixed(1) + '%;background:' + r[3] + '"></span></span><b>' + f1(D.sec[r[0]]) + ' s</b></div>';
    }).join("");
    return '<div class="lr-imp"><div class="lr-bars">' + rows + '</div><div class="lr-impk"><b>' + f1(gain) + '×</b><span>faster than one machine<small class="zhs">比只接一台快</small></span><span>saves ' + f1(saved) + ' s (' + pct + '%)<small class="zhs">少 ' + f1(saved) + ' 秒（' + pct + '%）</small></span><span class="lr-same">Hand split is about as fast<small class="zhs">應用自己分流速度差不多</small></span></div></div>';
  }
  function speed() {
    $("lrStage").innerHTML = solved("Each app is wired to one machine, so the other one sits idle.", "每個應用只接一台機器，另一台閒置") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">應用只接 ' + M.a + '（現況）</small></h3>' + lane("nA", M.a + " · " + M.ma) +
      '<div class="lr-res"><b id="nClock">0.0 s</b><span id="nDone">0 / ' + D.nreq + '</span></div></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">兩台分流</small></h3>' + lane("yA", M.a + " · " + M.ma) + lane("yB", M.b + " · " + M.mb) +
      '<div class="lr-res"><b id="yClock">0.0 s</b><span id="yDone">0 / ' + D.nreq + '</span></div></div></div>' +
      impHtml() +
      '<div class="lr-foot"><p class="lr-one">' + D.load + '<small class="zhs">每種各 ' + D.nreq + ' 個請求，同時 4 個；3 次取中位數</small></p><button type="button" class="lr-play" id="lrPlay">▶ Replay<small class="zhs">重播</small></button></div>';
    $("lrPlay").onclick = play; paintLanes(false, D.sec.a); paintLanes(true, D.sec.ab);
  }
  function play() {
    stop(); if (reduce) { paintLanes(false, D.sec.a); paintLanes(true, D.sec.ab); return; }
    var t0 = performance.now(), k = 3;
    (function step(now) { var t = (now - t0) / 1000 * k; paintLanes(false, t); paintLanes(true, t); if (t < D.sec.a) raf = requestAnimationFrame(step); else { paintLanes(false, D.sec.a); paintLanes(true, D.sec.ab); raf = null; } })(t0);
  }

  function steps(items) { return '<ol class="lr-steps">' + items.map(function (s, i) { return '<li data-s="' + i + '"><b>' + (i + 1) + "</b><span>" + s[0] + '<small class="zhs">' + s[1] + "</small></span><em" + (s[3] ? ' class="' + s[3] + '"' : "") + ">" + s[2] + "</em></li>"; }).join("") + "</ol>"; }
  function fail() {
    $("lrStage").innerHTML = solved("A machine goes down and users get errors.", "機器一掛，使用者就看到錯誤") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">直連 ' + M.b + '</small></h3>' +
      steps([["App asks " + M.b + " · " + M.mb, "應用直接請求 " + M.b, "sent"], [M.b + " is unreachable", M.b + " 連不上", "no answer", "bad"], ["App shows an error", "應用顯示錯誤", "0 / " + D.fail.n + " answered", "bad"]]) + '</div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">經過 LiteLLM</small></h3>' +
      steps([["App asks the gateway", "應用請求閘道", "sent"], [M.b + " is unreachable, gateway retries", M.b + " 連不上，閘道重試", "retry", "bad"], ["Gateway switches to " + M.a + " · " + M.ma, "改送 " + M.a, "switch"], ["App gets its answer", "應用拿到回覆", D.fail.gw + " / " + D.fail.n + " answered", "ok"]]) + '</div></div>' +
      '<div class="lr-foot"><p class="lr-one">Connection to ' + M.b + ' really cut during the test. Median wait <em>' + f2(D.fail.median) + ' s</em><small class="zhs">測試時真的切斷到 ' + M.b + ' 的連線；中位等待 ' + f2(D.fail.median) + ' 秒</small></p><button type="button" class="lr-play" id="lrPlay">▶ Replay<small class="zhs">重播</small></button></div>';
    var all = document.querySelectorAll(".lr-steps li"), show = function (n) { Array.prototype.forEach.call(all, function (e) { e.classList.toggle("on", +e.dataset.s <= n); }); };
    $("lrPlay").onclick = function () { stop(); if (reduce) { show(9); return; } var n = -1; show(-1); timer = setInterval(function () { n++; show(n); if (n >= 3) { clearInterval(timer); timer = null; } }, 900); };
    show(9);
  }

  function control() {
    var rq = function (who, m, code, cls) { return '<li><span>' + who + " → " + m + '</span><em class="' + cls + '">' + code + "</em></li>"; };
    $("lrStage").innerHTML = solved("Anyone with the address can use any model, and nothing is recorded.", "知道位址的人什麼模型都能用，也沒有紀錄") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LiteLLM</small></h3><ul class="lr-bul"><li>Any model on any machine, for anyone<small class="zhs">誰都能用任何機器上的任何模型</small></li><li>No record of who used what<small class="zhs">不知道誰用了多少</small></li><li>No spending limit<small class="zhs">沒有用量上限</small></li></ul></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3><ul class="lr-rq">' +
      rq("Key 1", M.ma, "200 OK", "ok") + rq("Key 1", "Qwen3.6 35B Q4", "403 Refused", "bad") + rq("Key 1 over budget", M.ma, "422 Blocked", "bad") + rq("Key 2", "any model", "200 OK", "ok") + '</ul>' +
      '<p class="lr-capl">Key 1 is limited to ' + M.ma + ' and a $' + D.ctl.cap + ' budget; blocked after ' + D.ctl.block + ' calls.<small class="zhs">金鑰 1 只能用 ' + M.ma + '，預算 $' + D.ctl.cap + '，第 ' + D.ctl.block + ' 次呼叫後被擋</small></p></div></div>' +
      '<table class="lr-tab"><thead><tr><th>Key<small class="zhs">金鑰</small></th><th>Recorded spend<small class="zhs">記錄的用量金額</small></th></tr></thead><tbody>' +
      D.usage.map(function (u) { return "<tr><td>" + esc(u[0]) + '<small class="zhs">' + esc(u[1]) + "</small></td><td>$" + u[2].toFixed(6) + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  var VIEW = { speed: speed, fail: fail, control: control };
  function tabs() { $("lrTabs").innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (t[0] === cur) + '" class="' + (t[0] === cur ? "on" : "") + '">' + t[1] + '<small class="zhs">' + t[2] + "</small></button>"; }).join(""); }
  function srcText() {
    if (!D.live) return "Replay of earlier smoke-test runs, " + D.tested + " · preliminary, to be confirmed by a run here · nothing on this page calls a live gateway";
    return D.liveSpeed ? "LIVE smoke test, " + D.liveAt + " · speed, delay and key checks measured just now · machine-down and budget are from the PoC run"
      : "Delay and key checks: LIVE, " + D.liveAt + " · speed bars: replay of earlier runs (speed was not measured, " + M.b + " not included) · machine-down and budget: PoC run";
  }
  function render() { stop(); tabs(); VIEW[cur](); $("lrSrc").textContent = srcText(); }
  $("lrTabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) { cur = b.dataset.t; render(); if (cur === "speed") play(); } });
  render();

  /* ---------- smoke test: runs on the LOCAL platform only (needs the backend described in the design) ---------- */
  var inclB = false, logNext = 0, API = "/api/litellm", STEPS = [["Preflight", "檢查"], ["Speed", "速度"], ["Cost", "延遲"], ["Control", "管控"]], runEl = $("lrRun"), job = null, poll = null;

  /* What the smoke test does, as ticking checklists. Mirrors plan() in benchmark/litellm_smoke.py (the backend sends its own copy when available). */
  var it = function (en, zh) { return { label: en, zh: zh }; };
  var PLAN = { steps: [
    { name: "Preflight", zh: "檢查", sends: [], items: [it("Gateway is up", "閘道正常"), it("Machines reachable", "機器連得到"), it("Nothing else is running", "沒有其他測試在跑"), it("Test keys and models present", "測試金鑰與模型都在")] },
    { name: "Speed", zh: "速度", sends: [{ prompt: "用約80字介紹台北的夜市文化", tokens: 100, meta: "8 requests x 3" }], items: [it(M.a + " only (one machine, today)", "只接 " + M.a + "（現況）"), it(M.b + " only", "只接 " + M.b), it("Both, the app splits by hand", "兩台，應用自己分流"), it("Both, via LiteLLM", "兩台，經 LiteLLM"), it("LiteLLM at least 1.3x faster than " + M.a + " only", "LiteLLM 比只接 " + M.a + " 快至少 1.3 倍")] },
    { name: "Cost", zh: "延遲", sends: [{ prompt: "說一個字", tokens: 10, meta: "6 pairs" }], items: [it("Pairs sent: direct and via LiteLLM", "直連與經 LiteLLM 各送一次"), it("Extra delay at most 0.10 s", "額外延遲不超過 0.10 秒")] },
    { name: "Control", zh: "管控", sends: [{ prompt: "hi", tokens: 20, meta: "4 requests" }], items: [it("Limited key, its own model (expect 200)", "限定金鑰，自己的模型（預期 200）"), it("Limited key, another model (expect 403)", "限定金鑰，別的模型（預期 403）"), it("Open key, another model (expect 200)", "不設限金鑰，別的模型（預期 200）"), it("No gateway, another model (200: nothing stops it)", "不經閘道，別的模型（200：沒人擋）")] }
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
  function stepsHtml(st) {
    return '<ol class="lr-rs">' + STEPS.map(function (n, i) { var x = (st && st[i]) || { state: "wait" }; return '<li class="' + esc(x.state) + '"><b>' + n[0] + '<small class="zhs">' + n[1] + '</small></b><span>' + esc(x.detail || "") + "</span></li>"; }).join("") + "</ol>";
  }
  function runUI(mode, msg, st, items) {
    runEl.innerHTML = '<div class="lr-runrow"><button type="button" class="lr-runbtn" id="lrRunBtn"' + (mode === "ready" ? "" : " disabled") + '>▶ Run smoke test<small class="zhs">實測</small></button><span class="lr-runmsg">' + (msg || "") + "</span></div>" + planHtml(st, items);
    var row = runEl.querySelector(".lr-runrow");
    if (row && (mode === "ready" || mode === "running")) {
      row.insertAdjacentHTML("beforeend", '<label class="lr-incl"><input type="checkbox" id="lrInclB"' + (inclB ? " checked" : "") + (mode === "ready" ? "" : " disabled") + '> Include ' + M.b + ' (shared machine)<small class="zhs">包含 ' + M.b + '（共用機器）</small></label>');
      $("lrInclB").onchange = function () { inclB = this.checked; };
    }
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
  function checkStatus() {
    runUI("checking", info("Checking the local platform…", "檢查本機平台…"));
    fetch(API + "/status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
      if (d && d.ok) { fetch(API + "/plan", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (pl) { if (pl && pl.steps) { PLAN = pl; if (!job || !poll) runUI("ready", info("About 70 s. Asks for the test password first.", "約 70 秒，會先要測試密碼")); } }).catch(function () {}); runUI("ready", info("About 70 s. Asks for the test password first.", "約 70 秒，會先要測試密碼")); }
      else runUI("off", info("The gateway is not reachable from this platform.", "平台連不到閘道") + (d && d.reason ? " · " + esc(d.reason) : ""));
    }).catch(function () { runUI("off", info("Local platform only: needs the smoke-test backend on this computer.", "只能在本機平台按；需要本機裝上 smoke test 後端")); });
  }
  function startRun() {
    if (!window.RunGate) { runUI("ready", info("Test-password dialog is not loaded.", "測試密碼視窗沒有載入")); return; }
    runUI("running", info("Waiting for the test password…", "等待輸入測試密碼"));
    RunGate.ticket().then(function (t) { return fetch(API + "/smoke", { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": t }, body: JSON.stringify({ include_b: inclB }) }); })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
      .then(function (d) { job = d.job_id; logNext = 0; termReset(""); poll = setInterval(tick, 1000); tick(); })
      .catch(function (e) { runUI("ready", esc(e.message || e)); });
  }
  function tick() {
    fetch(API + "/smoke/" + job + "?since=" + logNext, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.log) { termAdd(d.log); logNext = d.log_next; }
      runUI("running", info("Running…", "執行中"), d.steps, d.items);
      if (d.state === "running" || d.state === "queued") return;
      clearInterval(poll); poll = null;
      if (d.state === "done" && d.result) applyLive(d.result, d.steps, d.items); else runUI("ready", info("Stopped: ", "已停止：") + esc(d.error || d.state), d.steps, d.items);
    }).catch(function () { clearInterval(poll); poll = null; runUI("ready", info("Lost contact with the platform.", "和平台失去連線")); });
  }
  /* result schema: speed.median_s{a,b,ab}, speed.tok_s{a,b,ab}, cost{direct_s,gateway_s,added_s}, control{own,other,open}, all_pass, finished */
  function applyLive(r, steps, items) {
    D.liveSpeed = !!r.speed;
    if (r.speed) { D.sec = r.speed.median_s; D.tps = r.speed.tok_s; D.nreq = r.load ? r.load.requests : D.nreq; D.load = (r.load ? r.load.requests : D.nreq) + " requests, " + (r.load ? r.load.concurrency : 4) + " at once, median of " + (r.load ? r.load.repeats : 3) + " repeats (this run)"; }
    if (r.cost) D.cost = { direct: r.cost.direct_s, gw: r.cost.gateway_s, add: r.cost.added_s };
    if (r.control && r.control.direct_other) D.wrong = { direct: r.control.direct_other, key: r.control.other };
    D.live = true; D.liveAt = r.finished || new Date().toLocaleTimeString(); D.liveSkipped = r.skipped || []; recalc();
    var done = !!r.all_pass;
    conclusion(done); render();
    var msg = done ? ["Done. Conclusion updated with this run.", "完成，結論已換成這次實測"]
      : r.skipped && r.skipped.length ? ["Done, but speed was not measured (" + M.b + " not included). The conclusion stays preliminary.", "完成，但沒有測速度（未包含 " + M.b + "），結論仍是初步估算"]
      : ["Done. At least one check did not pass; see the steps.", "完成，但有項目沒過，請看各步驟"];
    runUI("ready", info(msg[0], msg[1]), steps, items);
    if (cur === "speed") play();
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
})();
