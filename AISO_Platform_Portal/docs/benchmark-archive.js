/* Benchmark Archive: one dataset per machine (data/benchmark-archive/*.json). Shows only complete records as charts (TTFT / TPOT / tok/s by input length, one line per mode) like the PRO6000 page; incomplete ones are listed as "reported values". */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const st = { index: null, data: {}, g: null, model: null, np: null, out: null, all: false };
  const COLORS = ["#8f9bff", "#ff8a4c", "#4fd1b0", "#d9cb8f", "#ff8a76", "#8ab4ff", "#c58cff", "#7ff0d2"];
  const bad = r => /invalid|missing/i.test(r.status || "");
  const ttft = r => r.ttft_mean_ms ?? r.ttft_median_ms, tpot = r => r.tpot_median_ms ?? r.tpot_mean_ms ?? r.tpot_ms_unspecified, tps = r => r.aggregate_tps ?? r.generation_tps ?? r.prompt_tps;
  const complete = r => r.np != null && r.input_tokens && r.output_tokens && ttft(r) != null && tpot(r) != null && tps(r) != null && !bad(r);
  const K = n => n >= 1024 && n % 1024 === 0 ? (n / 1024) + "K" : String(n);
  const chips = a => a.length ? a.map(x => '<span class="ba-chip">' + esc(x) + "</span>").join("") : '<span class="ba-none">—</span>';
  /* the report's own mode names: Without / Run1 / Run2-3 avg (Run numbers are not mapped to cold/warm: the archive says the source does not prove it); anything else keeps its raw words */
  function mode(r) {
    const a = r.aidaptiv || "", run = r.run || "";
    if (/without/i.test(a) && /mean\(Run1,Run2,Run3\)|filtered/i.test(run)) return "Without aiDAPTIV";
    if (/single/i.test(a) && run === "Run1") return "aiDAPTIV · Run1";
    if (/single/i.test(a) && /Run2,Run3/.test(run)) return "aiDAPTIV · Run2/3 avg";
    return [a, run].filter(Boolean).join(" · ") || "Reported";
  }
  const rowsOf = () => (st.data[st.g].runs || []).filter(r => (r.model || "—") === st.model);

  function renderMachines() { $("baMachines").innerHTML = st.index.groups.map(g => '<button type="button" class="ba-row' + (g.id === st.g ? " on" : "") + '" data-g="' + g.id + '"><b>' + esc(g.label) + "</b><span>" + g.records + "</span></button>").join(""); }

  function chart(title, unit, series, xs, fmtv) {
    const names = Object.keys(series).filter(n => Object.keys(series[n]).length >= 2), W = 900, H = 300, L = 70, R = 24, T = 20, B = 46;
    const vals = names.flatMap(n => Object.values(series[n])), max = Math.max(...vals) * 1.15 || 1, x = i => L + (xs.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (xs.length - 1)), y = v => T + (H - T - B) * (1 - v / max);
    const grid = [0, .25, .5, .75, 1].map(f => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(max * f) + '" y2="' + y(max * f) + '" stroke="rgba(255,255,255,.12)"/><text x="' + (L - 8) + '" y="' + (y(max * f) + 5) + '" text-anchor="end" fill="#9ba3b0" font-size="16">' + fmtv(max * f) + "</text>").join("");
    const xl = xs.map((v, i) => '<text x="' + x(i) + '" y="' + (H - 16) + '" text-anchor="middle" fill="#f3efe5" font-size="17" font-weight="700">' + K(v) + "</text>").join("");
    const lines = names.map((n, k) => { const c = COLORS[k % COLORS.length], pts = xs.map((v, i) => series[n][v] != null ? [x(i), y(series[n][v]), series[n][v]] : null).filter(Boolean);
      return '<polyline fill="none" stroke="' + c + '" stroke-width="3" points="' + pts.map(p => p[0] + "," + p[1]).join(" ") + '"/>' + pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + c + '"/><text x="' + p[0] + '" y="' + (p[1] - 10) + '" text-anchor="middle" fill="#f3efe5" font-size="15">' + fmtv(p[2]) + "</text>").join(""); }).join("");
    const legend = names.map((n, k) => '<span><i style="background:' + COLORS[k % COLORS.length] + '"></i>' + esc(n) + "</span>").join("");
    return '<div class="ba-chart"><div class="ba-ch-h"><b>' + title + "</b><small>" + unit + '</small><div class="ba-leg">' + legend + '</div></div><svg viewBox="0 0 ' + W + " " + H + '" role="img">' + grid + xl + lines + "</svg></div>";
  }
  const f2 = v => v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

  function render() {
    const d = st.data[st.g]; if (!d) return;
    const all = rowsOf(), comp = all.filter(complete);
    $("baModels").innerHTML = d.models.map(m => { const c = (d.runs || []).filter(r => r.model === m.model && complete(r)).length; return '<button type="button" class="ba-tab' + (m.model === st.model ? " on" : "") + (c ? "" : " part") + '" data-m="' + esc(m.model) + '">' + esc(m.model) + "<small>" + (c ? c + " complete" : "partial") + "</small></button>"; }).join("");
    const m = d.models.find(x => x.model === st.model) || d.models[0];
    $("baParams").innerHTML = "<dl><dt>Quantization<small class=\"zhs\">量化</small></dt><dd>" + chips(m.quant) + "</dd><dt>Backend<small class=\"zhs\">後端</small></dt><dd>" + chips(m.backend) + "</dd><dt>NP</dt><dd>" + chips(m.np.map(String)) + "</dd><dt>Input</dt><dd>" + chips(m.input.map(K)) + "</dd><dt>Output</dt><dd>" + chips(m.output.map(K)) + "</dd></dl>";
    if (!comp.length) {   // nothing complete: list only what the archive reported, without empty columns
      $("baFilters").innerHTML = ""; $("baCharts").innerHTML = '<p class="ba-note">Incomplete: no record has TTFT, TPOT and tok/s together. Reported values only.<small class="zhs">這個模型沒有完整記錄，只列有數值的欄位。</small></p>';
      const cols = [["np", "NP"], ["input_tokens", "Input"], ["output_tokens", "Output"], ["ttft", "TTFT ms"], ["tpot", "TPOT ms"], ["tps", "tok/s"], ["speed_text", "Reported"]];
      const val = (r, c) => c === "ttft" ? ttft(r) : c === "tpot" ? tpot(r) : c === "tps" ? tps(r) : r[c], use = cols.filter(c => all.some(r => val(r, c[0]) != null));
      $("baTbl").innerHTML = "<thead><tr>" + use.map(c => "<th>" + c[1] + "</th>").join("") + "</tr></thead><tbody>" + all.slice(0, 100).map(r => "<tr>" + use.map(c => "<td>" + esc(val(r, c[0]) == null ? "—" : typeof val(r, c[0]) === "number" ? f2(val(r, c[0])) : val(r, c[0])) + "</td>").join("") + "</tr>").join("") + "</tbody>";
      $("baMore").innerHTML = "<span>" + all.length + " rows</span>"; return;
    }
    const nps = [...new Set(comp.map(r => r.np))].sort((a, b) => a - b), outs = [...new Set(comp.map(r => r.output_tokens))].sort((a, b) => a - b);
    if (!nps.includes(st.np)) st.np = nps[0]; if (!outs.includes(st.out)) st.out = outs[0];
    $("baFilters").innerHTML = '<label>NP<select data-f="np">' + nps.map(v => "<option" + (v === st.np ? " selected" : "") + ">" + v + "</option>").join("") + '</select></label><label>Output<select data-f="out">' + outs.map(v => "<option value=\"" + v + "\"" + (v === st.out ? " selected" : "") + ">" + K(v) + "</option>").join("") + "</select></label>";
    const sel = comp.filter(r => r.np === st.np && r.output_tokens === st.out), xs = [...new Set(sel.map(r => r.input_tokens))].sort((a, b) => a - b), S = { ttft: {}, tpot: {}, tps: {} };
    sel.forEach(r => { const n = mode(r); [["ttft", ttft(r) / 1000], ["tpot", tpot(r)], ["tps", tps(r)]].forEach(([k, v]) => { (S[k][n] = S[k][n] || {})[r.input_tokens] = v; }); });
    $("baCharts").innerHTML = chart("TTFT", "s · lower is better 越低越好", S.ttft, xs, f2) + chart("TPOT", "ms/token · lower is better 越低越好", S.tpot, xs, f2) + chart("Throughput", "tok/s · higher is better 越高越好", S.tps, xs, f2);
    $("baTbl").innerHTML = "<thead><tr><th>Input</th><th>Mode<small class=\"zhs\">模式</small></th><th>TTFT ms</th><th>TPOT ms</th><th>tok/s</th></tr></thead><tbody>" + sel.sort((a, b) => a.input_tokens - b.input_tokens).map(r => '<tr title="' + esc([r.date, r.precision_evidence, r.source_ids && "src " + r.source_ids].filter(Boolean).join("\n")) + '"><td>' + K(r.input_tokens) + "</td><td>" + esc(mode(r)) + "</td><td>" + f2(ttft(r)) + "</td><td>" + f2(tpot(r)) + "</td><td>" + f2(tps(r)) + "</td></tr>").join("") + "</tbody>";
    const skipped = all.length - comp.length;
    $("baMore").innerHTML = "<span>" + sel.length + " rows here" + (skipped ? " · " + skipped + " incomplete or invalid rows not shown" : "") + "</span>";
  }
  async function pick(g) {
    st.g = g; st.np = null; st.out = null;
    if (!st.data[g]) st.data[g] = await fetch(st.index.groups.find(x => x.id === g).file).then(r => r.json());
    const d = st.data[g], cnt = {}; d.runs.forEach(r => { if (complete(r)) cnt[r.model] = (cnt[r.model] || 0) + 1; });
    st.model = d.models.slice().sort((a, b) => (cnt[b.model] || 0) - (cnt[a.model] || 0) || b.rows - a.rows)[0].model;
    renderMachines(); render();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-g]"); if (b) { pick(b.dataset.g); return; }
    const m = e.target.closest("[data-m]"); if (m) { st.model = m.dataset.m; st.np = null; st.out = null; render(); }
  });
  document.addEventListener("change", e => { const f = e.target.dataset && e.target.dataset.f; if (!f) return; st[f] = Number(e.target.value); render(); });
  fetch("data/benchmark-archive/index.json").then(r => r.json()).then(ix => {
    st.index = ix;
    $("baSum").innerHTML = ix.groups.reduce((a, g) => a + g.records, 0).toLocaleString("en-US") + " records · " + ix.groups.length + " machine groups<span class=\"zh-i\">只畫資訊完整的記錄；條件各筆不同，不與壓力測試頁比較</span>";
    pick(ix.groups[0].id);
  }).catch(() => { $("baSum").textContent = "Could not load data/benchmark-archive/index.json"; });
})();
