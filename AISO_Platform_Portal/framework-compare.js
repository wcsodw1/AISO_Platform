/* Framework comparison: the same model on vLLM, SGLang and llama.cpp, four indices (TTFT, TPOT, Aggregate TPS, normalized TPS).
   Data: the three B60 V4 datasets (one campaign, B60_matrix_v4_20261104_201559_715039). Nothing is estimated. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FILES = { "vLLM": "data/benchmark-b60/AISO_B60_vLLM_V4_20261105.json", "SGLang": "data/benchmark-b60/AISO_B60_SGLang_V4_20261105.json", "llama.cpp": "data/benchmark-b60/AISO_B60_llamacpp_V4_20261105.json" };
  const FW = Object.keys(FILES);
  const COLOR = { "vLLM": "#4fd1b0", "SGLang": "#8ab4ff", "llama.cpp": "#d9cb8f" };
  /* only same-precision comparisons are shown (David 2026-11-13: 「不一樣的不要丟上去」). Laguna is removed: vLLM/SGLang ran FP8 (8-bit), llama.cpp GGUF Q4_K_M (≈4-bit). */
  const MODELS = [{ id: "Gemma31", en: "Gemma 4 31B", tag: "Dense" }];
  const MACHINES = [
    { id: "B60", n: "Intel Arc Pro B60", img: "assets/products/sparkle-arc-pro-b60-blower.webp", spec: "GPU 48 × 2 = 96 GB · 2 of 4 cards", ok: true, why: "Same precision", whyZh: "同精度", hint: "Gemma 4 31B · vLLM W4A16 · SGLang W4A16 · llama.cpp GGUF Q4_0 (all ≈4-bit)" },
    { id: "B70", n: "Intel Arc Pro B70", img: "assets/products/sparkle-arc-pro-b70-blower.webp", spec: "GPU 32 × 2 = 64 GB", ok: false, why: "Checking data", whyZh: "資料確認中", hint: "Context per request: vLLM / SGLang 69632, llama.cpp 18432" },
    { id: "AISO1", n: "AISO1 · AI MAX+ 395", img: "assets/products/aiso1-ai-max395.png", spec: "Ryzen AI Max+ 395 · Radeon iGPU", ok: false, why: "Checking data", whyZh: "資料確認中", hint: "vLLM: historical Gemma 4 31B run, NP2 only; weights not confirmed. Not compared yet." }
  ];
  const INPUTS = [4096, 8192, 16384], NPS = [1, 2, 5], LABEL = { 4096: "4K", 8192: "8K", 16384: "16K" };
  const THR = 15;
  const METRICS = {
    ttft: { en: "TTFT", zh: "首字等待", unit: "s", low: true, get: r => r.ttft_s, dec: 1, hint: "Time to first token: how long until the answer starts. Lower is better." },
    tpot: { en: "TPOT", zh: "每字間隔", unit: "ms", low: true, get: r => r.tpot_ms, dec: 0, hint: "Time per output token after the first. Lower is better." },
    agg: { en: "TPS Aggregate", zh: "總吞吐", unit: "tok/s", low: false, get: r => r.aggregate_tps, dec: 1, hint: "All requests together. Higher is better." },
    norm: { en: "TPS Normalized", zh: "每請求速度", unit: "tok/s", low: false, get: r => r.aggregate_tps / r.np, dec: 1, thr: THR, hint: "Aggregate ÷ NP: what each user gets. Needs " + THR + "+ tok/s." }
  };
  const fmtOf = c => /^GGUF/i.test(c.format) ? c.format : c.format.replace(/^safetensors\s*/i, "") + " · safetensors";
  const bitsOf = c => /FP8/i.test(c.format) ? 8 : /W4A16|Q4|INT4/i.test(c.format) ? 4 : 0;
  const bitsLabel = c => bitsOf(c) === 8 ? "8-bit weights" : bitsOf(c) === 4 ? "≈4-bit weights" : "unknown";
  const state = { model: "Gemma31", machine: "B60", peek: null, input: 8192, metric: "norm", sets: {} };
  const fmt = (v, d) => v == null || !isFinite(v) ? "—" : v >= 100 ? Math.round(v).toString() : v.toFixed(d == null ? 1 : d);
  const runs = (f, model) => (state.sets[f] && state.sets[f].b60_runs || []).filter(r => r.model === model && r.status === "PASS");
  const run = (f, np) => runs(f, state.model).find(r => r.input === state.input && r.np === np) || null;
  const cfg = (f, model) => (state.sets[f] && state.sets[f].config_by_model || {})[model] || null;
  const best = (vals, low) => { const ok = vals.filter(v => v != null && isFinite(v)); return ok.length > 1 ? (low ? Math.min.apply(null, ok) : Math.max.apply(null, ok)) : null; };

  function tabs(id, items, cur, key) {
    $(id).innerHTML = items.map(i => '<button type="button" role="tab" data-k="' + key + '" data-v="' + esc(i.v) + '"' + (i.off ? " disabled" : "") + ' aria-selected="' + (String(cur) === String(i.v)) + '" class="' + (String(cur) === String(i.v) ? "on" : "") + '"' + (i.title ? ' title="' + esc(i.title) + '"' : "") + ">" + i.html + "</button>").join("");
  }

  function stage(id) {
    const m = MACHINES.find(x => x.id === id);
    return '<img class="fc-img" src="' + m.img + '" alt="">' + '<h2 class="mw-big">' + esc(m.n) + '</h2><p class="mw-spec">' + esc(m.spec) + "</p>" +
      '';
  }
  function renderPick() {
    $("fcMw").innerHTML = '<div class="mw-stage">' + stage(state.peek || state.machine) + '</div><div class="mw-panel"><h3 class="mw-q">Choose a machine<small class="zhs">選擇機器</small></h3><div class="mw-opts">' +
      MACHINES.map(m => '<button type="button" class="mw-opt' + (m.id === state.machine ? " sel" : "") + (m.ok ? "" : " off") + '" data-k="machine" data-v="' + m.id + '"' + (m.ok ? "" : ' aria-disabled="true"') + ' title="' + esc(m.hint) + '"><span class="mw-l"><b>' + esc(m.n) + '</b><br><span class="mw-r">' + esc(m.why) + '<small class="zhs">' + m.whyZh + "</small></span></span></button>").join("") + "</div></div>";
    tabs("fcInput", INPUTS.map(k => ({ v: k, html: LABEL[k] })), state.input, "input");
  }

  function renderMetric() {
    tabs("fcMetric", Object.keys(METRICS).map(k => ({ v: k, title: METRICS[k].hint, html: "<b>" + METRICS[k].en + "</b><span>" + METRICS[k].zh + " · " + METRICS[k].unit + "</span>" })), state.metric, "metric");
  }

  function renderChart() {
    const M = METRICS[state.metric], m = MODELS.find(x => x.id === state.model);
    const cs = FW.map(f => cfg(f, state.model));
    $("fcSub").innerHTML = "<b>" + esc(m.en) + "</b> · Intel Arc Pro B60 · Input " + LABEL[state.input] +
      '<span class="fc-chips">' + FW.map((f, i) => '<span class="fc-chip" style="border-color:' + COLOR[f] + '"><b style="color:' + COLOR[f] + '">' + f + "</b> " + (cs[i] ? esc(fmtOf(cs[i])) : "—") + "</span>").join("") + "</span>";
    const vals = NPS.map(np => FW.map(f => { const r = run(f, np); return r ? M.get(r) : null; }));
    const max = Math.max.apply(null, vals.reduce((a, r) => a.concat(r), []).filter(v => v != null).concat(M.thr || 0).concat([0.0001]));
    $("fcChart").innerHTML = NPS.map((np, i) => {
      const row = vals[i], b = best(row, M.low);
      return '<div class="fc-grp"><div class="fc-np">NP' + np + "<small>同時請求</small></div><div class=\"fc-bars\">" + FW.map((f, j) => {
        const v = row[j];
        if (v == null) return '<div class="fc-bar none"><span class="fc-fw">' + f + '</span><i class="fc-track"></i><b>—</b></div>';
        const isBest = b != null && v === b, slow = M.thr && v < M.thr;
        return '<div class="fc-bar' + (isBest ? " best" : "") + (slow ? " slow" : "") + '"><span class="fc-fw" style="color:' + COLOR[f] + '">' + f + '</span><i class="fc-track"><i class="fc-fill" style="width:' + (v / max * 100).toFixed(1) + "%;background:" + COLOR[f] + '"></i>' + (M.thr ? '<i class="fc-thr" style="left:' + (M.thr / max * 100).toFixed(1) + '%" title="' + M.thr + ' tok/s"></i>' : "") + "</i><b>" + fmt(v, M.dec) + "<small>" + M.unit + "</small>" + (isBest ? "<em>★</em>" : "") + "</b></div>";
      }).join("") + "</div></div>";
    }).join("");
    const win = NPS.map((np, i) => { const b = best(vals[i], M.low); return b == null ? null : { np: np, f: FW.filter((f, j) => vals[i][j] === b) }; }).filter(Boolean);
    /* speed conclusion on top (David 2026-11-13): which framework wins each index at this input, big and short;
       exceptions (an NP where another framework wins) go into the hover Notes corner */
    const winsOf = k => { const X = METRICS[k], c = {}; NPS.forEach(np => { const v = FW.map(f => { const r = run(f, np); return r ? X.get(r) : null; }), b = best(v, X.low); if (b != null) FW.forEach((f, j) => { if (v[j] === b) (c[f] = c[f] || []).push(np); }); }); return c; };
    const top = c => Object.keys(c).sort((a, b) => c[b].length - c[a].length)[0];
    const groups = [{ en: "TTFT", keys: ["ttft"] }, { en: "TPOT", keys: ["tpot"] }, { en: "TPS", keys: ["agg", "norm"] }];
    const winner = {}, obs = [];
    groups.forEach(g => { const cs = g.keys.map(winsOf), ws = cs.map(top); if (!ws[0]) return;
      const w = ws.every(x => x === ws[0]) ? ws[0] : null;
      if (w) (winner[w] = winner[w] || []).push(g.en);
      g.keys.forEach((k, n) => { if (!w) (winner[ws[n]] = winner[ws[n]] || []).push(METRICS[k].en);
        /* a reversal is noted only when it is big (> 20 %) - small swaps are normal noise */
        Object.keys(cs[n]).filter(f => f !== ws[n]).forEach(f => cs[n][f].forEach(np => { const X = METRICS[k], a = run(f, np), b = run(ws[n], np); if (!a || !b) return; const va = X.get(a), vb = X.get(b), gap = Math.abs(va - vb) / Math.max(Math.min(va, vb), 1e-9); if (gap > 0.2) obs.push(X.en + " NP" + np + ": " + f + " beats " + ws[n] + " by " + Math.round(gap * 100) + "%"); })); });
    });
    /* Notes = only real anomalies (David 2026-11-13: 備註寫特別異常的就好): missing results, very long TTFT (queueing), big reversals */
    NPS.forEach(np => FW.forEach(f => { const r = run(f, np); if (!r) obs.push(f + " NP" + np + ": no result"); else if (r.ttft_s > 180) obs.push(f + " NP" + np + ": TTFT " + Math.round(r.ttft_s) + " s (requests queue)"); }));
    /* Notes = anomalies (if any) + the full data of this input below them (David 2026-11-13: 備註下面請放完整資料) */
    $("fcConcl").innerHTML = '<div class="fc-notes" tabindex="0"><span class="fc-nb">Notes<small class="zhs">備註</small></span><div class="fc-nf">' +
      (obs.length ? '<h5>Anomalies<small class="zhs">異常</small></h5><ul class="bs-bul">' + obs.map(o => "<li>" + esc(o) + "</li>").join("") + "</ul>" : "") +
      '<h5>Full data<small class="zhs">完整資料</small> · Input ' + LABEL[state.input] + '</h5><div class="bs-wrap" id="fcFull"></div><p class="fc-def">TPS Normalized = TPS Aggregate ÷ NP. Aggregate = output tokens ÷ (TTFT + output time).</p></div></div>' +
      '<span class="fc-cl">Conclusion<small class="zhs">結論</small></span>' +
      Object.keys(winner).map(f => '<p class="fc-cbig"><b style="color:' + COLOR[f] + '">' + f + "</b> is best in " + winner[f].join(" · ") + "</p>").join("") +
      '<p class="fc-cm">Input ' + LABEL[state.input] + " · NP " + NPS.join(" / ") + "</p>";
  }

  function renderFull() {
    const cols = ["ttft", "tpot", "agg", "norm"];
    let body = "";
    NPS.forEach(np => {
      const rs = FW.map(f => run(f, np));
      const bests = cols.map(c => best(rs.map(r => r ? METRICS[c].get(r) : null), METRICS[c].low));
      FW.forEach((f, j) => {
        const r = rs[j];
        body += "<tr><th scope=\"row\">" + (j === 0 ? "NP" + np : "") + "</th><td style=\"color:" + COLOR[f] + ';font-weight:700">' + f + "</td>" + cols.map((c, k) => {
          const v = r ? METRICS[c].get(r) : null, cls = v != null && bests[k] === v ? "best" : (METRICS[c].thr && v != null && v < METRICS[c].thr ? "slow" : "");
          return '<td class="' + cls + '">' + fmt(v, METRICS[c].dec) + "</td>";
        }).join("") + "</tr>";
      });
    });
    $("fcFull").innerHTML = '<table class="fc-t"><thead><tr><th></th><th>Framework<small>框架</small></th>' + cols.map(c => "<th>" + METRICS[c].en + "<small>" + METRICS[c].zh + " · " + METRICS[c].unit + "</small></th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  /* Same or different (David 2026-11-13, same pattern as the benchmark pages): list only what is the SAME, large and plain;
     what differs goes into a small "Notes 備註" corner that opens on hover. */
  function renderParity() {
    const model = state.model, cs = FW.map(f => cfg(f, model));
    if (cs.some(c => !c)) { $("fcParity").innerHTML = "<p>Configuration not on the platform.</p>"; return; }
    const first = x => { const m = String(x == null ? "" : x).match(/\d+/); return m ? m[0] : ""; };
    const p = state.sets["vLLM"].profile;
    const rows = [
      { n: "Machine", zh: "機器", show: () => "Intel Arc Pro B60 · 2 cards", key: () => "b60" },
      { n: "Model", zh: "模型", show: () => "Gemma 4 31B", key: () => model },
      { n: "Weight precision", zh: "權重精度", show: () => "≈4-bit", key: c => String(bitsOf(c)) },
      { n: "Context per request", zh: "每請求 context", show: c => first(c.max_context), key: c => first(c.max_context) },
      { n: "Batch", zh: "批次", show: c => first(c.batch), key: c => first(c.batch) },
      { n: "Prefix cache", zh: "前綴快取", show: () => "OFF", key: c => /OFF/i.test(c.cache) ? "off" : c.cache },
      { n: "Input / Output", zh: "輸入／輸出", show: () => p.input_tokens.map(k => k / 1024 + "K").join(" / ") + " → " + p.output_tokens, key: () => "" },
      { n: "NP · Repeats", zh: "同時請求・重複", show: () => NPS.join(" / ") + " · " + p.repeat + "×", key: () => "" }
    ];
    const notes = [
      { n: "Model file", zh: "模型檔", get: c => c.repo },
      { n: "Format", zh: "格式", get: c => fmtOf(c) },
      { n: "GPUs", zh: "顯卡", get: c => (String(c.tp).match(/^\d+$/) ? "TP " + c.tp : c.tp) },
      { n: "Batch setting", zh: "批次設定", get: c => c.batch },
      { n: "Cache setting", zh: "快取設定", get: c => c.cache }
    ];
    const same = rows.filter(r => { const k = cs.map(c => r.key(c)); return k.every(x => x === k[0]); });
    $("fcParity").innerHTML = '<div class="fc-notes" tabindex="0"><span class="fc-nb">Notes<small class="zhs">備註</small></span><div class="fc-nf"><table>' +
      '<tr><th></th>' + FW.map(f => '<th style="color:' + COLOR[f] + '">' + f + "</th>").join("") + "</tr>" +
      notes.map(r => "<tr><th>" + r.n + "<small>" + r.zh + "</small></th>" + cs.map(c => "<td>" + esc(r.get(c)) + "</td>").join("") + "</tr>").join("") +
      '</table><p>llama.cpp needs GGUF, so the file format can never be identical.<small class="zhs">llama.cpp 只能讀 GGUF，格式不可能完全相同</small></p></div></div>' +
      '<dl class="fc-same">' + same.map(r => "<dt>" + r.n + "<small>" + r.zh + "</small></dt><dd>" + esc(r.show(cs[0])) + "</dd>").join("") + "</dl>";
  }


  function renderAll() { renderPick(); renderMetric(); renderChart(); renderFull(); renderParity(); }

  document.addEventListener("mouseover", e => {
    const o = e.target.closest("#fcMw .mw-opt"), id = o ? o.dataset.v : null;
    if (id === state.peek) return; state.peek = id; const st = document.querySelector("#fcMw .mw-stage"); if (st) st.innerHTML = stage(id || state.machine);
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if (!b || b.disabled || !state.sets["vLLM"]) return;
    const k = b.dataset.k, v = b.dataset.v;
    if (k === "model") state.model = v; else if (k === "input") state.input = Number(v); else if (k === "metric") state.metric = v; else return;
    renderAll();
  });

  Promise.all(FW.map(f => fetch(FILES[f]).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); }).then(d => { state.sets[f] = d; })))
    .then(renderAll)
    .catch(err => { $("fcChart").innerHTML = "<p>Could not load the benchmark data (" + esc(err.message) + ").</p>"; });
})();
