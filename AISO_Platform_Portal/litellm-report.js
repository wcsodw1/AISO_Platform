/* LiteLLM gateway: with vs without. Every number is a measured value from one test on 2026-11-17 and every scenario is a
   REPLAY of that test (nothing here calls a live gateway). Machines are named A and B on purpose: no hostnames, no addresses, no keys. */
(function () {
  "use strict";
  var D = {
    tested: "2026-11-17",
    load: "16 requests, 4 at once",
    a: { sec: 14.5, tps: 80.1 }, b: { sec: 11.6, tps: 100.8 }, ab: { sec: 8.7, tps: 138.7 },
    failSec: 5.3,
    cap: 0.0005, used: 0.0026,
    usage: [["Key 1", "金鑰 1", 3, 26, 0.0026], ["Key 2", "金鑰 2", 24, 624, 0.0104]],
    lat: { a: [2.075, 2.129], b: [0.321, 0.359] },
    notes: [
      ["Machine A runs Q4, Machine B runs BF16: not like-for-like. The gain shows gateway scaling, not a hardware ranking.", "機器 A 用 Q4、機器 B 用 BF16，精度不同；倍數代表閘道分流效果，不是機器排名"],
      ["One run only, 16 requests. The test machines are shared with other users.", "只跑一次、16 個請求；測試機器是與他人共用的"],
      ["Budget blocks only after the limit: cap $0.0005, used $0.0026.", "預算超過後才擋：上限 $0.0005，實際用到 $0.0026"],
      ["Fallback took 5.3 s (two retries before switching).", "備援耗時 5.3 秒（先重試兩次才切換）"],
      ["Earlier balancing run failed (4 x 500, 11 x 429) under the old settings. Not seen again after changing them; root cause not confirmed.", "舊設定下分流曾失敗（4 次 500、11 次 429），改設定後沒再出現，根本原因未確認"],
      ["Keys, budget and usage were tested on mock backends only.", "金鑰、預算、用量只用假後端測過"],
      ["It is one more service to run and keep alive.", "多了一個要維運的服務"]
    ]
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f1 = function (n) { return n.toFixed(1); };
  var gain = D.ab.tps / D.a.tps;
  var raf = null, timer = null, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stop = function () { if (raf) cancelAnimationFrame(raf); if (timer) clearInterval(timer); raf = timer = null; };

  /* ---------- conclusion ---------- */
  var notes = '<div class="lr-notes" tabindex="0"><span class="lr-nb">Notes<small class="zhs"> 備註</small></span><div class="lr-nf"><ul>' +
    D.notes.map(function (n) { return "<li>" + esc(n[0]) + "<small>" + esc(n[1]) + "</small></li>"; }).join("") + "</ul></div></div>";
  $("lrConcl").innerHTML = '<span class="lr-cl">Conclusion<small class="zhs">結論</small></span>' + notes +
    '<p class="lr-big">' + f1(gain) + '× faster with two machines.<small>兩台機器分流，快 ' + f1(gain) + ' 倍</small></p>' +
    '<p class="lr-big">One machine fails, nobody sees an error.<small>一台掛掉，使用者看不到錯誤</small></p>' +
    '<p class="lr-big">Cost: about 0.05 s per request.<small>代價：每個請求多約 0.05 秒</small></p>';

  /* ---------- 1 · the picture: without vs with ---------- */
  var box = function (x, y, w, t, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="40" rx="10" fill="' + (c ? c[0] : "rgba(255,255,255,.06)") + '" stroke="' + (c ? c[1] : "#9aa6b8") + '"/><text x="' + (x + w / 2) + '" y="' + (y + 27) + '" text-anchor="middle" fill="#f3efe5" font-size="18" font-weight="700">' + t + "</text>"; };
  var CA = ["rgba(138,180,255,.14)", "#8ab4ff"], CB = ["rgba(79,209,176,.14)", "#4fd1b0"], CG = ["rgba(217,203,143,.14)", "#d9cb8f"];
  var line = function (x1, y1, x2, y2, c) { return '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="' + (c || "#9aa6b8") + '" stroke-width="2" fill="none"/>'; };
  var apps = [20, 80, 140];
  var without = apps.map(function (y) { return line(150, y + 20, 270, 40, "#ff8a76") + line(150, y + 20, 270, 140, "#ff8a76"); }).join("");
  var withl = apps.map(function (y) { return line(150, y + 20, 205, 100, "#9aa6b8"); }).join("") + line(285, 100, 330, 40, "#d9cb8f") + line(285, 100, 330, 140, "#d9cb8f");
  $("lrFlow").innerHTML = '<div class="lr-vs">' +
    '<div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LiteLLM</small></h3><svg class="lr-svg" viewBox="0 0 400 200" role="img" aria-label="Three apps each connect to both machines: six links">' +
    without + apps.map(function (y, i) { return box(20, y, 130, ["Web app", "Office AI", "Script"][i]); }).join("") + box(270, 20, 110, "Machine A", CA) + box(270, 120, 110, "Machine B", CB) + '</svg>' +
    '<p class="lr-pt"><b>6 links</b> to keep in step<small class="zhs">6 條連線要各自維護</small></p></div>' +
    '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3><svg class="lr-svg" viewBox="0 0 400 200" role="img" aria-label="Three apps connect to one gateway, which connects to both machines">' +
    withl + apps.map(function (y, i) { return box(20, y, 130, ["Web app", "Office AI", "Script"][i]); }).join("") + '<rect x="205" y="70" width="80" height="60" rx="12" fill="' + CG[0] + '" stroke="' + CG[1] + '" stroke-width="2"/><text x="245" y="106" text-anchor="middle" fill="#d9cb8f" font-size="17" font-weight="800">LiteLLM</text>' +
    box(330, 20, 66, "A", CA) + box(330, 120, 66, "B", CB) + '</svg>' +
    '<p class="lr-pt"><b>1 place</b> to change<small class="zhs">只改一個地方</small></p></div></div>';

  /* ---------- 2 · replays ---------- */
  var TABS = [["speed", "Speed", "速度"], ["fail", "Failover", "備援"], ["control", "Control", "管控"]];
  var cur = "speed";
  var solved = function (en, zh) { return '<p class="lr-solve"><span>Solves<small class="zhs">解決</small></span> ' + en + "<small class=\"zhs\">" + zh + "</small></p>"; };

  function laneHtml(id, label) { return '<div class="lr-lane"><span class="lr-ln">' + label + '</span><span class="lr-sq" id="' + id + '"></span></div>'; }
  function paintLanes(withG, t) {
    var n = 16, sec = withG ? D.ab.sec : D.a.sec, i, A = "", B = "", done = 0;
    for (i = 0; i < n; i++) { var ok = t >= sec * (i + 1) / n - 1e-9; if (ok) done++; var sq = '<i class="' + (ok ? "ok" : "wait") + '"></i>'; if (withG && i % 2) B += sq; else A += sq; }
    var p = withG ? "y" : "n";
    $(p + "A").innerHTML = A; if (withG) $("yB").innerHTML = B;
    $(p + "Clock").textContent = f1(Math.min(t, sec)) + " s"; $(p + "Done").textContent = done + " / " + n;
  }
  function speed() {
    $("lrStage").innerHTML = solved("One machine is the bottleneck.", "單一機器是瓶頸") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">只用機器 A</small></h3>' + laneHtml("nA", "Machine A") +
      '<div class="lr-res"><b id="nClock">0.0 s</b><span id="nDone">0 / 16</span></div></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">兩台分流</small></h3>' + laneHtml("yA", "Machine A") + laneHtml("yB", "Machine B") +
      '<div class="lr-res"><b id="yClock">0.0 s</b><span id="yDone">0 / 16</span></div></div></div>' +
      '<div class="lr-foot"><p class="lr-one">' + D.load + ': <em>' + f1(D.a.sec) + ' s</em> → <em>' + f1(D.ab.sec) + ' s</em><small class="zhs">' + f1(gain) + '× faster · 快 ' + f1(gain) + ' 倍</small></p><button type="button" class="lr-play" id="lrPlay">▶ Replay<small class="zhs">重播</small></button></div>';
    $("lrPlay").onclick = play; paintLanes(false, D.a.sec); paintLanes(true, D.ab.sec);
  }
  function play() {
    stop(); if (reduce) { paintLanes(false, D.a.sec); paintLanes(true, D.ab.sec); return; }
    var t0 = performance.now(), speedUp = 3;
    (function step(now) { var t = (now - t0) / 1000 * speedUp; paintLanes(false, t); paintLanes(true, t); if (t < D.a.sec) raf = requestAnimationFrame(step); else { paintLanes(false, D.a.sec); paintLanes(true, D.ab.sec); raf = null; } })(t0);
  }

  function steps(cls, items) { return '<ol class="lr-steps ' + cls + '">' + items.map(function (s, i) { return '<li data-s="' + i + '"><b>' + (i + 1) + "</b><span>" + s[0] + '<small class="zhs">' + s[1] + "</small></span><em" + (s[3] ? ' class="' + s[3] + '"' : "") + ">" + s[2] + "</em></li>"; }).join("") + "</ol>"; }
  function fail() {
    $("lrStage").innerHTML = solved("A machine goes down and users get errors.", "機器一掛，使用者就看到錯誤") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">直連機器 B</small></h3>' +
      steps("lrs-n", [["App asks Machine B", "應用請求機器 B", "sent"], ["Machine B is down", "機器 B 掛了", "no answer", "bad"], ["App shows an error", "應用顯示錯誤", "failed", "bad"]]) + '</div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">經過 LiteLLM</small></h3>' +
      steps("lrs-y", [["App asks the gateway", "應用請求閘道", "sent"], ["Machine B is down, gateway retries", "機器 B 掛了，閘道重試", "retry", "bad"], ["Gateway switches to Machine A", "改送機器 A", "switch"], ["App gets its answer", "應用拿到回覆", "200 OK", "ok"]]) + '</div></div>' +
      '<div class="lr-foot"><p class="lr-one">No error shown. Extra wait: <em>' + f1(D.failSec) + ' s</em><small class="zhs">使用者沒看到錯誤，只多等 ' + f1(D.failSec) + ' 秒</small></p><button type="button" class="lr-play" id="lrPlay">▶ Replay<small class="zhs">重播</small></button></div>';
    var all = document.querySelectorAll(".lr-steps li"), show = function (n) { Array.prototype.forEach.call(all, function (e) { e.classList.toggle("on", +e.dataset.s <= n); }); };
    $("lrPlay").onclick = function () { stop(); if (reduce) { show(9); return; } var n = -1; show(-1); timer = setInterval(function () { n++; show(n); if (n >= 3) { clearInterval(timer); timer = null; } }, 900); };
    show(9);
  }

  function control() {
    var mx = D.used * 1.12, pc = function (v) { return (v / mx * 100).toFixed(1) + "%"; };
    $("lrStage").innerHTML = solved("Anyone with the address can use anything, and nothing is recorded.", "知道位址的人什麼都能用，也沒有紀錄") +
      '<div class="lr-vs"><div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LiteLLM</small></h3><ul class="lr-bul"><li>Any model, for anyone<small class="zhs">誰都能用任何模型</small></li><li>No record of who used what<small class="zhs">不知道誰用了多少</small></li><li>No spending limit<small class="zhs">沒有用量上限</small></li></ul></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3><ul class="lr-rq"><li><span>Key 1 asks its own model</span><em class="ok">200 OK</em></li><li><span>Key 1 asks another model</span><em class="bad">403 Refused</em></li><li><span>Key 1 passes its budget</span><em class="bad">422 Blocked</em></li></ul>' +
      '<div class="lr-bud"><span class="lr-track"><span class="lr-fill" style="width:' + pc(D.used) + '"></span><span class="lr-cap" style="left:' + pc(D.cap) + '"></span></span></div><p class="lr-capl">cap $' + D.cap + ' · stopped at $' + D.used + '<small class="zhs">上限與實際停下時的金額</small></p></div></div>' +
      '<table class="lr-tab"><thead><tr><th>Key<small class="zhs">金鑰</small></th><th>Calls<small class="zhs">次數</small></th><th>Tokens</th><th>Cost<small class="zhs">金額</small></th></tr></thead><tbody>' +
      D.usage.map(function (u) { return "<tr><td>" + esc(u[0]) + '<small class="zhs">' + esc(u[1]) + "</small></td><td>" + u[2] + "</td><td>" + u[3] + "</td><td>$" + u[4].toFixed(4) + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  var VIEW = { speed: speed, fail: fail, control: control };
  function tabs() { $("lrTabs").innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (t[0] === cur) + '" class="' + (t[0] === cur ? "on" : "") + '">' + t[1] + '<small class="zhs">' + t[2] + "</small></button>"; }).join(""); }
  function render() { stop(); tabs(); VIEW[cur](); $("lrSrc").textContent = "Replay of the " + D.tested + " test · nothing here calls a live gateway"; }
  $("lrTabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) { cur = b.dataset.t; render(); if (cur === "speed") play(); } });
  render();
})();
