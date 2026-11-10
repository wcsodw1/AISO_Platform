/* Repeat stability chart ("自己跟自己比"): x = Input 4K/8K/16K, one line per Repeat, one card per machine.
   Pure functions + one HTML renderer; used by stress-test-compare.js and tests/repeat-chart.test.js.
   A run carries `repeats: {ttft_s:[..], tpot_ms:[..], aggregate_tps:[..]}` (index 0 = Repeat 1). Missing data is
   shown as missing — never estimated. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RC = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const METRICS = {
    norm_tps: { short: "TPS (Normalized)", unit: "tok/s", dec: 1 },
    aggregate_tps: { short: "TPS (Aggregate)", unit: "tok/s", dec: 1 },
    ttft_s: { short: "TTFT", unit: "s", dec: 2 },
    tpot_ms: { short: "TPOT", unit: "ms/token", dec: 1 }
  };
  const REPEAT_COLORS = ["#5b9cf5", "#6fcf97", "#f2994a", "#c792ea", "#e5c07b"];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kn = n => `${n / 1024}K`;
  const fmt = (v, d) => Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

  /* per-repeat values of one run for a metric; Normalized TPS = per-repeat Aggregate ÷ NP (same rule as the compare page) */
  function repeatsOf(run, metric) {
    const r = run && run.repeats;
    if (!r) return null;
    const a = metric === "norm_tps" ? (r.aggregate_tps || []).map(v => v / run.np) : r[metric];
    return a && a.length && a.every(Number.isFinite) ? a : null;
  }

  /* 0..max axis with ~4 intervals on a 1/2/2.5/5 × 10^k step */
  function niceAxis(max) {
    if (!(max > 0)) return { max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const raw = max / 5, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    const top = Math.ceil(max / step - 1e-9) * step, ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { max: top, step, ticks };
  }

  /* spread across repeats at each input: (max-min)/mean; returns the worst one */
  function spread(points) {
    let worst = null;
    points.forEach(p => {
      if (!p.values || p.values.length < 2) return;
      const mean = p.values.reduce((a, b) => a + b, 0) / p.values.length, s = (Math.max(...p.values) - Math.min(...p.values)) / mean;
      if (!worst || s > worst.pct) worst = { pct: s, input: p.input };
    });
    return worst;
  }

  /* one machine's chart; points = [{input, values:[r1,r2,r3]|null}] in x order */
  function svgChart(points, metric, uid, W, H) {
    const M = METRICS[metric], L = 56, R = 18, T = 14, B = 40;
    const all = points.flatMap(p => p.values || []), ax = niceAxis(Math.max(0, ...all));
    const x = i => points.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (points.length - 1);
    const y = v => T + (H - T - B) * (1 - v / ax.max);
    const nRep = Math.max(0, ...points.map(p => (p.values || []).length));
    let g = ax.ticks.map(t => `<line class="rp-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="rp-ytick" x="${L - 10}" y="${y(t) + 5}" text-anchor="end">${fmt(t, ax.step < 1 ? 2 : ax.step < 10 && ax.step % 1 ? 1 : 0)}</text>`).join("");
    g += points.map((p, i) => `<text class="rp-xtick" x="${x(i)}" y="${H - 12}" text-anchor="middle">${kn(p.input)}</text>`).join("");
    for (let r = 0; r < nRep; r++) {
      const col = REPEAT_COLORS[r % REPEAT_COLORS.length];
      let seg = [], d = "";
      points.forEach((p, i) => {
        const v = p.values && p.values[r];
        if (Number.isFinite(v)) seg.push([x(i), y(v)]);
        else { if (seg.length > 1) d += "M" + seg.map(q => q.join(",")).join("L"); seg = []; }
      });
      if (seg.length > 1) d += "M" + seg.map(q => q.join(",")).join("L");
      g += `<path class="rp-line" d="${d}" stroke="${col}"/>`;
      points.forEach((p, i) => { const v = p.values && p.values[r]; if (Number.isFinite(v)) g += `<circle class="rp-dot" cx="${x(i)}" cy="${y(v)}" r="5" fill="${col}"/>`; });
    }
    const cols = points.map((p, i) => `<rect class="rp-hit" data-i="${i}" x="${x(i) - (W - L - R) / Math.max(1, points.length - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, points.length - 1)}" height="${H - T - B}"/>`).join("");
    return `<svg class="rp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(M.short)} by input, one line per repeat" data-uid="${uid}">${g}<line class="rp-cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/>${cols}</svg>`;
  }

  /* cfg: {machines:[{key,label,color}], runsFor(key)->runs of the current framework/model/NP, metric, inputs:[..], np, title} */
  function html(cfg) {
    const M = METRICS[cfg.metric];
    /* draw at the real pixel width so axis text stays 15px (a scaled viewBox would shrink it) */
    const cw = cfg.width || 900, cols = Math.max(1, Math.min(cfg.machines.length, Math.floor((cw + 18) / 438)));
    const W = Math.max(300, Math.floor((cw - 18 * (cols - 1)) / cols - 42)), H = Math.round(Math.min(340, Math.max(240, W * 0.55)));
    const cards = cfg.machines.map(m => {
      const runs = cfg.runsFor(m.key) || [];
      const points = cfg.inputs.map(i => ({ input: i, values: repeatsOf(runs.find(r => r.input === i), cfg.metric) }));
      const have = points.filter(p => p.values);
      const head = `<h3 class="rp-mh"><i style="background:${m.color}"></i>${esc(m.label)}</h3>`;
      if (!runs.length) return `<article class="rp-card rp-none">${head}<p class="rp-miss">此組合沒有資料。</p></article>`;
      if (!have.length) return `<article class="rp-card rp-none">${head}<p class="rp-miss">已有成績，但這個資料集沒有逐次 Repeat 的${esc(M.short)}原始數值（目前只有平均）。需要 raw / waves 檔才能畫出，不會用平均值或估算補上。</p></article>`;
      const nRep = Math.max(...have.map(p => p.values.length)), full = have.length === points.length && have.every(p => p.values.length === nRep);
      const sp = spread(points), uid = `${m.key}`;
      const cap = full ? `各輸入長度均已完成 Repeat ${nRep}` : `${have.length} / ${points.length} 個輸入長度有逐次 Repeat 資料（缺的不補值）`;
      const legend = Array.from({ length: nRep }, (_, r) => `<span><i style="background:${REPEAT_COLORS[r % REPEAT_COLORS.length]}"></i>Repeat ${r + 1}</span>`).join("");
      return `<article class="rp-card" data-uid="${uid}" data-points='${esc(JSON.stringify(points))}'>${head}<div class="rp-chart">${svgChart(points, cfg.metric, uid, W, H)}<div class="rp-tip" hidden></div></div><div class="rp-legend">${legend}</div>` +
        `<p class="rp-cap">${esc(cfg.title)}，${cap}</p>` +
        `<p class="rp-spread">${sp ? `Repeat 間最大差距 <b>${fmt(sp.pct * 100, 1)}%</b>（${kn(sp.input)}）` : "只有單次數值，無法計算差距"}<small>(最大 − 最小) ÷ 平均；越小代表越穩定</small></p></article>`;
    }).join("");
    return `<div class="rp-grid-cards" data-metric="${cfg.metric}">${cards}</div>`;
  }

  /* hover tooltip via delegation (browser only) */
  function bind(container) {
    const M = () => METRICS[(container.querySelector(".rp-grid-cards") || {}).dataset ? container.querySelector(".rp-grid-cards").dataset.metric : "norm_tps"];
    container.onmousemove = e => {
      const hit = e.target.closest && e.target.closest(".rp-hit");
      container.querySelectorAll(".rp-tip").forEach(t => t.hidden = true);
      container.querySelectorAll(".rp-cursor").forEach(c => c.setAttribute("hidden", ""));
      if (!hit) return;
      const card = hit.closest(".rp-card"), pts = JSON.parse(card.dataset.points), p = pts[+hit.dataset.i], mt = M();
      if (!p || !p.values) return;
      const svg = hit.ownerSVGElement, box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, cx = +hit.getAttribute("x") + +hit.getAttribute("width") / 2;
      const cur = svg.querySelector(".rp-cursor"); cur.setAttribute("x1", cx); cur.setAttribute("x2", cx); cur.removeAttribute("hidden");
      const tip = card.querySelector(".rp-tip");
      tip.innerHTML = `<b>${kn(p.input)}</b>` + p.values.map((v, r) => `<div><i style="background:${REPEAT_COLORS[r % REPEAT_COLORS.length]}"></i>Repeat ${r + 1}<span>${fmt(v, mt.dec + 1)}</span></div>`).join("");
      tip.hidden = false;
      const px = cx / vb.width * box.width, pw = card.querySelector(".rp-chart").clientWidth;
      tip.style.left = Math.min(px + 14, pw - tip.offsetWidth - 4) + "px"; tip.style.top = "26%";
    };
    container.onmouseleave = () => { container.querySelectorAll(".rp-tip").forEach(t => t.hidden = true); container.querySelectorAll(".rp-cursor").forEach(c => c.setAttribute("hidden", "")); };
  }

  return { METRICS, REPEAT_COLORS, repeatsOf, niceAxis, spread, html, bind };
});
