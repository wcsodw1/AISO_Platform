/* LiteLLM gateway: with vs without, on our real machines and models.
   Every number comes from one proof-of-concept run on 2026-11-17 (pass criteria fixed before the run, real requests, nothing mocked).
   The scenarios on this page REPLAY that run; nothing here calls a live gateway. No addresses, keys or paths. */
(function () {
  "use strict";
  var M = { a: "AISO1", b: "PRO6000", ma: "Gemma 4 26B Q4", mb: "Gemma 4 26B BF16" };
  var D = {
    tested: "2026-11-17",
    load: "16 requests, 4 at once",
    sec: { a: 14.38, b: 11.62, ab: 8.24 }, tps: { a: 80.7, b: 100.9, ab: 141.1 },
    cost: { direct: 0.158, gw: 0.189, add: 0.033 },
    fail: { n: 10, direct: 0, gw: 10, median: 1.31 },
    ctl: { block: 6, cap: 0.0005 },
    usage: [["Key 1 · limited", "金鑰 1・限定", 0.00015], ["Key 2 · open", "金鑰 2・不設限", 0.000126]],
    notes: [
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
  var gain = D.sec.a / D.sec.ab, gainB = D.sec.b / D.sec.ab;
  var raf = null, timer = null, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stop = function () { if (raf) cancelAnimationFrame(raf); if (timer) clearInterval(timer); raf = timer = null; };

  /* ---------- conclusion ---------- */
  var notes = '<div class="lr-notes" tabindex="0"><span class="lr-nb">Notes<small class="zhs"> 備註</small></span><div class="lr-nf"><ul>' +
    D.notes.map(function (n) { return "<li>" + esc(n[0]) + "<small>" + esc(n[1]) + "</small></li>"; }).join("") + "</ul></div></div>";
  /* The conclusion is PRELIMINARY until the smoke test has run on this platform (David, 2026-11-17).
     Replay data (proof-of-concept run) -> "Preliminary estimate". A live smoke test result -> "Confirmed". */
  function conclusion(live) {
    var el = $("lrConcl");
    el.classList.toggle("prelim", !live);
    el.innerHTML = '<span class="lr-cl">' + (live ? 'Conclusion<small class="zhs">實測結論</small>' : 'Preliminary estimate<small class="zhs">初步估算</small><em class="lr-pend">Pending smoke test<small class="zhs">待 smoke test 確認</small></em>') + '</span>' + notes +
      '<p class="lr-big">' + (live ? "" : "About ") + f1(gain) + '× faster: ' + M.a + ' + ' + M.b + ' behind one entry.<small>' + M.a + ' 加 ' + M.b + ' 共用一個入口，' + (live ? "快 " : "預估快約 ") + f1(gain) + ' 倍</small></p>' +
      '<p class="lr-big">' + M.b + ' cut off: ' + D.fail.gw + ' of ' + D.fail.n + ' requests answered' + (live ? "." : " in the trial run.") + '<small>' + M.b + ' 斷線時，' + D.fail.n + ' 個請求有 ' + D.fail.gw + ' 個正常回覆' + (live ? "" : "（試跑）") + '</small></p>' +
      '<p class="lr-big">Cost: about ' + f2(D.cost.add) + ' s per request.<small>代價：每個請求多約 ' + f2(D.cost.add) + ' 秒</small></p>' +
      (live ? "" : '<p class="lr-hint">Confirmed only after the smoke test runs on this platform.<small class="zhs">要在平台上跑完 smoke test 才算確認</small></p>');
  }
  conclusion(false);

  /* ---------- 1 · the picture: real clients, real machines, real models ---------- */
  var W = 560, CH = 30;
  var rect = function (x, y, w, h, fill, stroke, sw) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw || 1.5) + '"/>'; };
  var txt = function (x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.a || "middle") + '" fill="' + (o.c || "#f3efe5") + '" font-size="' + (o.s || 18) + '" font-weight="' + (o.w || 700) + '">' + esc(t) + "</text>"; };
  var line = function (x1, y1, x2, y2, c) { return '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="' + c + '" stroke-width="2" fill="none"/>'; };
  var APPS = ["Office AI", "AISO Platform", "Scripts"], AY = [40, 140, 240];
  var MA = { y: 14, h: 158, title: M.a, chips: ["Gemma 4 26B Q4", "Qwen3.6 35B Q4", "Qwen3.8 27B Q4"], c: ["rgba(138,180,255,.12)", "#8ab4ff"] };
  var MB = { y: 196, h: 122, title: M.b, chips: ["Gemma 4 26B BF16", "Gemma 4 E4B"], c: ["rgba(79,209,176,.12)", "#4fd1b0"] };
  var machine = function (m, x, w) {
    var s = rect(x, m.y, w, m.h, m.c[0], m.c[1]) + txt(x + 14, m.y + 28, m.title, { a: "start", s: 20 });
    m.chips.forEach(function (c, i) { s += rect(x + 12, m.y + 42 + i * 36, w - 24, CH, "rgba(255,255,255,.07)", "rgba(255,255,255,.18)", 1) + txt(x + w / 2, m.y + 42 + i * 36 + 21, c, { s: 17, w: 600 }); });
    return s;
  };
  var apps = function () { return APPS.map(function (a, i) { return rect(8, AY[i], 150, 44, "rgba(255,255,255,.06)", "#9aa6b8") + txt(83, AY[i] + 29, a, { s: 18 }); }).join(""); };
  var MX = 330, MW = 222;
  var svgWithout = apps() + AY.map(function (y) { return line(158, y + 22, MX, MA.y + 30, "#ff8a76") + line(158, y + 22, MX, MB.y + 30, "#ff8a76"); }).join("") + machine(MA, MX, MW) + machine(MB, MX, MW);
  var svgWith = apps() + AY.map(function (y) { return line(158, y + 22, 188, 168, "#9aa6b8"); }).join("") +
    rect(188, 132, 84, 72, "rgba(217,203,143,.14)", "#d9cb8f", 2) + txt(230, 174, "LiteLLM", { c: "#d9cb8f", s: 17, w: 800 }) +
    line(272, 150, MX, MA.y + 60, "#d9cb8f") + line(272, 186, MX, MB.y + 60, "#d9cb8f") + machine(MA, MX, MW) + machine(MB, MX, MW);
  var svg = function (inner, label) { return '<svg class="lr-svg" viewBox="0 0 ' + W + ' 330" role="img" aria-label="' + label + '">' + inner + "</svg>"; };
  $("lrFlow").innerHTML = '<div class="lr-vs">' +
    '<div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LiteLLM</small></h3>' + svg(svgWithout, "Three clients each connect to both machines: six links") +
    '<p class="lr-pt"><b>6 links</b>, each app knows each machine and model name<small class="zhs">6 條連線，每個應用都要記得每台機器與模型名稱</small></p></div>' +
    '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3>' + svg(svgWith, "Three clients connect to one gateway, which connects to both machines") +
    '<p class="lr-pt"><b>1 place</b> to change: move or add a model, apps stay the same<small class="zhs">只改一個地方：換機器或加模型，應用都不用改</small></p></div></div>';

  /* ---------- 2 · replays ---------- */
  var TABS = [["speed", "Speed", "速度"], ["fail", "Failover", "備援"], ["control", "Control", "管控"]];
  var cur = "speed";
  var solved = function (en, zh) { return '<p class="lr-solve"><span>Solves<small class="zhs">解決</small></span> ' + en + '<small class="zhs">' + zh + "</small></p>"; };
  var lane = function (id, label) { return '<div class="lr-lane"><span class="lr-ln">' + label + '</span><span class="lr-sq" id="' + id + '"></span></div>'; };

  function paintLanes(withG, t) {
    var n = 16, sec = withG ? D.sec.ab : D.sec.a, i, A = "", B = "", done = 0;
    for (i = 0; i < n; i++) { var ok = t >= sec * (i + 1) / n - 1e-9; if (ok) done++; var sq = '<i class="' + (ok ? "ok" : "wait") + '"></i>'; if (withG && i % 2) B += sq; else A += sq; }
    var p = withG ? "y" : "n";
    $(p + "A").innerHTML = A; if (withG) $("yB").innerHTML = B;
    $(p + "Clock").textContent = f1(Math.min(t, sec)) + " s"; $(p + "Done").textContent = done + " / " + n;
  }
  function speed() {
    $("lrStage").innerHTML = solved("One machine is the bottleneck.", "單一機器是瓶頸") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">直連 ' + M.a + '</small></h3>' + lane("nA", M.a + " · " + M.ma) +
      '<div class="lr-res"><b id="nClock">0.0 s</b><span id="nDone">0 / 16</span></div></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">兩台分流</small></h3>' + lane("yA", M.a + " · " + M.ma) + lane("yB", M.b + " · " + M.mb) +
      '<div class="lr-res"><b id="yClock">0.0 s</b><span id="yDone">0 / 16</span></div></div></div>' +
      '<div class="lr-foot"><p class="lr-one">' + D.load + ': <em>' + f1(D.sec.a) + ' s</em> → <em>' + f1(D.sec.ab) + ' s</em><small class="zhs">' + f1(gain) + '× vs ' + M.a + ' alone · ' + f1(gainB) + '× vs ' + M.b + ' alone（3 次取中位數）</small></p><button type="button" class="lr-play" id="lrPlay">▶ Replay<small class="zhs">重播</small></button></div>';
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
  function render() { stop(); tabs(); VIEW[cur](); $("lrSrc").textContent = "Replay of the proof-of-concept run, " + D.tested + " · preliminary, to be confirmed by the smoke test · nothing here calls a live gateway"; }
  $("lrTabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) { cur = b.dataset.t; render(); if (cur === "speed") play(); } });
  render();
})();
