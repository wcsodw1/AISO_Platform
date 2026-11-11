(function () {
  "use strict";
  /* Hover dropdowns (.sz-hn): pointer over a tab shows its panel; leaving hides it unless a field inside has focus;
     click pins (touch / keyboard). Delegated on document so blocks that are re-rendered keep working. */
  const tabsOf = box => [...box.querySelectorAll(":scope > .sz-hn-tabs > .sz-hn-tab")];
  const panelsOf = box => [...box.querySelectorAll(":scope > .sz-hn-panels > .sz-hn-panel")];
  function hnShow(box, p) {
    box.dataset.open = p || "";
    tabsOf(box).forEach(t => { const on = t.dataset.p === p; t.classList.toggle("on", on); t.setAttribute("aria-expanded", on); });
    panelsOf(box).forEach(x => x.classList.toggle("on", x.dataset.p === p));
    if (p) revealPanel(box, p);
  }
  /* A panel that opens below the visible area looks like it "dropped away": bring it into view (never push the tab under the header). */
  function revealPanel(box, p) {
    const el = panelsOf(box).find(x => x.dataset.p === p), tab = tabsOf(box).find(t => t.dataset.p === p);
    if (!el) return;
    setTimeout(() => {
      const r = el.getBoundingClientRect(), tr = tab ? tab.getBoundingClientRect() : r, over = r.bottom - (innerHeight - 24), room = tr.top - 96;
      if (over > 0 && room > 0) window.scrollBy({ top: Math.min(over, room), behavior: "smooth" });
    }, 40);
  }
  const keep = box => { const a = document.activeElement; return !!(a && box.contains(a) && a.matches("input,select,textarea")); };
  const boxOf = el => el.closest && el.closest(".sz-hn");
  document.addEventListener("mouseover", e => { const t = e.target.closest && e.target.closest(".sz-hn-tab"); if (t) hnShow(t.closest(".sz-hn"), t.dataset.p); });
  document.addEventListener("mouseout", e => { const box = boxOf(e.target); if (box && !box.contains(e.relatedTarget) && !keep(box)) hnShow(box, box.dataset.pinned || null); });
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest(".sz-hn-tab"); if (!t) return;
    const box = t.closest(".sz-hn"); box.dataset.pinned = box.dataset.pinned === t.dataset.p ? "" : t.dataset.p; hnShow(box, box.dataset.pinned || null);
  });
  document.addEventListener("focusin", e => {
    const box = boxOf(e.target); if (!box) return;
    const t = e.target.closest(".sz-hn-tab"), p = e.target.closest(".sz-hn-panel");
    if (t) hnShow(box, t.dataset.p); else if (p) hnShow(box, p.dataset.p);
  });
  document.addEventListener("focusout", e => { const box = boxOf(e.target); if (box && !box.contains(e.relatedTarget)) hnShow(box, box.dataset.pinned || null); });
  /* re-render a block (calculation box) without closing the dropdown the user is looking at */
  function setCalc(container, html) {
    const old = container.querySelector(".sz-hn"), st = old ? { open: old.dataset.open || "", pinned: old.dataset.pinned || "" } : null;
    container.innerHTML = html;
    const nb = container.querySelector(".sz-hn");
    if (nb && st) { nb.dataset.pinned = st.pinned; hnShow(nb, st.open || null); }
  }
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("[data-jump]"); if (!a) return;
    e.preventDefault();
    const t = document.getElementById(a.dataset.jump); if (!t) return;
    t.scrollIntoView({ behavior: "smooth", block: "start" });
    t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
    setTimeout(() => t.classList.remove("flash"), 1800);
  });
  window.SizingUI = { hnShow, setCalc };
})();
(function () {
  "use strict";
  const C = window.SizingCore, UI = window.SizingUI;
  const $ = id => document.getElementById(id);
  const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const gpus = C.GPUS.map(g => ({ ...g })); // editable copies

  const el = {
    model: $("szModel"), params: $("szParams"), wbits: $("szWBits"), meta: $("szMeta"),
    layers: $("szLayers"), kvHeads: $("szKvHeads"), headDim: $("szHeadDim"), note: $("szModelNote"),
    kvBits: $("szKvBits"), context: $("szContext"), conc: $("szConc"),
    users: $("szUsers"), active: $("szActive"), inflight: $("szInflight"), estConc: $("szEstConc"), apply: $("szApplyConc"),
    runtime: $("szRuntime"), headroom: $("szHeadroom"), usable: $("szUsable"), custom: $("szCustomBox"), cfg: $("szCfg"), cfgMsg: $("szCfgMsg")
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
    ["szBars", "szBreak", "szCasHost", "szPickDetail", "szPickCalc", "szRows"].forEach(id => { $(id).innerHTML = ""; });
    $("szJumpTxt").textContent = "—";
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

  function renderBars(b, inp) {
    /* the four cards are the four terms of M_required — same symbols as the result row, % = term ÷ M_required */
    const parts = [["M_weights", "Weights|模型權重", b.weights, "w"], ["M_KV", "KV cache|KV 快取", b.kv, "k"], ["M_runtime", "Runtime|執行時", b.runtime, "r"], ["M_headroom", "Headroom|安全餘裕", b.headroom, "h"]].sort((x, y) => y[2] - x[2]);   // largest share first
    const perReq = b.kvPerTokenKiB * 1024 * inp.context / 1e9;
    /* the bar is sorted largest to smallest; one request's KV (part of M_KV, = M_KV / C) is drawn as its own striped piece so the order stays by size */
    const hasSlice = inp.concurrent > 1 && perReq > 0 && perReq < b.kv;
    const segs = parts.map(([sym, n, v, c]) => ({ v: c === "k" && hasSlice ? v - perReq : v, c, t: `${sym} ${n.replace("|", " ")} ${fmt(v)} GB${c === "k" && hasSlice ? `（含右側斜紋：每請求 ${fmt(perReq, 1)} GB）` : ""}` }));
    if (hasSlice) segs.push({ v: perReq, c: "kr", t: `KV per request 每請求 KV ${fmt(perReq, 1)} GB = M_KV ÷ C（M_KV 的 1/${inp.concurrent}）` });
    segs.sort((x, y) => y.v - x.v);
    $("szBars").innerHTML = segs.map(g => `<i class="sz-seg ${g.c}" style="flex:${Math.max(g.v, 0.0001)}" title="${g.t}"></i>`).join("");
    $("szBreak").innerHTML = parts.map(([sym, n, v, c]) => `<div class="cc-${c}"><dt><i class="sz-dot ${c}"></i>${C.sci(sym)}<small class="dtn">${n.split("|")[0]}<span class="bz">${n.split("|")[1]}</span></small></dt><dd>${fmt(v)} GB<small>${b.total ? fmt(v / b.total * 100, 0) : 0}%</small></dd></div>`).join("") +
      `<div class="cc-kr"><dt><i class="sz-dot kr"></i>KV per request<span class="bz">每請求 KV</span>${C.tip("M_KV 的拆解：每個 token 在每一層都要存 K 和 V，單看每 token 的數字很小；乘上 Context 才是每個請求的實際佔用，再乘上同時請求數 C 就是 M_KV。實際執行時分頁與碎片會再多一些，由「安全餘裕」吸收。")}</dt><dd>${fmt(perReq, 1)} GB<small class="kvsub">= ${C.sci("M_KV")} ÷ ${C.sci("C")} = ${fmt(b.kv)} ÷ ${inp.concurrent}<br>${fmt(b.kvPerTokenKiB, 0)} KiB/token × ${fmt(inp.context / 1024, 0)}K tokens</small></dd></div>`;
  }
  function renderRows(b, usablePct) {
    $("szRows").innerHTML = C.refRowsHtml(gpus, g => {
      const s = C.sizeFor(b.total, g, usablePct, {});
      return { html: `Needs <b>${s.gpusMin}</b> GPU${s.gpusMin === 1 ? "" : "s"} · TP <b>${s.gpusTP}</b> → <b>${C.resEn(s.withHA, s.withHA * g.perServer)}</b>${s.serversByTps > s.serversByMem ? " · 吞吐量決定台數" : ""}` };
    }, true);
  }

  let picked = null, browse = {}, refState = {};
  function renderFormula(b, usablePct, opts) {
    $("szFTotal").textContent = C.memText(b.total);
    const inp = read();
    UI.setCalc($("szFormula"), C.calcBoxHtml({ line: "M_required = M_weights + M_KV + M_runtime + M_headroom", legend: C.legendFor(inp, b), sections: [{ rows: C.formula(inp, b) }] }));
    const list = C.options(b.total, C.variants(gpus), usablePct, opts);
    if (picked && !list.some(o => o.gpu.id === picked)) picked = null;   // default: nothing chosen, the user picks a machine
    const items = list.map((o, i) => ({ gpu: o.gpu, servers: o.size.withHA, need: o.size.gpusMin, tp: o.size.gpusTP, best: i === 0 }));
    $("szCasHost").innerHTML = C.pickPanelHtml(items, picked, "sz", browse);
    C.syncRef($("szCasHost"), $("szRows"), refState);
    const label = o => `${o.gpu.vendor} ${o.gpu.model} · ${o.gpu.perServer} GPU${o.gpu.perServer === 1 ? "" : "s"}/server`, bestI = items[0];
    $("szJumpTxt").textContent = ` · ${label(bestI)} · ${C.resEn(bestI.servers, C.physical(bestI))}`;
    const cur = list.find(o => o.gpu.id === picked);
    if (!cur) {
      $("szPickDetail").innerHTML = `<p class="sz-final-line">${C.memText(b.total)}<span class="bz">需要的總顯存 · 請從上方選擇機型</span></p>`;
      $("szPickCalc").innerHTML = `<p class="sz-sub">Choose a machine first<span class="bz">先選擇機型</span></p>`;
      return;
    }
    const g = cur.gpu, s = cur.size, gf = C.gpuFormula(b.total, g, usablePct, s), ci = items.find(o => o.gpu.id === picked);
    /* visible: one result line (+ one warning when a cross-node TP would be needed) */
    $("szPickDetail").innerHTML = `<p class="sz-final-line">${C.memText(b.total)} → <b>${esc(label(ci))} × ${C.resEn(s.withHA, C.physical(ci))}</b><span class="bz">${s.withHA} 台 · ${C.physical(ci)} 張 GPU</span></p>` +
      `<p class="sz-sub">容量需要 ${s.gpusMin} 張，TP ${s.gpusTP} 張；每卡 ${g.vram} GB、每台 ${g.perServer} 張${s.serversByTps > s.serversByMem ? "；台數由吞吐量決定" : ""}</p>`;
    $("szPickCalc").innerHTML = `<p class="sz-gl"><b>${esc(g.name)}</b>　每卡 ${g.vram} GB、每台 ${g.perServer} 張</p>` +
      `<p class="sz-sym">${C.sci(gf.sym)} ${C.tip(`V：每卡 VRAM（${g.vram} GB）；u：每卡可規劃容量比例（${usablePct}%）；⌈ ⌉ 表示無條件進位。`)}</p><p class="sz-sub">= ${esc(gf.sub)}</p><p class="sz-sub">${esc(gf.tp)}</p>`;
  }
  function render() {
    const inp = read();
    const usablePct = Math.min(100, Math.max(50, C.num(el.usable.value, 90)));
    el.estConc.textContent = C.concurrentFromUsers(C.num(el.users.value, 1), C.num(el.active.value, 0), C.num(el.inflight.value, 0));
    if (!(inp.params > 0 && inp.layers > 0 && inp.kvHeads > 0 && inp.headDim > 0)) { showEmpty(); return; }   // never show a misleading total while the model is incomplete
    const b = C.budget(inp);
    $("szTotal").textContent = fmt(b.total);
    renderBars(b, inp);
    renderRows(b, usablePct);
    renderFormula(b, usablePct, {});
    const warn = $("szWarn"), msgs = [];
    if (!inp.params || !inp.layers || !inp.kvHeads || !inp.headDim) msgs.push("模型參數、層數、KV Heads、Head Dimension 需大於 0。");
    if (inp.runtimeGB <= 0) msgs.push("Runtime overhead 為 0 不實際：CUDA context、activation、推論框架一定會佔顯存（建議至少 5 GB，單一大模型通常 10～15 GB）。");
    if (inp.headroomPct <= 0) msgs.push("安全餘裕為 0%：峰值負載與碎片化沒有緩衝，建議 10～20%。");
    if (b.total && b.kv / b.total > 0.6) msgs.push("KV Cache 佔總需求超過 60%：Context 或併發是主因，可評估 KV 量化（FP8）、縮短 Context、Prefix Caching。");
    warn.hidden = !msgs.length; warn.textContent = msgs.join(" ");
  }

  $("szCasHost").addEventListener("click", e => {
    const v = e.target.closest(".pp-v"), m = e.target.closest(".pp-m"), c = e.target.closest(".pp-c");
    if (v) { browse = { v: v.dataset.v }; render(); } else if (m) { browse = { ...browse, m: m.dataset.m }; render(); } else if (c) { picked = c.dataset.id; browse = {}; render(); }
  });
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
