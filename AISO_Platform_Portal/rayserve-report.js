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
  function render(P) {
    var ST = P.statuses;
    function pill(s) { var t = ST[s] || [s, ""]; return '<em class="p2-st ' + esc(s) + '">' + bi(t[0], t[1]) + "</em>"; }
    $("rsHead").innerHTML = '<p class="lr-big">' + bi(P.headline.en, P.headline.zh) + '</p>';
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
          '<p class="rs-sum' + (s.tip_en ? " has-tip" : "") + '" tabindex="0"><b>' + bi(s.label_en, s.label_zh) + "</b>" + bi(s.sum_en, s.sum_zh) + (s.tip_en ? '<span class="rs-tip"><b>' + bi(s.tip_title_en || "Measured test", s.tip_title_zh || "實測依據") + "</b>" + bi(s.tip_en, s.tip_zh) + "</span>" : "") + "</p>" + pill(st) +
          kpi(s.kpi) + matrix(s.matrix) + (s.supp_en ? '<p class="rs-supp"><b>Supplement<small class="zhs">補充</small></b> ' + bi(s.supp_en.replace(/^Supplement: /, ""), s.supp_zh.replace(/^補充：/, "")) + "</p>" : "") + (s.proof_open ? proof(s.proof) : "") + '<button type="button" class="rs-tg">Data<small class="zhs">數據</small></button><div class="rs-data" hidden>' + (s.story ? '<h3>' + bi(s.story.title_en, s.story.title_zh) + '</h3><ol class="rs-story">' + s.story.items.map(function (i) { return "<li>" + bi(i[0], i[1]) + "</li>"; }).join("") + "</ol>" : '<table class="p2-tb"><tbody>' + rows + "</tbody></table>") + (s.proof_open ? "" : proof(s.proof)) + "</div></section>";
      }).join("");
      $("rsPh" + k).innerHTML = '<div class="rs-mean"><b>Meaning<small class="zhs">意義</small></b><span>' + bi(ph.meaning_en, ph.meaning_zh) + '</span>' + (ph.verdict_en && done === n ? '<span class="rs-verdict">' + bi(ph.verdict_en, ph.verdict_zh) + "</span>" : "") + '</div><div class="rs-steps">' + steps + "</div>";
      Array.prototype.forEach.call($("rsPh" + k).querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var d = b.nextElementSibling; d.hidden = !d.hidden; }; });
      $("lrTab" + k + "n").innerHTML = done + " / " + n;
    });
    $("rsLater").innerHTML = "<summary>" + bi(P.later.en, P.later.zh) + " · " + P.later.items.length + "</summary><ul>" + P.later.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
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
      '<p class="lr-pt">Every GPU runs one <b>fixed</b> copy, always on; adding or removing a copy is done <b>by hand</b><small class="zhs">每張 GPU 固定跑一份模型、一直開著；要增減得靠人工處理</small></p></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 Ray Serve</small></h3>' + svg(svgYes, "Ray Serve adds or removes the second copy by itself") +
      '<p class="lr-pt">Ray Serve adds the 2nd copy when <b>many</b> people use it and removes it when <b>few</b> do<small class="zhs">人多時自動加開第 2 份，人少時自動收掉，把 GPU 還給其他工作</small></p></div></div>';
  })();
  var tabs = [["1", $("lrTab1"), $("rsPh1")], ["2", $("lrTab2"), $("rsPh2")]];
  function show(k) {
    tabs.forEach(function (t) { var on = t[0] === k; t[1].classList.toggle("on", on); t[1].setAttribute("aria-selected", on ? "true" : "false"); t[2].classList.toggle("lr-off", !on); });
    try { history.replaceState(null, "", "#phase" + k); } catch (e) { }
  }
  tabs.forEach(function (t) { t[1].onclick = function () { show(t[0]); }; });
  var h = ""; try { h = location.hash; } catch (e) { }
  show("1");  /* phase 2 is not shown for now */
  fetch("data/rayserve-phase2.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(render).catch(function () {
    $("rsPh1").innerHTML = '<p class="lr-resnote">The plan is not available.<small class="zhs">計畫暫時無法顯示</small></p>';
  });
})();
