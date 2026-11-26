/* Ray Serve page: two phases, three steps each; every phase opens with its meaning, every step says what we will see when it is done.
   All content lives in data/rayserve-phase2.json: edit the status / result there after each run. No addresses, keys or paths. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bi(en, zh) { return esc(en) + '<small class="zhs">' + esc(zh) + "</small>"; }
  function proof(p) {
    if (!p) return "";
    var mx = Math.max.apply(null, p.rows.map(function (r) { return Math.max(+r[1], +r[2]); }));
    return '<div class="rs-proof"><h3>' + bi(p.title_en, p.title_zh) + '</h3><p class="rs-unit">' + bi(p.unit_en, p.unit_zh) + "</p><table><thead><tr>" +
      p.cols_en.map(function (c, i) { return "<th>" + bi(c, p.cols_zh[i]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      p.rows.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td><span class="rs-bar a" style="width:' + Math.round(+r[1] / mx * 100) + '%">' + esc(r[1]) + '</span></td><td><span class="rs-bar b" style="width:' + Math.round(+r[2] / mx * 100) + '%">' + esc(r[2]) + '</span></td><td class="rs-gain">' + esc(r[3]) + "</td></tr>"; }).join("") +
      '</tbody></table>' + (p.notes ? '<ul class="rs-calc">' + p.notes.map(function (n) { return "<li>" + bi(n[0], n[1]) + "</li>"; }).join("") + "</ul>" : '<p class="rs-pn">' + bi(p.note_en, p.note_zh) + "</p>") + "</div>";
  }
  function kpi(k) {
    if (!k) return "";
    return '<div class="rs-proof"><h3>' + bi(k.title_en, k.title_zh) + '</h3><ul class="rs-calc">' + k.items.map(function (i) { return "<li>" + bi(i[0], i[1]) + (i[2] ? ' <a class="rs-src" href="' + esc(i[2]) + '" target="_blank" rel="noopener">' + esc(i[3] || "source") + " ↗</a>" : "") + "</li>"; }).join("") + "</ul></div>";
  }
  function matrix(m) {
    if (!m) return "";
    return '<div class="rs-proof rs-mx"><h3>' + bi(m.title_en, m.title_zh) + '</h3><p class="rs-unit">' + bi(m.unit_en, m.unit_zh) + "</p><table><thead><tr>" +
      m.cols_en.map(function (c, i) { return "<th>" + bi(c, m.cols_zh[i]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      m.rows.map(function (r) { return "<tr><td>" + bi(r[0], r[1]) + "</td>" + r.slice(2).map(function (v) { return '<td class="rs-gain">' + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table><ul class="rs-calc">' + m.notes.map(function (n) { return "<li>" + bi(n[0], n[1]) + "</li>"; }).join("") + "</ul></div>";
  }
  /* English first; on mouse-over of a block the Chinese REPLACES the English: wrap the English that sits before each Chinese gloss in span.en */
  function wrapEn() {
    try {
      var root = document.querySelector("main.lr");
      if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll("small.zhs,.zh-i"), function (z) {
        var run = [], n = z.previousSibling;
        while (n) {
          if (n.nodeType === 3) { run.unshift(n); }
          else if (n.nodeType === 1) {
            if (n.classList.contains("en") || n.querySelector("small.zhs,.zh-i") || /^(P|UL|OL|DIV|TABLE|H1|H2|H3|SVG|SECTION)$/i.test(n.tagName)) break;
            run.unshift(n);
          } else break;
          n = n.previousSibling;
        }
        if (!run.length || !run.some(function (x) { return (x.textContent || "").trim(); })) return;
        var s = document.createElement("span"); s.className = "en";
        z.parentNode.insertBefore(s, run[0]);
        run.forEach(function (x) { s.appendChild(x); });
      });
    } catch (e) { }
  }
  /* ---------- Phase 2: GPU board (local platform only). Read-only: /api/gpu/status answers which GPUs of the machine are in use and which are free;
     when a GPU that was in use becomes free, an alert pops up (banner, beep, browser notification, tab title). The online page cannot reach the machine and says so. ---------- */
  var board = { prev: null, timer: null, ctx: null, alerts: [] };
  function gb(m) { return (m / 1024).toFixed(1); }
  function beep() {
    try {
      if (!board.ctx) return;
      for (var i = 0; i < 3; i++) {
        var o = board.ctx.createOscillator(), g = board.ctx.createGain(), t = board.ctx.currentTime + i * 0.35;
        o.frequency.value = 880; o.connect(g); g.connect(board.ctx.destination);
        g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.start(t); o.stop(t + 0.3);
      }
    } catch (e) { }
  }
  function alertFree(list) {
    list.forEach(function (n) { board.alerts.push(n); });
    beep();
    try { if (window.Notification && Notification.permission === "granted") new Notification("GPU " + list.join(", ") + " is free / 空卡"); } catch (e) { }
    try { document.title = "● GPU " + list.join(",") + " free — " + (document.title.replace(/^● [^—]*— /, "")); } catch (e) { }
    drawAlerts();
  }
  function drawAlerts() {
    var el = $("rsBalert"); if (!el) return;
    el.innerHTML = board.alerts.map(function (n, i) { return '<div class="rs-alert" role="alert"><b>GPU ' + n + "</b> " + bi("is now free", "已經空出來") + '<button type="button" data-i="' + i + '">' + bi("Dismiss", "知道了") + "</button></div>"; }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) { b.onclick = function () { board.alerts.splice(+b.getAttribute("data-i"), 1); if (!board.alerts.length) { try { document.title = document.title.replace(/^● [^—]*— /, ""); } catch (e) { } } drawAlerts(); }; });
    wrapEn();
  }
  var reg = null, curM = "pro6000", last = null;
  function rowFor(i) { var m = reg && reg.machines.filter(function (x) { return x.id === curM; })[0]; if (!m) return null; for (var k = 0; k < m.rows.length; k++) if (m.rows[k].gpus.indexOf(i) >= 0) return m.rows[k]; return null; }
  function drawBoard(d) {
    var g = $("rsBgrid"), st = $("rsBst"); if (!g) return;
    var m = reg.machines.filter(function (x) { return x.id === curM; })[0], byI = {}, h = "";
    d.gpus.forEach(function (x) { byI[x.index] = x; });
    h += '<table class="rs-ut"><thead><tr><th>GPU</th><th>' + bi("Now", "目前") + "</th><th>" + bi("Model service", "模型服務") + "</th><th>" + bi("Used by", "使用單位") + "</th></tr></thead><tbody>";
    m.rows.forEach(function (r) {
      r.gpus.forEach(function (i, n) {
        var x = byI[i]; h += "<tr>" + "<td><b>GPU " + i + "</b></td>";
        if (x) { var pc = Math.round(x.used_mib / x.total_mib * 100); h += '<td class="rs-now ' + (x.free ? "free" : "busy") + '"><em>' + (x.free ? bi("Free", "空卡") : bi("In use", "使用中")) + '</em><span class="rs-gbar"><i style="width:' + pc + '%"></i></span><span class="rs-gnum">' + gb(x.used_mib) + " / " + gb(x.total_mib) + " GB · " + x.util + "%</span></td>"; }
        else h += "<td>—</td>";
        if (n === 0) {
          h += '<td rowspan="' + r.gpus.length + '">' + (r.service ? bi(r.service, r.service_zh) + " " : "") + (r.tag ? "<b>" + bi(r.tag, r.tag_zh || r.tag) + "</b>" : "") + "</td>";
          h += '<td rowspan="' + r.gpus.length + '">' + bi(r.unit, r.unit_zh) + "</td>";
        }
        h += "</tr>";
      });
    });
    g.innerHTML = h + "</tbody></table>";
    st.innerHTML = bi(d.free_count + " free of " + d.gpus.length, "空卡 " + d.free_count + " / " + d.gpus.length) + " · " + esc(d.checked_at.slice(11));
    wrapEn();
  }
  function pollBoard() {
    if (!reg) return;
    fetch("/api/gpu/status?machine=" + encodeURIComponent(curM), { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      if (!d.ok) { $("rsBst").innerHTML = bi("No answer from the machine", "機器暫時沒有回應"); wrapEn(); return; }
      var now = {}, freed = [];
      d.gpus.forEach(function (x) { now[x.index] = x.free; if (board.prev && board.prev[x.index] === false && x.free) freed.push(x.index); });
      board.prev = now; last = d;
      drawBoard(d);
      if (freed.length) alertFree(freed);
    }).catch(function () {
      clearInterval(board.timer);
      $("rsBgrid").innerHTML = "";
      $("rsBst").innerHTML = bi("Live board works on the local platform only", "即時儀表板只能在本機平台使用");
      $("rsBal").style.display = "none";
      wrapEn();
    });
  }
  function initBoard() {
    var el = $("rsBoard"); if (!el) return;
    fetch("data/gpu-usage.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (R) {
      reg = R;
      var tabs = R.machines.map(function (m) { return '<button type="button" class="rs-mt' + (m.id === curM ? " on" : "") + '" data-m="' + m.id + '">' + esc(m.name) + "</button>"; }).join("");
      el.innerHTML = '<div class="rs-bh"><h3>' + bi("GPU board", "GPU 儀表板") + '</h3><span class="rs-mts">' + tabs + '</span><span class="rs-bst" id="rsBst"></span><button type="button" class="rs-tg" id="rsBal">' + bi("Turn on alerts", "開啟提醒") + '</button></div><div class="rs-alerts" id="rsBalert"></div><div class="rs-grid" id="rsBgrid"></div><p class="rs-bn">' + bi(R.note_en, R.note_zh) + " " + bi("An alert pops up when a GPU in use becomes free.", "使用中的 GPU 一旦空出來，會自動跳出提醒。") + "</p>";
      Array.prototype.forEach.call(el.querySelectorAll(".rs-mt"), function (b) { b.onclick = function () { curM = b.getAttribute("data-m"); board.prev = null; Array.prototype.forEach.call(el.querySelectorAll(".rs-mt"), function (x) { x.classList.toggle("on", x === b); }); pollBoard(); }; });
      $("rsBal").onclick = function () {
        try { board.ctx = board.ctx || new (window.AudioContext || window.webkitAudioContext)(); board.ctx.resume(); } catch (e) { }
        try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) { }
        $("rsBal").innerHTML = bi("Alerts on", "提醒已開"); beep(); wrapEn();
      };
      clearInterval(board.timer);
      board.prev = null;
      pollBoard();
      board.timer = setInterval(pollBoard, 5000);
      wrapEn();
    }).catch(function () { });
  }
  function render(P) {
    var ST = P.statuses;
    function pill(s) { var t = ST[s] || [s, ""]; return '<em class="p2-st ' + esc(s) + '">' + bi(t[0], t[1]) + "</em>"; }
    var H = P.headline;
    $("rsHead").innerHTML = '<p class="lr-big">' + bi(H.en, H.zh) + "</p>" + (H.items ? '<ol class="rs-hl">' + H.items.map(function (i) { return "<li>" + bi(i[0], i[1]) + "</li>"; }).join("") + "</ol>" : "") + (H.price ? '<p class="rs-price">' + bi(H.price[0], H.price[1]) + "</p>" : "");
    $("rsUpd").innerHTML = "Updated " + esc(P.updated) + '<small class="zhs">更新日期</small>';
    ["1", "2"].forEach(function (k) {
      var ph = P.phases[k], done = 0, n = 0;
      var steps = ph.steps.map(function (s) {
        var rows = s.tests.map(function (t) {
          n++; if (t.status === "done") done++;
          var tip = '<div class="p2-tip"><p class="p2-tn">' + bi(t.needs_en, t.needs_zh) + "</p></div>";
          return '<tr class="p2-row" tabindex="0"><td class="p2-id">' + esc(t.id) + '</td><td class="p2-t">' + bi(t.en, t.zh) + tip + '</td><td class="p2-c">' + bi(t.crit_en, t.crit_zh) +
            (t.result_en ? '<span class="p2-res">' + bi(t.result_en, t.result_zh) + "</span>" : "") + "</td><td>" + pill(t.status) + "</td></tr>";
        }).join("");
        var nd = s.tests.filter(function (t) { return t.status === "done"; }).length, st = nd === s.tests.length ? "done" : (nd ? "partial" : "planned");
        return '<section class="rs-step s' + s.n + '"><h2><i>' + s.n + "</i><span>" + bi(s.en, s.zh) + "</span></h2>" +
          '<p class="rs-m"><b>Meaning<small class="zhs">意義</small></b>' + bi(s.mean_en, s.mean_zh) + "</p>" +
          '<p class="rs-big' + (s.tone ? " t-" + s.tone : "") + '">' + esc(s.big) + "<span>" + bi(s.big_en, s.big_zh) + "</span></p>" +
          '<p class="rs-sum' + (s.tip_en ? " has-tip" : "") + '" tabindex="0"><b>' + bi(s.label_en, s.label_zh) + "</b>" + bi(s.sum_en, s.sum_zh) + (s.tip_en ? '<span class="rs-tip">' + bi(s.tip_en, s.tip_zh) + "</span>" : "") + "</p>" + pill(st) +
          kpi(s.kpi) + matrix(s.matrix) + (s.supp_en ? '<p class="rs-supp"><b>Supplement<small class="zhs">補充</small></b> ' + bi(s.supp_en.replace(/^Supplement: /, ""), s.supp_zh.replace(/^補充：/, "")) + "</p>" : "") + (s.proof_open ? proof(s.proof) : "") + '<button type="button" class="rs-tg">Data<small class="zhs">數據</small></button><div class="rs-data" hidden>' + (s.story ? '<h3>' + bi(s.story.title_en, s.story.title_zh) + '</h3><ol class="rs-story">' + s.story.items.map(function (i) { return "<li>" + bi(i[0], i[1]) + "</li>"; }).join("") + "</ol>" : '<table class="p2-tb"><tbody>' + rows + "</tbody></table>") + (s.proof_open ? "" : proof(s.proof)) + "</div></section>";
      }).join("");
      var body = '<div class="rs-mean"><b>Meaning<small class="zhs">意義</small></b><span>' + bi(ph.meaning_en, ph.meaning_zh) + '</span>' + (ph.verdict_en && done === n ? '<span class="rs-verdict">' + bi(ph.verdict_en, ph.verdict_zh) + "</span>" : "") + '</div><div class="rs-steps">' + steps + "</div>";
      if (k === "2") {      /* Monitor tab = the live GPU board only; the planned proof steps live in the third tab "Next Step" */
        $("rsPh2").innerHTML = ph.hidden ? "" : '<div class="rs-board" id="rsBoard"></div>';
        $("rsPh3").innerHTML = body;
        Array.prototype.forEach.call($("rsPh3").querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var d = b.nextElementSibling; d.hidden = !d.hidden; }; });
        $("lrTab2n").innerHTML = ""; $("lrTab3n").innerHTML = done === n ? bi("Done", "完成") : done + " / " + n;
        return;
      }
      $("rsPh" + k).innerHTML = body;
      Array.prototype.forEach.call($("rsPh" + k).querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var d = b.nextElementSibling; d.hidden = !d.hidden; }; });
      $("lrTab" + k + "n").innerHTML = done === n ? bi("Done", "完成") : done + " / " + n;
    });
    $("rsLater").innerHTML = "<summary>" + bi(P.later.en, P.later.zh) + " · " + P.later.items.length + "</summary><ul>" + P.later.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
    initBoard();
    wrapEn();
  }
  /* ---------- architecture picture: same machine, without and with Ray Serve (same look as the LiteLLM page) ---------- */
  (function () {
    var rect = function (x, y, w, h, fill, stroke, sw, dash) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw || 1.5) + '"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>"; };
    var txt = function (x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.a || "middle") + '" fill="' + (o.c || "#f3efe5") + '" font-size="' + (o.s || 18) + '" font-weight="' + (o.w || 700) + '">' + esc(t) + "</text>"; };
    var line = function (x1, y1, x2, y2, c, dash) { return '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="' + c + '" stroke-width="2" fill="none"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>"; };
    var AY = [40, 140, 240], APPS = ["Office AI", "AISO Platform", "Scripts"];
    var apps = function () { return APPS.map(function (a, i) { return rect(8, AY[i], 150, 44, "rgba(255,255,255,.06)", "#a89c88") + txt(83, AY[i] + 29, a, { s: 18 }); }).join(""); };
    var gate = function () { return AY.map(function (y) { return line(158, y + 22, 168, 165, "#a89c88"); }).join("") + rect(168, 133, 70, 64, "rgba(214,178,107,.14)", "#d6b26b", 2) + txt(203, 171, "LiteLLM", { c: "#d6b26b", s: 16, w: 800 }); };
    var chip = function (y, a, b, dash) { return rect(404, y, 136, 54, "rgba(255,255,255,.07)", "rgba(255,255,255,.28)", 1, dash) + txt(472, y + 24, a, { s: 17 }) + txt(472, y + 44, b, { s: 15, w: 500, c: "#cfc7b4" }); };
    var machine = function (second) { return rect(392, 78, 160, 174, "rgba(157,184,140,.12)", "#9db88c") + txt(406, 106, "PRO6000", { a: "start", s: 20 }) + chip(122, "GPU 1", "model copy 1", false) + chip(188, "GPU 7", second, second !== "model copy 2"); };
    var badge = function (x, y, n, c) { return '<circle cx="' + x + '" cy="' + y + '" r="15" fill="' + c + '"/>' + txt(x, y + 6, String(n), { c: "#111", s: 18, w: 800 }); };
    var svgNo = apps() + gate() + line(238, 165, 392, 149, "#d98a66") + line(238, 165, 392, 215, "#d98a66") + machine("model copy 2");
    var svgYes = apps() + gate() + line(238, 165, 256, 165, "#d6b26b") +
      rect(256, 125, 96, 80, "rgba(122,167,255,.14)", "#7aa7ff", 2) + txt(304, 160, "Ray Serve", { c: "#9fc0ff", s: 16, w: 800 }) + txt(304, 182, "auto 1 to 2", { c: "#9fc0ff", s: 14, w: 500 }) +
      line(352, 165, 392, 149, "#7aa7ff") + line(352, 165, 392, 215, "#7aa7ff", true) + machine("added when busy") +
      badge(262, 127, 3, "#7aa7ff") + badge(536, 92, 1, "#c8b875") + badge(410, 190, 2, "#5fd0c4");
    var svg = function (inner, label) { return '<svg class="lr-svg" viewBox="0 0 560 330" role="img" aria-label="' + label + '">' + inner + "</svg>"; };
    $("rsArch").innerHTML = '<div class="lr-vs">' +
      '<div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 Ray Serve</small></h3>' + svg(svgNo, "Each GPU runs one fixed copy of the model") +
      '<p class="lr-pt">Each GPU runs one <b>fixed</b> copy of the model and stays on all the time; adding or removing a copy has to be <b>done by hand</b>.<small class="zhs">每張 GPU 固定跑一份模型、一直開著；要增減得靠人工處理</small></p></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 Ray Serve</small></h3>' + svg(svgYes, "Ray Serve adds or removes the second copy by itself") +
      '<p class="lr-pt">Ray Serve adds a second copy when <b>many</b> people are using the service, and removes it when only <b>a few</b> are.<small class="zhs">人多時自動加開第 2 份，人少時自動收掉，把 GPU 還給其他工作</small></p></div></div>';
  })();
  wrapEn();
  var tabs = [["1", $("lrTab1"), $("rsPh1")], ["2", $("lrTab2"), $("rsPh2")], ["3", $("lrTab3"), $("rsPh3")]];
  function show(k) {
    tabs.forEach(function (t) { var on = t[0] === k; t[1].classList.toggle("on", on); t[1].setAttribute("aria-selected", on ? "true" : "false"); t[2].classList.toggle("lr-off", !on); });
    try { history.replaceState(null, "", "#phase" + k); } catch (e) { }
  }
  tabs.forEach(function (t) { t[1].onclick = function () { show(t[0]); }; });
  var h = ""; try { h = location.hash; } catch (e) { }
  show(/phase3/i.test(h) ? "3" : /phase2/i.test(h) ? "2" : "1");
  fetch("data/rayserve-phase2.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (P) {
    if (P.phases["2"].hidden) { P.phases["2"].steps = []; try { document.querySelector("main.lr").classList.add("rs-p2off"); } catch (e) { } show("1"); }      /* phase 2 is off for now: no tab, no panel, no GPU board polling (data kept in the JSON) */
    render(P);
  }).catch(function () {
    $("rsPh1").innerHTML = '<p class="lr-resnote">The plan is not available.<small class="zhs">計畫暫時無法顯示</small></p>';
  });
})();
