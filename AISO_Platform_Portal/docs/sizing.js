(function () {
  "use strict";
  const C = window.SizingCore;
  const $ = id => document.getElementById(id);
  const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const gpus = C.GPUS.map(g => ({ ...g })); // editable copies

  const el = {
    model: $("szModel"), params: $("szParams"), wbits: $("szWBits"), meta: $("szMeta"),
    layers: $("szLayers"), kvHeads: $("szKvHeads"), headDim: $("szHeadDim"), note: $("szModelNote"),
    kvBits: $("szKvBits"), context: $("szContext"), conc: $("szConc"),
    users: $("szUsers"), active: $("szActive"), inflight: $("szInflight"), estConc: $("szEstConc"), apply: $("szApplyConc"),
    runtime: $("szRuntime"), headroom: $("szHeadroom"), usable: $("szUsable"),
    reqTps: $("szReqTps"), srvTps: $("szSrvTps"), ha: $("szHA"), custom: $("szCustomBox"), cfg: $("szCfg"), cfgMsg: $("szCfgMsg")
  };

  el.model.innerHTML = C.MODELS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  el.model.value = "llama33-70b";

  function loadPreset() {
    const m = C.MODELS.find(x => x.id === el.model.value);
    if (!m) return;
    if (m.id !== "custom") {
      el.params.value = m.params; el.layers.value = m.layers; el.kvHeads.value = m.kvHeads; el.headDim.value = m.headDim;
    } else {
      /* Custom = start from a blank form, not from the previous preset's numbers */
      ["params", "layers", "kvHeads", "headDim"].forEach(k => { el[k].value = ""; });
      el.cfg.value = ""; el.cfgMsg.textContent = "";
    }
    el.note.hidden = !m.note; el.note.textContent = m.note || "";
    syncCustomUI();
  }
  const FIELDS = ["params", "layers", "kvHeads", "headDim"];
  const PH = { params: "例如 70（十億）", layers: "例如 80", kvHeads: "例如 8", headDim: "例如 128" };
  function syncCustomUI() {
    const custom = el.model.value === "custom";
    el.custom.hidden = !custom;
    FIELDS.forEach(k => { el[k].placeholder = custom ? PH[k] : ""; el[k].classList.toggle("need", custom && !String(el[k].value).trim()); });
  }
  function showEmpty() {
    $("szFTotal").textContent = "—"; $("szTotal").textContent = "—";
    $("szFormula").innerHTML = '<p class="sz-empty">請先輸入模型參數（總參數量、層數、KV heads、head 維度），輸入完成後才會計算；也可以貼上 config.json 自動帶入。</p>';
    ["szBars", "szBreak", "szOptions", "szPickDetail", "szRows"].forEach(id => { $(id).innerHTML = ""; });
    $("szWarn").hidden = true;
  }
  function applyConfig() {
    const txt = el.cfg.value.trim();
    if (!txt) { el.cfgMsg.textContent = ""; return; }
    try {
      const r = C.parseConfig(txt);
      el.layers.value = r.layers; el.kvHeads.value = r.kvHeads; el.headDim.value = r.headDim;
      el.cfgMsg.innerHTML = `<span class="sz-cfgok">✓ 已帶入：層數 ${r.layers} · KV heads ${r.kvHeads} · head 維度 ${r.headDim}</span>${r.notes.map(n => `<br>⚠ ${esc(n)}`).join("")}<br>總參數量請手動填。`;
    } catch (e) {
      el.cfgMsg.innerHTML = `<span class="sz-cfgerr">✗ ${esc(e.message)}</span>`;
    }
    syncCustomUI(); render();
  }

  function read() {
    return {
      params: C.num(el.params.value, 0), weightBits: C.num(el.wbits.value, 16), metaPct: C.num(el.meta.value, 10),
      layers: C.num(el.layers.value, 0), kvHeads: C.num(el.kvHeads.value, 0), headDim: C.num(el.headDim.value, 0),
      kvBits: C.num(el.kvBits.value, 16), context: C.num(el.context.value, 0), concurrent: Math.max(1, C.num(el.conc.value, 1)),
      runtimeGB: Math.max(0, C.num(el.runtime.value, 15)), headroomPct: Math.max(0, C.num(el.headroom.value, 15))
    };
  }

  function renderBars(b) {
    const parts = [["Weights", b.weights, "w"], ["KV Cache", b.kv, "k"], ["Runtime", b.runtime, "r"], ["Headroom", b.headroom, "h"]];
    $("szBars").innerHTML = parts.map(([n, v, c]) => `<i class="sz-seg ${c}" style="flex:${Math.max(v, 0.0001)}" title="${n} ${fmt(v)} GB"></i>`).join("");
    $("szBreak").innerHTML = parts.map(([n, v, c]) => `<div><dt><i class="sz-dot ${c}"></i>${n}</dt><dd>${fmt(v)} GB<small>${b.total ? fmt(v / b.total * 100, 0) : 0}%</small></dd></div>`).join("") +
      `<div><dt>KV / token</dt><dd>${fmt(b.kvPerTokenKiB, 0)} KiB</dd></div>`;
  }

  function renderRows(b, usablePct) {
    const reqTps = C.num(el.reqTps.value, 0), srvTps = C.num(el.srvTps.value, 0), ha = el.ha.checked;
    $("szRows").innerHTML = gpus.map((g, i) => {
      const s = C.sizeFor(b.total, g, usablePct, { requiredTps: reqTps, perServerTps: srvTps, ha });
      const notes = [];
      if (s.crossNode) notes.push("TP 超過單台，需跨節點");
      if (s.serversByTps > s.serversByMem) notes.push("吞吐量決定台數");
      if (ha) notes.push("已含 +1 備援");
      if (g.assumed) notes.push("規格為規劃假設");
      if (g.basis) notes.push(g.basis);
      return `<tr class="${s.crossNode ? "warn" : ""}"><th>${esc(g.name)}${g.assumed ? ' <i class="sz-flag" title="規劃假設">假設</i>' : ""}</th>` +
        `<td><input class="sz-mini" data-i="${i}" data-k="vram" type="number" min="1" value="${g.vram}"> GB</td>` +
        `<td><input class="sz-mini" data-i="${i}" data-k="perServer" type="number" min="1" value="${g.perServer}"></td>` +
        `<td>${s.gpusMin} 張</td><td><b>${s.gpusTP} 張</b></td>` +
        `<td><b class="sz-srv">${s.withHA} 台</b><small>${s.withHA * g.perServer} 張 · ${fmt(s.physicalVram, 0)} GB</small></td>` +
        `<td>${notes.map(esc).join("；") || "—"}</td></tr>`;
    }).join("");
  }

  let picked = null;
  function renderFormula(b, usablePct, opts) {
    $("szFTotal").textContent = C.memText(b.total);
    const inp = read();
    $("szFormula").innerHTML = C.calcBoxHtml({ line: "M_required = M_weights + M_KV + M_runtime + M_headroom", legend: C.legendFor(inp, b), sections: [{ rows: C.formula(inp, b) }] });
    const list = C.options(b.total, gpus, usablePct, opts);
    if (!picked || !list.some(o => o.gpu.id === picked)) picked = list[0].gpu.id;
    $("szOptions").innerHTML = list.map((o, i) => `<button type="button" role="radio" aria-checked="${o.gpu.id === picked}" class="sz-opt${o.gpu.id === picked ? " on" : ""}${o.size.crossNode ? " cross" : ""}" data-id="${o.gpu.id}">` +
      `<b>${esc(o.gpu.name.replace(/（.*?）/g, "").replace("NVIDIA ", "").replace("Intel Arc Pro ", "").replace("AMD ", ""))} × ${o.size.gpusMin}</b>` +
      `<small>${o.size.crossNode ? '<em class="sz-warnTag">⚠ 需跨節點</em> · ' : (i === 0 ? "★ 建議 · " : "")}${o.size.withHA} 台（${o.size.withHA * o.gpu.perServer} 張）</small></button>`).join("");
    const cur = list.find(o => o.gpu.id === picked), g = cur.gpu, s = cur.size, gf = C.gpuFormula(b.total, g, usablePct, s);
    $("szPickDetail").innerHTML = `<p class="sz-gl"><b>${esc(g.name)}</b>${g.assumed ? ' <i class="sz-flag">假設</i>' : ""}　每卡 ${g.vram} GB、每台 ${g.perServer} 張</p>` +
      `<p class="sz-sym">${C.sci(gf.sym)}</p><p class="sz-lgl"><var>V</var>：每卡 VRAM（${g.vram} GB）；<var>u</var>：每卡可規劃容量比例（${usablePct}%）；⌈ ⌉ 表示無條件進位</p><p class="sz-sub">= ${esc(gf.sub)}</p><p class="sz-sub">${esc(gf.tp)}${s.crossNode ? "（超過單台，需跨節點）" : ""}</p>` +
      (s.crossNode ? `<p class="sz-warnp">⚠ 不建議：單一模型需要 TP ${s.gpusTP} 張，超過這個機型每台 ${g.perServer} 張，必須跨節點（需 InfiniBand／RoCE 等高速互連，頻寬與延遲會拖慢 TPOT），而且要 ${s.withHA} 台機器。這個容量下限只代表「顯存加起來夠」，不代表可行；建議改用單卡顯存更大的 GPU。</p>` : "") +
      `<p class="sz-final">${C.memText(b.total)} → <b>${g.name.replace(/（.*?）/g, "")} × ${s.gpusMin}</b>（容量下限）／TP 建議 ${s.gpusTP} 張／<b>${s.withHA} 台</b>，實體顯存 ${C.memText(s.physicalVram)}${s.serversByTps > s.serversByMem ? "；台數由吞吐量決定" : ""}${$("szHA").checked ? "；含 +1 備援" : ""}</p>`;
  }
  /* optional block lives in a hover "curtain": show on the tab whether it holds values, so hidden settings are never forgotten */
  function syncCurtain() {
    const set = !!(String(el.reqTps.value).trim() || String(el.srvTps.value).trim() || el.ha.checked);
    $("szCurtain").classList.toggle("set", set);
    $("szCurtainHint").textContent = set ? "✓ 已設定" : "選填 · 滑鼠移過來展開";
  }
  $("szCurtainTab").addEventListener("click", () => {
    const open = $("szCurtain").classList.toggle("open");
    $("szCurtainTab").setAttribute("aria-expanded", open);
  });
  function render() {
    syncCurtain();
    const inp = read();
    const usablePct = Math.min(100, Math.max(50, C.num(el.usable.value, 90)));
    el.estConc.textContent = C.concurrentFromUsers(C.num(el.users.value, 1), C.num(el.active.value, 0), C.num(el.inflight.value, 0));
    if (!(inp.params > 0 && inp.layers > 0 && inp.kvHeads > 0 && inp.headDim > 0)) { showEmpty(); return; }   // never show a misleading total while the model is incomplete
    const b = C.budget(inp);
    $("szTotal").textContent = fmt(b.total);
    renderBars(b);
    renderRows(b, usablePct);
    renderFormula(b, usablePct, { requiredTps: C.num(el.reqTps.value, 0), perServerTps: C.num(el.srvTps.value, 0), ha: el.ha.checked });
    const warn = $("szWarn"), msgs = [];
    if (!inp.params || !inp.layers || !inp.kvHeads || !inp.headDim) msgs.push("模型參數、層數、KV Heads、Head Dimension 需大於 0。");
    if (inp.runtimeGB <= 0) msgs.push("Runtime overhead 為 0 不實際：CUDA context、activation、推論框架一定會佔顯存（建議至少 5 GB，單一大模型通常 10～15 GB）。");
    if (inp.headroomPct <= 0) msgs.push("安全餘裕為 0%：峰值負載與碎片化沒有緩衝，建議 10～20%。");
    if (b.total && b.kv / b.total > 0.6) msgs.push("KV Cache 佔總需求超過 60%：Context 或併發是主因，可評估 KV 量化（FP8）、縮短 Context、Prefix Caching。");
    warn.hidden = !msgs.length; warn.textContent = msgs.join(" ");
  }

  $("szOptions").addEventListener("click", e => { const b = e.target.closest(".sz-opt"); if (b) { picked = b.dataset.id; render(); } });
  el.model.addEventListener("change", () => { loadPreset(); render(); if (el.model.value === "custom") el.params.focus(); });
  FIELDS.forEach(k => el[k].addEventListener("input", () => { el.model.value = "custom"; el.note.hidden = true; syncCustomUI(); render(); }));
  el.cfg.addEventListener("input", applyConfig);
  el.apply.addEventListener("click", () => { el.conc.value = el.estConc.textContent; render(); });
  document.querySelector(".sz-inputs").addEventListener("input", render);
  document.querySelector(".sz-inputs").addEventListener("change", render);
  $("szRows").addEventListener("change", e => {
    const t = e.target; if (!t.dataset || t.dataset.i === undefined) return;
    const v = C.num(t.value, 0); if (v > 0) gpus[+t.dataset.i][t.dataset.k] = v; render();
  });

  loadPreset();
  render();
})();
