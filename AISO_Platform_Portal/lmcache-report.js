/* LMCache research page: architecture picture, then three parts (PF_Research / 架構 skill). All text lives in data/lmcache-report.json. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bi(en, zh) { return esc(en) + '<small class="zhs">' + esc(zh) + "</small>"; }
  function wrapEn() {
    try {
      var root = document.querySelector("main.lr"); if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll("small.zhs,.zh-i"), function (z) {
        var run = [], n = z.previousSibling;
        while (n) {
          if (n.nodeType === 3) { run.unshift(n); }
          else if (n.nodeType === 1) { if (n.classList.contains("en") || n.querySelector("small.zhs,.zh-i") || /^(P|UL|OL|DIV|TABLE|H1|H2|H3|SVG|SECTION)$/i.test(n.tagName)) break; run.unshift(n); } else break;
          n = n.previousSibling;
        }
        if (!run.length || !run.some(function (x) { return (x.textContent || "").trim(); })) return;
        var s = document.createElement("span"); s.className = "en"; z.parentNode.insertBefore(s, run[0]); run.forEach(function (x) { s.appendChild(x); });
      });
    } catch (e) { }
  }
  /* architecture: same server, without and with LMCache */
  (function () {
    var rect = function (x, y, w, h, fill, stroke, sw, dash) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw || 1.5) + '"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>"; };
    var txt = function (x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" text-anchor="middle" fill="' + (o.c || "#f3efe5") + '" font-size="' + (o.s || 18) + '" font-weight="' + (o.w || 700) + '">' + esc(t) + "</text>"; };
    var line = function (x1, y1, x2, y2, c, dash) { return '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="' + c + '" stroke-width="2" fill="none"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>"; };
    var users = rect(8, 120, 120, 90, "rgba(255,255,255,.06)", "#a89c88") + txt(68, 160, "Users", { s: 18 }) + txt(68, 186, "same prompt", { s: 15, w: 500, c: "#cfc7b4" });
    var gpu = function (sub) { return rect(170, 60, 230, 210, "rgba(157,184,140,.12)", "#9db88c") + txt(285, 90, "PRO6000 server", { s: 18 }) + rect(190, 112, 190, 62, "rgba(255,255,255,.07)", "rgba(255,255,255,.28)") + txt(285, 138, "vLLM + GPU", { s: 18 }) + txt(285, 161, sub, { s: 15, w: 500, c: "#cfc7b4" }); };
    var svgNo = users + line(128, 165, 170, 143, "#a89c88") + gpu("KV cache: GPU memory only") +
      rect(190, 196, 190, 56, "rgba(217,138,102,.14)", "#d98a66", 2, true) + txt(285, 220, "Cache thrown away", { c: "#d98a66", s: 17, w: 800 }) + txt(285, 241, "repeat = compute again", { c: "#d98a66", s: 15, w: 500 });
    var svgYes = users + line(128, 165, 170, 143, "#a89c88") + gpu("KV cache saved by LMCache") +
      rect(190, 196, 190, 56, "rgba(122,167,255,.14)", "#7aa7ff", 2) + txt(285, 220, "LMCache", { c: "#9fc0ff", s: 17, w: 800 }) + txt(285, 241, "keeps the KV cache", { c: "#9fc0ff", s: 15, w: 500 }) +
      line(400, 224, 440, 224, "#7aa7ff") + rect(440, 190, 112, 70, "rgba(95,208,196,.14)", "#5fd0c4", 2) + txt(496, 220, "CPU / SSD", { c: "#5fd0c4", s: 17, w: 800 }) + txt(496, 242, "load back", { c: "#5fd0c4", s: 15, w: 500 });
    var svg = function (inner, label) { return '<svg class="lr-svg" viewBox="0 0 560 330" role="img" aria-label="' + label + '">' + inner + "</svg>"; };
    $("lmArch").innerHTML = '<div class="lr-vs">' +
      '<div class="lr-side lr-no"><h3>Without<small class="zhs">沒有 LMCache</small></h3>' + svg(svgNo, "Without LMCache the KV cache stays in GPU memory and is lost") +
      '<p class="lr-pt">The KV cache lives only in <b>GPU memory</b>; when the same prompt comes again it is <b>computed again</b>.<small class="zhs">KV 快取只在 GPU 記憶體裡；同一段提示再來，就要重算一次</small></p></div>' +
      '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LMCache</small></h3>' + svg(svgYes, "LMCache saves the KV cache to CPU or SSD and loads it back") +
      '<p class="lr-pt">LMCache <b>saves</b> the KV cache to CPU / SSD and <b>loads it back</b> when the prompt repeats.<small class="zhs">LMCache 把 KV 快取存到 CPU / SSD，提示重複時直接讀回來</small></p></div></div>';
  })();
  var tabs = [["1", $("lrTab1"), $("lmPh1")], ["2", $("lrTab2"), $("lmPh2")], ["3", $("lrTab3"), $("lmPh3")]];
  function show(k) {
    tabs.forEach(function (t) { var on = t[0] === k; t[1].classList.toggle("on", on); t[1].setAttribute("aria-selected", on ? "true" : "false"); t[2].classList.toggle("lr-off", !on); });
    try { history.replaceState(null, "", "#part" + k); } catch (e) { }
  }
  tabs.forEach(function (t) { t[1].onclick = function () { show(t[0]); }; });
  var h = ""; try { h = location.hash; } catch (e) { }
  show(/part3/i.test(h) ? "3" : /part2/i.test(h) ? "2" : "1");
  fetch("data/lmcache-report.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (P) {
    var ST = P.statuses, H = P.headline;
    $("lmHead").innerHTML = '<p class="lr-big">' + bi(H.en, H.zh) + '</p><ol class="rs-hl">' + H.items.map(function (i) { return "<li>" + bi(i[0], i[1]) + "</li>"; }).join("") + "</ol>";
    $("lmUpd").innerHTML = "Updated " + esc(P.updated) + '<small class="zhs">更新日期</small>';
    P.parts.forEach(function (s) {
      var t = ST[s.status] || [s.status, ""];
      var mx = "";
      if (s.matrix) {
        var m = s.matrix;
        mx = '<div class="rs-proof rs-mx"><table><thead><tr>' + m.cols_en.map(function (c, i) { return "<th>" + (c ? bi(c, m.cols_zh[i]) : "") + "</th>"; }).join("") + "</tr></thead><tbody>" +
          m.rows.map(function (r) { return "<tr><td>" + bi(r[0], r[1]) + "</td>" + r.slice(2).map(function (v) { return '<td class="rs-gain">' + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
      }
      $("lmPh" + s.n).innerHTML = '<section class="rs-step s' + s.n + '"><h2><i>' + s.n + "</i><span>" + bi(s.en, s.zh) + "</span></h2>" +
        '<p class="rs-m"><b>Meaning<small class="zhs">意義</small></b>' + bi(s.mean_en, s.mean_zh) + "</p>" +
        '<p class="rs-big t-' + s.tone + '">' + esc(s.big) + "<span>" + bi(s.big_en, s.big_zh) + "</span></p>" +
        '<p class="rs-sum"><b>' + bi(s.label_en, s.label_zh) + "</b>" + bi(s.sum_en, s.sum_zh) + "</p>" +
        '<em class="p2-st ' + esc(s.status) + '">' + bi(t[0], t[1]) + "</em>" + mx +
        (s.report ? '<a class="lm-rep" href="' + esc(s.report.href) + '">' + bi(s.report.en, s.report.zh) + ' <span aria-hidden="true">→</span></a>' : "") + '<button type="button" class="rs-tg">Data<small class="zhs">數據</small></button><div class="rs-data" hidden><ul class="rs-calc">' + s.data.map(function (i) { return "<li>" + bi(i[0], i[1]) + "</li>"; }).join("") + "</ul></div></section>";
      $("lrTab" + s.n + "n").innerHTML = bi(t[0], t[1]);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var d = b.nextElementSibling; d.hidden = !d.hidden; }; });
    wrapEn();
  }).catch(function () { $("lmPh1").innerHTML = '<p class="lr-resnote">The page data is not available.<small class="zhs">頁面資料暫時無法顯示</small></p>'; });
  wrapEn();
})();
