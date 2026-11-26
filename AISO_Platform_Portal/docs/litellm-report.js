/* LiteLLM gateway: the same benchmark with and without LiteLLM, on our real machines and models.
   KPI = TTFT, TPOT and TPS (Normalized and Aggregate), each at three input sizes. Numbers shown before a run are the mean of two earlier
   smoke-test runs on 2026-11-17 (the same code path as the Run button). No addresses, keys or paths. */
(function () {
  "use strict";
  var lights = [], healthB = null;   // connection lights, filled by the health check (declared first: other code reads them)
  var M = { a: "AISO1", b: "PRO6000", ma: "Gemma 4 26B Q4", mb: "Gemma 4 26B BF16" };
  var D = {
    tested: "2026-11-17", np: 4,
    sizes: [{"key": "short", "tok": 29, "a": {"ttft_s": 2.67, "tpot_ms": 23.4, "agg_tps": 79.2, "norm_tps": 19.8}, "ab": {"ttft_s": 0.7, "tpot_ms": 15.6, "agg_tps": 127.7, "norm_tps": 31.9}}, {"key": "mid", "tok": 110, "a": {"ttft_s": 2.96, "tpot_ms": 24.8, "agg_tps": 72.8, "norm_tps": 18.2}, "ab": {"ttft_s": 0.73, "tpot_ms": 11.8, "agg_tps": 137.6, "norm_tps": 34.4}}, {"key": "long", "tok": 910, "a": {"ttft_s": 4.77, "tpot_ms": 31.2, "agg_tps": 49.1, "norm_tps": 12.2}, "ab": {"ttft_s": 1.46, "tpot_ms": 21.1, "agg_tps": 82.2, "norm_tps": 20.5}}],
    notes: [
      [M.a + " runs Q4 and " + M.b + " runs BF16: not like-for-like. The gain shows gateway scaling, not a hardware ranking.", M.a + " 用 Q4、" + M.b + " 用 BF16，精度不同；倍數代表閘道分流效果，不是機器排名"],
      ["Both machines are shared with other users. Values vary between runs.", "兩台機器為共用資源，各次量測數值會有差異"],
      ["Without LiteLLM = " + M.a + " only (today's setup). With LiteLLM = the same requests spread over both machines. TTFT drops mostly because fewer requests wait in a queue.", "沒有 LiteLLM ＝ 僅連接 " + M.a + "（目前配置）；有 LiteLLM ＝ 相同請求分散至兩台。TTFT 縮短主要因為排隊的請求減少"],
      ["An application can also distribute requests itself and reach a similar speed; LiteLLM spares every application from implementing it.", "應用程式自行分流可得相近的速度；LiteLLM 的價值在於各應用無須自行實作"],
      ["Tokens are counted as streamed pieces; output is capped at 100 tokens per request.", "token 以串流片段計數；每個請求的輸出上限為 100 tokens"],
      ["It is one more service to operate.", "需額外維運一項服務"]
    ]
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f1 = function (n) { return n.toFixed(1); }, f2 = function (n) { return n.toFixed(2); };

  /* ---------- KPI: four metrics, each Without -> With LiteLLM at three input sizes ---------- */
  var notesHtml = '<ul class="lr-nl">' + D.notes.map(function (n) { return "<li>" + esc(n[0]) + "<small>" + esc(n[1]) + "</small></li>"; }).join("") + "</ul>";
  var SIZE = { short: ["Sentence", "一句話"], mid: ["Paragraph", "一段文字"], long: ["Long passage", "長篇文字"] };
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
  /* results build up row by row while the test runs: mode "running" (some sizes still to come), "done" or "fail" (below 1.3x) */
  var LANGNAME = { en: ['English input', 'English 輸入'], zh: ['Chinese input', '中文輸入'] };
  /* one line chart per metric: x = input size, two lines (without / with LiteLLM), value printed at every point */
  var UNIT = { ttft_s: "s", tpot_ms: "ms", norm_tps: "tokens/s", agg_tps: "tokens/s" };
  function niceStep(r) { var p = Math.pow(10, Math.floor(Math.log(r) / Math.LN10)), n = r / p; return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * p; }
  function lineChart(m, by, all, sizes) {
    var W = 540, H = 304, L = 56, R = 22, T = 48, B = 66, pw = W - L - R, ph = H - T - B, ks = ["short", "mid", "long"], vals = [];
    ks.forEach(function (k) { if (by[k]) vals.push(by[k].a[m.f], by[k].ab[m.f]); });
    var step = niceStep((vals.length ? Math.max.apply(null, vals) : 1) * 1.25 / 4), top = step * 4;
    var X = function (i) { return L + pw * (i + 0.5) / 3; }, Y = function (v) { return T + ph - (v / top) * ph; };
    var num = function (v) { return m.f === "ttft_s" ? f2(v) : f1(v); }, tk = function (v) { return step % 1 === 0 ? String(Math.round(v)) : v.toFixed(step < 0.1 ? 2 : 1); };
    var g = "";
    for (var t = 0; t <= 4; t++) g += '<line class="lr-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(step * t).toFixed(1) + '" y2="' + Y(step * t).toFixed(1) + '"/><text class="lr-tk" x="' + (L - 8) + '" y="' + (Y(step * t) + 5).toFixed(1) + '" text-anchor="end">' + tk(step * t) + "</text>";
    var gainOf = function (z) { return (m.low ? 1 - z.ab[m.f] / z.a[m.f] : z.ab[m.f] / z.a[m.f] - 1) * 100; };      // positive = faster with LiteLLM
    ks.forEach(function (k, i) {
      var cx = X(i).toFixed(1);
      g += '<text class="lr-xl" x="' + cx + '" y="' + (H - 34) + '" text-anchor="middle">' + SIZE[k][0] + '</text><text class="lr-xs" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + SIZE[k][1] + (by[k] ? " · " + by[k].tok + " tok" : "") + "</text>";
      if (by[k]) {                                                                   // small faint note straight above the two points: how much faster with LiteLLM
        var pc = Math.round(gainOf(by[k])), ok = pc >= 0, n = Math.abs(pc), hi = Math.min(Y(by[k].a[m.f]), Y(by[k].ab[m.f]));
        g += '<text class="lr-gn ' + (ok ? "good" : "bad") + '" x="' + cx + '" y="' + (hi - 36).toFixed(1) + '" text-anchor="middle">' + n + "% " + (ok ? "faster" : "slower") + " " + (ok ? "快" : "慢") + n + "%</text>";
      }
    });
    ["a", "ab"].forEach(function (mk) {
      var pts = ks.map(function (k, i) { return by[k] ? { x: X(i), y: Y(by[k][mk][m.f]), v: by[k][mk][m.f], o: by[k][mk === "a" ? "ab" : "a"][m.f] } : null; }).filter(Boolean);
      if (pts.length > 1) g += '<polyline class="lr-ln ' + mk + '" points="' + pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ") + '"/>';
      pts.forEach(function (p) {
        var above = p.v > p.o || (p.v === p.o && mk === "a");              // the higher of the two prints its value above, the lower one below
        g += '<circle class="lr-pt ' + mk + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="6"/><text class="lr-pv ' + mk + '" x="' + p.x.toFixed(1) + '" y="' + (above ? p.y - 13 : p.y + 26).toFixed(1) + '" text-anchor="middle">' + num(p.v) + "</text>";
      });
    });
    var hero = "…", cls = "", word = "faster", zhw = "快";
    if (all) { var pct = Math.round(sizes.reduce(function (t, z) { return t + gainOf(z); }, 0) / sizes.length); cls = pct >= 0 ? "good" : "bad"; hero = Math.abs(pct) + "%"; if (pct < 0) { word = "slower"; zhw = "慢"; } }
    return '<div class="lr-chart"><h4>' + m.name + '<small class="zhs">' + m.zh + '</small><em>' + UNIT[m.f] + " · " + (m.low ? "lower is better" : "higher is better") + '<small class="zhs">' + (m.low ? "越低越好" : "越高越好") + '</small></em></h4>' +
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + m.name + ' without and with LiteLLM, by input size">' + g + "</svg>" +
      '<p class="lr-kd"><b class="' + cls + '">' + hero + '</b><span>' + word + ' with LiteLLM, on average<small class="zhs">經 LiteLLM 平均' + zhw + '</small></span></p></div>';
  }
  /* the text sent in each size comes from the platform: a real web article, with its real token and character counts */
  var curInput = null;
  function nf(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function inputHtml(inp) {
    if (!inp || !inp.sizes) return "";
    var zh = inp.lang === "zh";
    var rows = inp.sizes.map(function (z) {
      return '<li><b>' + SIZE[z.key][0] + '<small class="zhs">' + SIZE[z.key][1] + "</small></b><span><q>" + esc(z.preview) + "</q>" +
        '<em>' + nf(z.tokens) + " tokens</em><em>" + nf(z.chars) + (zh ? " Chinese characters<small class=\"zhs\">個中文字</small>" : " English characters<small class=\"zhs\">個英文字元</small>") + "</em></span></li>";
    }).join("");
    return '<div class="lr-inp"><p class="lr-inph">Input text<small class="zhs">輸入文字</small><span class="lr-src">Source: <a href="' + esc(inp.url) + '" target="_blank" rel="noopener">Wikipedia · ' + esc(inp.title) + "</a> · " + esc(inp.license) + '<small class="zhs">取自網路，每次執行自動擷取</small></span></p><ul>' + rows + "</ul></div>";
  }
  function buildResults(sizes, mode, at, lang, input, target) {
    var el = target || $("lrConcl"), by = {}; sizes.forEach(function (z) { by[z.key] = z; });
    var all = sizes.length === 3;
    var cards = METRICS.map(function (m) { return lineChart(m, by, all, sizes); }).join("");
    var tag = mode === "running" ? '<em class="lr-run2">Measuring · ' + sizes.length + " / 3<small class=\"zhs\">量測中</small></em>"
      : (mode === "prev" || mode === "prevfail") ? '<em class="lr-prevtag">PREVIOUS RUN<small class="zhs">前一次結果</small></em>'
      : '<em class="lr-live">LIVE</em>';
    el.innerHTML = '<span class="lr-cl">TTFT · TPOT · TPS<small class="zhs">速度差異</small>' + tag + (lang && LANGNAME[lang] ? '<em class="lr-langtag">' + LANGNAME[lang][0] + '<small class="zhs">' + LANGNAME[lang][1] + "</small></em>" : "") +
      ((mode === "fail" || mode === "prevfail") ? '<em class="lr-below">Below 1.3×: not confirmed<small class="zhs">未達 1.3 倍，未達標</small></em>' : "") + '</span>' + inputHtml(input || curInput) +
      '<p class="lr-legend"><span><i class="a"></i>Without LiteLLM<small class="zhs">沒有 LiteLLM · ' + M.a + ' only</small></span><span><i class="ab"></i>With LiteLLM<small class="zhs">有 LiteLLM · ' + M.a + ' + ' + M.b + '</small></span></p>' +
      '<div class="lr-charts">' + cards + "</div>";
    el.hidden = false; if (!target) $("lrResNote").hidden = true;
  }
  function showPartial(list) {
    D.sizes = list.map(function (z) { return { key: z.key, tok: z.tokens, chars: z.chars, a: z.a, ab: z.ab }; });
    buildResults(D.sizes, "running", undefined, runLang, curInput);
  }

  /* earlier runs are remembered in this browser (localStorage); the newest comes first, five at most */
  var HKEY = "aiso.litellm.runs";
  function loadHist() { try { return JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch (e) { return []; } }
  function saveHist(h) { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 5))); } catch (e) {} }
  function runSummary(run) {
    return METRICS.map(function (m) {
      var mean = run.sizes.reduce(function (t, z) { return t + (m.low ? 1 - z.ab[m.f] / z.a[m.f] : z.ab[m.f] / z.a[m.f]); }, 0) / run.sizes.length;
      return '<span><i>' + m.name.replace("TPS · ", "TPS ") + '</i><b class="' + (mean > (m.low ? 0 : 1) ? "good" : "bad") + '">' + (m.low ? "−" + Math.round(mean * 100) + "%" : "×" + mean.toFixed(2)) + "</b></span>";
    }).join("");
  }
  var shownPrev = null;
  function paintPrev(run, label) {
    var el = $("lrPrev"); shownPrev = run;
    $("lrToolPrev").hidden = !run;
    if (!run) { el.innerHTML = ""; if (toolOpen === "prev") openTool(null); return; }
    el.innerHTML = '<div class="lr-prevh"><b>' + label + '<small class="zhs">' + (label === "Previous run" ? "前一次結果" : "上次結果") + '</small></b><em>' + esc(run.at || "") + (run.lang && LANGNAME[run.lang] ? " · " + LANGNAME[run.lang][0] : "") + '</em>' + (run.pass ? "" : '<em class="lr-below">below 1.3×</em>') + '</div><div class="lr-prevs">' + runSummary(run) + '</div><div class="lr-prevd" id="lrPrevD"></div>';
    buildResults(run.sizes, run.pass ? "prev" : "prevfail", run.at, run.lang, run.input, $("lrPrevD"));
  }
  /* Last run / Script / Notes: three buttons on the right above the results. Hover opens a panel over the page, moving the mouse away closes it
     (a click also toggles it, for touch screens and keyboards). */
  var toolOpen = null, scriptLoaded = false, toolTimer = null;
  function openTool(p) {
    toolOpen = p;
    Array.prototype.forEach.call($("lrTools").querySelectorAll("button"), function (b) { var on = b.dataset.p === toolOpen; b.className = on ? "on" : ""; b.setAttribute("aria-expanded", on ? "true" : "false"); });
    Array.prototype.forEach.call($("lrToolP").querySelectorAll(".lr-tp"), function (d) { d.hidden = d.dataset.p !== toolOpen; });
    $("lrToolP").hidden = !toolOpen;
    if (toolOpen === "script" && !scriptLoaded) {
      fetch(API + "/script", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) { $("lrScript").textContent = d.text; scriptLoaded = true; })
        .catch(function () { $("lrScript").textContent = "The script is shown on the local platform only.\nIt lives in the repository at benchmark/litellm_smoke.py."; });
    }
  }
  var toolWrap = $("lrToolWrap");
  Array.prototype.forEach.call($("lrTools").querySelectorAll("button"), function (b) {
    b.onmouseenter = function () { clearTimeout(toolTimer); openTool(b.dataset.p); };
    b.onclick = function () { openTool(toolOpen === b.dataset.p ? null : b.dataset.p); };
  });
  toolWrap.onmouseenter = function () { clearTimeout(toolTimer); };
  toolWrap.onmouseleave = function () { clearTimeout(toolTimer); toolTimer = setTimeout(function () { openTool(null); }, 220); };
  $("lrNotesP").innerHTML = notesHtml;
  function conclusion(pass) { buildResults(D.sizes, pass ? "done" : "fail", undefined, D.lang, D.input); }

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
    '<p class="lr-pt">Requests are distributed <b>manually</b>, and every application must add an endpoint for each machine (<b>6 links</b>)<small class="zhs">手動分配請求，並在每個應用程式增設各機器的 endpoint（共 6 條連線）</small></p></div>' +
    '<div class="lr-side lr-yes"><h3>With<small class="zhs">有 LiteLLM</small></h3>' + svg(svgWith, "Three clients connect to one gateway, which connects to both machines") +
    '<p class="lr-pt">Requests are distributed <b>automatically</b>, with automatic failover; applications use <b>one endpoint</b> and stay unchanged<small class="zhs">自動分配請求並自動備援，應用程式只需一個 endpoint，無須更動</small></p></div></div>';


  /* ---------- the four things LiteLLM does, in plain words, each with its proof status ---------- */
  /* four sentences, one benefit each (numbers appear only after a test has run) */
  var FUNCS = [
    ["Spread load", "分流", "Spreads requests across machines to cut waiting and raise total throughput.", "請求分散到多台機器，縮短等待、提高整體吞吐。", "measured"],
    ["Failover", "備援", "If one machine fails, another keeps answering.", "一台機器故障，另一台繼續回應。", ""],
    ["Single entry", "統一入口", "Apps call one address; LiteLLM picks the machine.", "應用程式只打一個網址，由 LiteLLM 選機器。", ""],
    ["Easy scaling", "易擴充", "Add a machine to the list; apps stay unchanged.", "新增機器只需加進清單，應用程式不用改。", ""]
  ];
  var TAG = { measured: ["Measured", "實測"] };
  /* hovering a benefit lights it up; the first one grows downward with the line charts of the measured results (this page's own run, else the previous run) */
  function funcData(i) {
    if (i !== 0) return "";
    var run = D.live ? { sizes: D.sizes } : (loadHist()[0] || PUB);
    if (!run || !run.sizes || !run.sizes.length) return '<div class="lr-fd"><div><p class="lr-fdn">Run the test to see the numbers.<small class="zhs">執行測試後顯示數據。</small></p></div></div>';
    var by = {}; run.sizes.forEach(function (z) { by[z.key] = z; });
    var cards = METRICS.map(function (m) { return lineChart(m, by, run.sizes.length === 3, run.sizes); }).join("");
    return '<div class="lr-fd"><div><p class="lr-legend"><span><i class="a"></i>Without LiteLLM<small class="zhs">沒有 LiteLLM · ' + M.a + ' only</small></span><span><i class="ab"></i>With LiteLLM<small class="zhs">有 LiteLLM · ' + M.a + ' + ' + M.b + '</small></span></p><div class="lr-charts">' + cards + "</div></div></div>";
  }
  function renderFuncs() {
    $("lrFuncs").innerHTML = '<ol class="lr-ef">' + FUNCS.map(function (f, i) {
      var tag = f[4] && (f[4] !== "measured" || D.live) ? '<em class="lr-tg ' + f[4] + '">' + TAG[f[4]][0] + '<small class="zhs">' + TAG[f[4]][1] + "</small></em>" : "";
      return '<li tabindex="0"><i>' + (i + 1) + '</i><span><strong class="lr-ft">' + esc(f[0]) + '<small class="zhs">' + esc(f[1]) + '</small></strong><span class="lr-fs">' + esc(f[2]) + '<small class="zhs">' + esc(f[3]) + "</small></span>" +
        (i === 0 || i === 1 ? '<b class="lr-fst" id="lrFst' + i + '" role="status"></b>' : "") + "</span>" + tag + funcData(i) + "</li>";
    }).join("") + "</ol>";
    paintFuncs();
  }
  renderFuncs();
  /* the newest local run, published with the site, so the online page (no backend, empty browser history) still shows the measured numbers */
  var PUB = null;
  try { fetch("data/litellm-published-run.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.sizes && j.sizes.length) { PUB = j; if (!D.live && !loadHist()[0]) renderFuncs(); } }).catch(function () {}); } catch (e) {}

  /* ---------- smoke test: runs on the LOCAL platform only (needs the backend described in the design) ---------- */
  var logNext = 0, API = "/api/litellm", runEl = $("lrRun"), job = null, poll = null;

  /* What the smoke test does, as ticking checklists. Mirrors plan() in benchmark/litellm_smoke.py (the backend sends its own copy when available). */
  var it = function (en, zh) { return { label: en, zh: zh }; };
  var PLAN = { steps: [
    { name: "Preflight", zh: "檢查", sends: [], items: [it("Gateway reachable", "閘道可連線"), it("Machines reachable", "主機可連線"), it("No other test in progress", "無其他測試進行中"), it("Test key and model available", "測試金鑰與模型可用"), it("Input text taken from the web", "自網路擷取輸入文字")] },
    { name: "Benchmark", zh: "速度", sends: [{ prompt: "Excerpt of a web article (a sentence, a paragraph or a long passage) + a summary request", tokens: 100, meta: "8 requests, 4 at once, x 2" }], items: [it("Sentence (one line of text)", "一句話"), it("Paragraph (about 100 input tokens)", "一段文字（約 100 input tokens）"), it("Long passage (about 1000 input tokens)", "長篇文字（約 1000 input tokens）"), it("Mean Aggregate TPS gain with LiteLLM at least 1.3x", "經 LiteLLM 後 Aggregate TPS 平均提升至少 1.3 倍")] }
  ] };
  var TICK = { wait: "○", run: "◔", ok: "✓", fail: "✗", skip: "–" }, DONE = { wait: ["Waiting", "等待"], run: ["Running", "執行中"], ok: ["Complete", "完成"], fail: ["Failed", "未通過"], skip: ["Skipped", "略過"] };
  var shown = {}, shownVal = {};   // what has already been drawn, so only something new pops in
  /* two stages, one above the other. Items stay hidden until the test reaches them; each one then pops in, and its value pops out to the right. */
  function planHtml(st, items) {
    return '<ol class="lr-plan lr-stack">' + PLAN.steps.map(function (p, i) {
      var x = (st && st[i]) || { state: "wait", detail: "" }, lab = DONE[x.state] || DONE.wait, its = (items && items[i]) || [];
      var q = x.state === "wait" ? "" : (p.sends || []).map(function (q) { return '<p class="lr-qs"><span class="lr-q">“' + esc(q.prompt) + '”</span><span class="lr-meta">' + esc(q.meta || "") + "</span></p>"; }).join("");
      var list = p.items.map(function (m, j) {
        var y = its[j] || { state: "wait", value: "" }, key = i + "-" + j;
        if (y.state === "wait") return "";                                     // not reached yet: nothing to show
        var pop = shown[key] === undefined, vpop = y.value && shownVal[key] !== y.value;
        shown[key] = y.state; shownVal[key] = y.value || "";
        return '<li class="' + esc(y.state) + (pop ? " pop" : "") + '"><i aria-hidden="true">' + (TICK[y.state] || "○") + '</i><span>' + esc(m.label) + '<small class="zhs">' + esc(m.zh) + "</small></span>" + (y.value ? '<b class="' + (vpop ? "vpop" : "") + '">' + esc(y.value) + "</b>" : "") + "</li>";
      }).join("");
      var chip = '<em class="lr-sst ' + esc(x.state) + '">' + (TICK[x.state] || "○") + " " + lab[0] + '<small class="zhs">' + lab[1] + "</small></em>";
      return '<li class="' + esc(x.state) + '"><div class="lr-ph"><b>' + (i + 1) + " · " + esc(p.name) + '<small class="zhs">' + esc(p.zh) + "</small></b>" + chip + "</div>" + q + (list ? '<ul class="lr-ck">' + list + "</ul>" : "") + "</li>";
    }).join("") + "</ol>";
  }
  /* run time, top right of the terminal: counts up while the test runs, then stays as the total until Reset */
  var t0 = 0, tEnd = 0, clockT = null;
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return ("0" + Math.floor(s / 60)).slice(-2) + ":" + ("0" + (s % 60)).slice(-2); }
  function paintClock() {
    var e = $("lrTermClock"); if (!e) return;
    if (!t0) { e.innerHTML = ""; e.className = "lr-term-clock"; return; }
    e.className = "lr-term-clock" + (tEnd ? " done" : "");
    e.innerHTML = (tEnd ? "Total time<small class=\"zhs\">總運作時間</small>" : "Running time<small class=\"zhs\">運作時間</small>") + "<b>" + mmss((tEnd || Date.now()) - t0) + "</b>";
  }
  function clockStart() { t0 = Date.now(); tEnd = 0; if (clockT) clearInterval(clockT); clockT = setInterval(paintClock, 500); paintClock(); }
  function clockStop() { if (!tEnd && t0) tEnd = Date.now(); if (clockT) { clearInterval(clockT); clockT = null; } paintClock(); }
  function clockClear() { clockStop(); t0 = 0; tEnd = 0; paintClock(); }
  function runUI(mode, msg, st, items) {
    runEl.innerHTML = '<div class="lr-runrow"><button type="button" class="lr-runbtn' + (mode === "running" ? " busy" : "") + '" id="lrRunBtn"' + (mode === "ready" ? "" : " disabled") + '><span>' + (mode === "running" ? "Running" : "Run smoke test") + '</span><small class="zhs">' + (mode === "running" ? "執行中" : "實測") + '</small><i aria-hidden="true">→</i></button><span class="lr-runmsg">' + (msg || "") + "</span></div>" + planHtml(st, items);
    var row = runEl.querySelector(".lr-runrow");
    if (mode === "running") row.querySelector(".lr-runbtn").insertAdjacentHTML("afterend", '<button type="button" class="lr-ghost" id="lrStopBtn">Stop<small class="zhs">停止</small></button>');
    else if (mode === "ready" && hasRun) row.querySelector(".lr-runbtn").insertAdjacentHTML("afterend", '<button type="button" class="lr-ghost" id="lrResetBtn">Reset<small class="zhs">重置</small></button>');
    row.insertAdjacentHTML("beforeend", '<span class="lr-pwnote">*Test password: contact staff<small class="zhs">測試密碼請洽工作人員</small></span>');
    row.insertAdjacentHTML("afterend", '<div class="lr-lights" id="lrLights" role="status" aria-label="Connection status">' + lightsHtml() + "</div>" +
      '<div class="lr-langsel" role="group" aria-label="Input language"><span>Input language<small class="zhs">輸入語言</small></span>' +
      ["en", "zh"].map(function (l) { return '<button type="button" data-l="' + l + '" class="' + (inputLang === l ? "on" : "") + '"' + (mode === "ready" ? "" : " disabled") + ">" + (l === "en" ? "English" : "中文") + "</button>"; }).join("") + "</div>");
    Array.prototype.forEach.call(runEl.querySelectorAll(".lr-langsel button"), function (b) { b.onclick = function () { inputLang = b.dataset.l; Array.prototype.forEach.call(runEl.querySelectorAll(".lr-langsel button"), function (x) { x.className = x.dataset.l === inputLang ? "on" : ""; }); }; });
    if (mode === "ready") $("lrRunBtn").onclick = startRun;
    if ($("lrStopBtn")) $("lrStopBtn").onclick = stopRun;
    if ($("lrResetBtn")) $("lrResetBtn").onclick = resetAll;
  }
  var hasRun = false, inputLang = "en", runLang = "en";
  function stopRun() {
    if (!job) return;
    fetch(API + "/smoke/" + job + "/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(function () {});
    $("lrStopBtn").disabled = true;
  }
  /* back to the state before any test: stages waiting, terminal and result hidden; the earlier runs stay available */
  function resetAll() {
    if (poll) { clearInterval(poll); poll = null; }
    job = null; hasRun = false; shown = {}; shownVal = {}; D.live = false; logNext = 0; clockClear();
    $("lrTerm").hidden = true; $("lrTerm").classList.remove("folded"); $("lrTermFold").setAttribute("aria-expanded", "true"); $("lrTermFold").firstChild.nodeValue = "Fold "; $("lrTermFold").querySelector("small").textContent = "收合"; $("lrTermBody").textContent = ""; $("lrTermN").textContent = "0 lines";
    $("lrConcl").hidden = true; $("lrConcl").innerHTML = "";
    $("lrResNote").hidden = false; $("lrResNote").innerHTML = 'Results appear here as the test runs.<small class="zhs">測試進行時，結果顯示於此</small>';
    renderFuncs(); runUI("ready", ""); paintPrev(loadHist()[0] || null, "Last run");
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
  var WHY = { "no connection": ["No connection", "無法連線"], "gateway unreachable": ["Gateway unreachable", "閘道無法連線"], "not set": ["Not configured", "尚未設定"], "refused by the gateway": ["Key rejected", "金鑰遭拒"] };
  function why(d) { if (WHY[d]) return WHY[d][0] + '<small class="zhs">' + WHY[d][1] + "</small>"; if (/benchmark/i.test(d)) return 'Benchmark in progress<small class="zhs">測試進行中</small>'; return esc(d); }
  function lightsHtml() {
    return lights.map(function (l) { return '<span class="lr-light ' + (l.ok ? "ok" : "bad") + '"><i aria-hidden="true"></i><span class="lr-ln2">' + esc(l.name) + "</span>" + (l.ok ? "" : '<em>' + why(l.detail) + "</em>") + "</span>"; }).join("");
  }
  /* Spread load (card 1) and failover (card 2): red, glowing text whenever the connection says they are not fully working */
  function fnStatus() {
    if (!lights || !lights.length) return null;          // lights is filled later by the health check
    var by = {}; lights.forEach(function (l) { by[l.name] = l; });
    var gw = by["Gateway"], ms = [by[M.a], by[M.b]].filter(Boolean);
    var up = ms.filter(function (x) { return x.ok; }).map(function (x) { return x.name; }), down = ms.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
    if (gw && !gw.ok) return [{ bad: true, en: "Gateway unreachable: requests cannot be distributed", zh: "閘道無法連線，無法分流" }, { bad: true, en: "Gateway unreachable: failover unavailable", zh: "閘道無法連線，無法故障切換" }];
    if (!up.length) return [{ bad: true, en: "No machine reachable", zh: "兩台主機皆無法連線" }, { bad: true, en: "No machine available for failover", zh: "無可接手的主機" }];
    if (down.length) return [{ bad: true, en: "Only " + up.join(", ") + " available: " + down.join(", ") + " unreachable", zh: "僅 " + up.join("、") + " 可用：" + down.join("、") + " 無法連線" },
      { bad: true, en: "Failover active: " + up.join(", ") + " serves in place of " + down.join(", "), zh: "已故障切換：由 " + up.join("、") + " 接手 " + down.join("、") + " 的請求" }];
    return [{ bad: false, en: "Both machines in use", zh: "兩台機器都在用" }, { bad: false, en: "Standing by", zh: "待命中" }];
  }
  function paintFuncs() {
    var st = fnStatus();
    [0, 1].forEach(function (i, k) {
      var el = $("lrFst" + i); if (!el) return;
      if (!st) { el.innerHTML = ""; el.className = "lr-fst"; return; }
      if (!st[k].bad) { el.innerHTML = ""; el.className = "lr-fst"; return; }               // quiet when everything is fine
      el.className = "lr-fst bad";
      el.innerHTML = '<i aria-hidden="true"></i>' + esc(st[k].en) + '<small class="zhs">' + esc(st[k].zh) + "</small>";
    });
  }
  function refreshHealth() {
    fetch(API + "/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.checks) return;
      lights = d.checks; var b = lights.filter(function (c) { return c.name === M.b; })[0]; healthB = b ? b.ok : null;
      var el = $("lrLights"); if (el) el.innerHTML = lightsHtml();
      paintFuncs();
    }).catch(function () {});
  }
  function checkStatus() {
    runUI("checking", "");
    fetch(API + "/status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
      if (d && d.ok) { fetch(API + "/plan", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (pl) { if (pl && pl.steps) { PLAN = pl;  if (!job || !poll) runUI("ready", ""); } }).catch(function () {}); runUI("ready", ""); }
      else runUI("off", info("The gateway is not reachable from this platform.", "平台無法連線至閘道") + (d && d.reason ? " · " + esc(d.reason) : ""));
    }).catch(function () {
      var host = (window.location && window.location.hostname) || "", onLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
      runUI("off", onLocal
        ? info("This local platform has no smoke-test backend yet: update the platform to the latest version and add litellm.local.json.", "本機平台尚未啟用 smoke test 後端：請更新平台至最新版並設定 litellm.local.json")
        : info("This online page is view-only; the test runs on the local platform.", "線上版僅供檢視；實測請在本機平台執行") + ' <a class="lr-openlocal" href="http://localhost:8765/litellm-report.html">Open local platform<small class="zhs">開啟本機平台</small></a>');
    });
  }
  function startRun() {
    if (!window.RunGate) { runUI("ready", info("The test-password dialog is not loaded.", "測試密碼視窗尚未載入")); return; }
    runUI("running", "");
    RunGate.ticket().then(function (t) { return fetch(API + "/smoke", { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": t }, body: JSON.stringify({ lang: inputLang }) }); })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
      .then(function (d) { job = d.job_id; hasRun = true; runLang = inputLang; clockStart(); paintPrev(loadHist()[0] || null, "Previous run"); logNext = 0; shown = {}; shownVal = {}; termReset(""); D.live = false; curInput = null; $("lrConcl").hidden = true; $("lrResNote").hidden = false; $("lrResNote").innerHTML = 'Measuring: results appear as each input size completes.<small class="zhs">量測中：每完成一種輸入長度即顯示結果</small>'; renderFuncs(); poll = setInterval(tick, 1000); tick(); })
      .catch(function (e) { runUI("ready", /Cancelled/.test(String(e && e.message)) ? info("Cancelled: no password entered.", "已取消：未輸入測試密碼") : esc(e.message || e)); });
  }
  function tick() {
    fetch(API + "/smoke/" + job + "?since=" + logNext, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.log) { termAdd(d.log); logNext = d.log_next; }
      if (d.input && !curInput) { curInput = d.input; if ($("lrConcl").hidden) $("lrResNote").insertAdjacentHTML("beforeend", inputHtml(curInput)); }
      if (d.partial && d.partial.length && d.state === "running") showPartial(d.partial);
      if (d.state !== "running" && d.state !== "queued") clockStop();
      runUI("running", "", d.steps, d.items);
      if (d.state === "running" || d.state === "queued") return;
      clearInterval(poll); poll = null;
      if (d.state === "done" && d.result) applyLive(d.result, d.steps, d.items); else hasRun = true;
        var stopped = (d.steps || []).map(function (x) { return x.state === "run" ? { state: "fail", detail: x.detail } : x; });
        var stoppedItems = (d.items || []).map(function (g) { return g.map(function (y) { return y.state === "run" ? { state: "fail", value: y.value } : y; }); });
        runUI("ready", info("Stopped: ", "已停止：") + esc(d.error || d.state), stopped, stoppedItems);
    }).catch(function () { clearInterval(poll); poll = null; clockStop(); runUI("ready", info("Connection to the platform was lost.", "與平台的連線中斷")); });
  }
  /* result: bench.sizes[{key, tokens, a:{ttft_s,tpot_ms,agg_tps,norm_tps}, ab:{...}, gain_agg}], bench.gain_agg, bench.pass */
  function applyLive(r, steps, items) {
    D.sizes = r.bench.sizes.map(function (z) { return { key: z.key, tok: z.tokens, chars: z.chars, a: z.a, ab: z.ab }; });
    D.np = r.bench.np; D.lang = r.bench.lang; D.input = r.bench.input; D.live = true; D.liveAt = r.finished || new Date().toLocaleTimeString();
    var h = loadHist(); h.unshift({ at: D.liveAt, lang: r.bench.lang, input: r.bench.input, sizes: D.sizes, gain: r.bench.gain_agg, pass: !!r.bench.pass }); saveHist(h);
    conclusion(!!r.bench.pass); renderFuncs();
    runUI("ready", r.bench.pass ? "" : info("Completed, but the gain is below 1.3x: not confirmed.", "已完成，但提升未達 1.3 倍，未達標"), steps, items);
  }

  var termBig = false;
  /* fold the whole terminal body away and bring it back */
  $("lrTermFold").onclick = function () { var f = $("lrTerm").classList.toggle("folded"); this.setAttribute("aria-expanded", f ? "false" : "true"); this.firstChild.nodeValue = f ? "Unfold " : "Fold "; this.querySelector("small").textContent = f ? "展開" : "收合"; };
  $("lrTermBig").onclick = function () { termBig = !termBig; $("lrTermBody").classList.toggle("big", termBig); this.firstChild.nodeValue = termBig ? "Collapse " : "Expand "; this.querySelector("small").textContent = termBig ? "收合" : "展開全部"; };
  $("lrTermCopy").onclick = function () { var t = $("lrTermBody").innerText, b = this; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.querySelector("small").textContent = "已複製"; setTimeout(function () { b.querySelector("small").textContent = "複製"; }, 1500); }).catch(function () { var r = document.createRange(); r.selectNodeContents($("lrTermBody")); var g = getSelection(); g.removeAllRanges(); g.addRange(r); }); };

  /* ---------- step 4: Phase 2 tests. All content lives in data/litellm-phase2.json: edit the status there after each run ---------- */
  function renderPhase2(P) {
    var ST = P.statuses;
    function pill(s) { var t = ST[s] || [s, ""]; return '<em class="p2-st ' + esc(s) + '">' + esc(t[0]) + '<small class="zhs">' + esc(t[1]) + "</small></em>"; }
    function tip(t) {
      var last = (t.history || []).slice(-1)[0];
      return '<div class="p2-tip"><p class="p2-th">Pass if<small class="zhs">通過標準</small></p><p class="p2-tn">' + esc(t.crit_en) + '<small class="zhs">' + esc(t.crit_zh) + '</small></p><p class="p2-th">What we did<small class="zhs">做了什麼</small></p><p class="p2-tn">' + esc(t.note_en || "") + '<small class="zhs">' + esc(t.note_zh || "") + "</small></p>" + (last ? '<p class="p2-tn p2-when">Updated ' + esc(last.at) + '<small class="zhs">更新日期</small></p>' : "") + "</div>";
    }
    function row(t, k) {
      var res = t.res_en ? '<span class="p2-res ' + esc(t.status) + '">' + esc(t.res_en) + '<small class="zhs">' + esc(t.res_zh || "") + "</small></span>" : '<span class="p2-none">–</span>';
      return '<tr class="p2-row p2-r' + esc(k) + '" tabindex="0"><td class="p2-id">' + esc(t.id) + '</td><td class="p2-t">' + esc(t.en) + '<small class="zhs">' + esc(t.zh) + '</small><span class="p2-why">' + esc(t.why_en || "") + '<small class="zhs">' + esc(t.why_zh || "") + "</small></span>" + tip(t) + '</td><td class="p2-c">' + res + "</td><td>" + pill(t.status) + "</td></tr>";
    }
    function first(x) { var m = /^.*?[.。]( |$)/.exec(x); return m ? m[0].trim() : x; }
    function bi(en, zh) { return esc(en) + '<small class="zhs">' + esc(zh) + "</small>"; }
    var all = [], steps = "";
    P.groups.forEach(function (g) {
      var nd = g.tests.filter(function (t) { return t.status === "done"; }).length;
      all = all.concat(g.tests);
      var st = nd === g.tests.length ? "done" : (nd ? "partial" : "planned");
      var rows = g.tests.map(function (t) { return row(t, g.key); }).join("");
      var stuck = g.tests.filter(function (t) { return t.status !== "done"; }).map(function (t) {
        return '<li><b>' + esc(t.id) + "</b> " + bi(t.en, t.zh) + ' <span class="rs-why">' + bi(first(t.note_en || t.needs_en || ""), first(t.note_zh || t.needs_zh || "")) + "</span></li>";
      }).join("");
      stuck = stuck ? '<ul class="rs-stuck"><li class="rs-sh">Not done yet<small class="zhs">還沒完成，卡在</small></li>' + stuck + "</ul>" : "";
      var fake = g.tests.filter(function (t) { return t.status === "sim"; }).length;
      steps += '<section class="rs-step s' + esc(g.key) + '"><h2><i>' + esc(g.key) + "</i><span>" + bi(g.en, g.zh) + '</span><b class="rs-cnt' + (nd === g.tests.length ? ' ok' : '') + '">' + (nd === g.tests.length ? 'Done<small class="zhs">完成</small>' : nd + ' / ' + g.tests.length + '<small class="zhs">項已測</small>') + '</b></h2>' + stuck +
        '<p class="rs-m"><b>Meaning<small class="zhs">意義</small></b>' + bi(g.mean_en, g.mean_zh) + "</p>" +
        '<p class="rs-big t-' + esc(g.tone || "good") + '">' + esc(g.big) + "<span>" + bi(g.big_en, g.big_zh) + "</span></p>" +
        '<p class="rs-sum"><b>' + bi(g.label_en, g.label_zh) + "</b>" + bi(g.sum_en, g.sum_zh) + "</p>" + pill(st) +
        '<button type="button" class="rs-tg">Data<small class="zhs">數據</small></button><div class="rs-data" hidden>' +
        '<table class="p2-tb"><tbody>' + rows + "</tbody></table>" +
        (fake ? '<p class="p2-upd">' + fake + " of these were tried on a fake setup only" + '<small class="zhs">其中 ' + fake + " 項只用模擬測過</small></p>" : "") + "</div></section>";
    });
    var n = all.length, d = all.filter(function (t) { return t.status === "done"; }).length;
    $("lrTab2n").innerHTML = d === n ? "Done" : P.groups.map(function (g) { return g.tests.filter(function (x) { return x.status === "done"; }).length + "/" + g.tests.length; }).join(" · ");   /* progress inside the Phase 2 tab */
    if ($("lrHead")) $("lrHead").innerHTML = '<p class="lr-big">' + bi(P.headline.en, P.headline.zh) + "</p>";
    $("lrP2").innerHTML =
      '<div class="rs-mean"><b>Meaning<small class="zhs">意義</small></b><span>' + bi(P.meaning.en, P.meaning.zh) + "</span></div>" +
      '<div class="rs-steps">' + steps + "</div>" +
      '<p class="p2-upd rs-upd">Updated ' + esc(P.updated) + '<small class="zhs">更新日期</small></p>';
    Array.prototype.forEach.call($("lrP2").querySelectorAll(".rs-tg"), function (b) { b.onclick = function () { var x = b.nextElementSibling; x.hidden = !x.hidden; }; });
  }
  /* Phase 1 / Phase 2 switch: #phase1 or #phase2 in the address opens that one; Phase 2 (the open work) is the default */
  (function () {
    var tabs = [["1", $("lrTab1")], ["2", $("lrTab2")]];
    function show(k) {
      tabs.forEach(function (t) { var on = t[0] === k; t[1].classList.toggle("on", on); if (t[1].setAttribute) t[1].setAttribute("aria-selected", on ? "true" : "false"); });
      $("lrPhase2").classList.toggle("lr-off", k !== "2"); $("lrMain").classList.toggle("lr-off", k !== "1");
      try { history.replaceState(null, "", k === "1" ? "#phase1" : "#phase2"); } catch (e) { }
    }
    tabs.forEach(function (t) { t[1].onclick = function () { show(t[0]); }; });
    var h = ""; try { h = location.hash; } catch (e) { }
    show(/phase1/i.test(h) ? "1" : "2");
  })();
  fetch("data/litellm-phase2.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(renderPhase2).catch(function () {
    $("lrP2").innerHTML = '<p class="lr-resnote">Phase 2 list is not available.<small class="zhs">第二階段清單暫時無法顯示</small></p>';
  });

  checkStatus();
  paintPrev(loadHist()[0] || null, "Last run");
  refreshHealth(); setInterval(function () { if (!poll) refreshHealth(); }, 10000);
})();
