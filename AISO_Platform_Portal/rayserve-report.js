/* Ray Serve page: two phases, three steps each; every phase opens with its meaning, every step says what we will see when it is done.
   All content lives in data/rayserve-phase2.json: edit the status / result there after each run. No addresses, keys or paths. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bi(en, zh) { return esc(en) + '<small class="zhs">' + esc(zh) + "</small>"; }
  function proof(p) {
    if (!p) return "";
    var mx = Math.max.apply(null, p.rows.map(function (r) { return +r[2]; }));
    return '<div class="rs-proof"><h3>' + bi(p.title_en, p.title_zh) + '</h3><p class="rs-unit">' + bi(p.unit_en, p.unit_zh) + "</p><table><thead><tr>" +
      p.cols_en.map(function (c, i) { return "<th>" + bi(c, p.cols_zh[i]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      p.rows.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td><span class="rs-bar a" style="width:' + Math.round(+r[1] / mx * 100) + '%">' + esc(r[1]) + '</span></td><td><span class="rs-bar b" style="width:' + Math.round(+r[2] / mx * 100) + '%">' + esc(r[2]) + '</span></td><td class="rs-gain">' + esc(r[3]) + "</td></tr>"; }).join("") +
      '</tbody></table><p class="rs-pn">' + bi(p.note_en, p.note_zh) + "</p></div>";
  }
  function render(P) {
    var ST = P.statuses;
    function pill(s) { var t = ST[s] || [s, ""]; return '<em class="p2-st ' + esc(s) + '">' + bi(t[0], t[1]) + "</em>"; }
    $("rsHead").innerHTML = '<p class="lr-big">' + bi(P.headline.en, P.headline.zh) + '</p><p class="p2-upd">Updated ' + esc(P.updated) + '<small class="zhs">更新日期</small></p>';
    ["1", "2"].forEach(function (k) {
      var ph = P.phases[k], done = 0, n = 0;
      var steps = ph.steps.map(function (s) {
        var rows = s.tests.map(function (t) {
          n++; if (t.status === "done") done++;
          var tip = '<div class="p2-tip"><p class="p2-tn">' + bi(t.needs_en, t.needs_zh) + "</p></div>";
          return '<tr class="p2-row" tabindex="0"><td class="p2-id">' + esc(t.id) + '</td><td class="p2-t">' + bi(t.en, t.zh) + tip + '</td><td class="p2-c">' + bi(t.crit_en, t.crit_zh) +
            (t.result_en ? '<span class="p2-res">' + bi(t.result_en, t.result_zh) + "</span>" : "") + "</td><td>" + pill(t.status) + "</td></tr>";
        }).join("");
        var st = s.tests.every(function (t) { return t.status === "done"; }) ? "done" : "planned";
        return '<section class="rs-step s' + s.n + '"><h2><i>' + s.n + "</i><span>" + bi(s.en, s.zh) + "</span></h2>" +
          '<p class="rs-m"><b>Meaning<small class="zhs">意義</small></b>' + bi(s.mean_en, s.mean_zh) + "</p>" +
          '<p class="rs-big">' + esc(s.big) + "<span>" + bi(s.big_en, s.big_zh) + "</span></p>" +
          '<p class="rs-sum"><b>' + bi(s.label_en, s.label_zh) + "</b>" + bi(s.sum_en, s.sum_zh) + "</p>" + pill(st) +
          '<button type="button" class="rs-tg">Data<small class="zhs">數據</small></button><div class="rs-data" hidden><table class="p2-tb"><tbody>' + rows + "</tbody></table>" + proof(s.proof) + "</div></section>";
      }).join("");
      $("rsPh" + k).innerHTML = '<div class="rs-mean"><b>Meaning<small class="zhs">意義</small></b><span>' + bi(ph.meaning_en, ph.meaning_zh) + '</span>' + (ph.verdict_en && done === n ? '<span class="rs-verdict">' + bi(ph.verdict_en, ph.verdict_zh) + "</span>" : "") + '</div><div class="rs-steps">' + steps + "</div>";
      Array.prototype.forEach.call($("rsPh" + k).querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var d = b.nextElementSibling; d.hidden = !d.hidden; }; });
      $("lrTab" + k + "n").innerHTML = done + " / " + n;
    });
    $("rsLater").innerHTML = "<summary>" + bi(P.later.en, P.later.zh) + " · " + P.later.items.length + "</summary><ul>" + P.later.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
  }
  var tabs = [["1", $("lrTab1"), $("rsPh1")], ["2", $("lrTab2"), $("rsPh2")]];
  function show(k) {
    tabs.forEach(function (t) { var on = t[0] === k; t[1].classList.toggle("on", on); t[1].setAttribute("aria-selected", on ? "true" : "false"); t[2].classList.toggle("lr-off", !on); });
    try { history.replaceState(null, "", "#phase" + k); } catch (e) { }
  }
  tabs.forEach(function (t) { t[1].onclick = function () { show(t[0]); }; });
  var h = ""; try { h = location.hash; } catch (e) { }
  show(/phase2/i.test(h) ? "2" : "1");
  fetch("data/rayserve-phase2.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(render).catch(function () {
    $("rsPh1").innerHTML = '<p class="lr-resnote">The plan is not available.<small class="zhs">計畫暫時無法顯示</small></p>';
  });
})();
