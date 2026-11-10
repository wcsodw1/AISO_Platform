(function () {
  "use strict";
  const C = window.SizingCore;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f1 = (n, d = 1) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const gpus = C.GPUS.map(g => ({ ...g }));
  const shortName = n => n.replace(/（.*?）/g, "").replace("NVIDIA ", "").replace("Intel Arc Pro ", "").replace("AMD ", "");
  const Q = { q4km: "Q4", q8: "Q8" };

  /* ---------- mode switch ---------- */
  document.querySelectorAll("#szMode button").forEach(b => b.addEventListener("click", () => {
    const multi = b.dataset.m === "multi";
    document.querySelectorAll("#szMode button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
    $("szSingle").hidden = multi; $("szMulti").hidden = !multi;
    if (multi) render();
  }));

  /* ---------- per-model controls (built once so typing never loses focus) ---------- */
  const rows = C.VIS_MODELS.map(m => ({ m, on: true }));
  $("mzModels").innerHTML = C.VIS_MODELS.map(m => {
    const opts = m.quants.map(q => `<option value="${q}"${q === "q4km" ? " selected" : ""}>${C.QUANTS[q].label}</option>`).join("");
    const sizes = ["bf16", "fp8", "q8", "q4km"].filter(q => m.files[q]).map(q => `${C.QUANTS[q].label} ${f1(m.files[q].bytes / 1e9)} GB`).join(" · ");
    const hint = `${m.arch}。來源：${m.src}。實際檔案大小（Hugging Face，2026-11-10 查）：${sizes}；DFlash 草稿模型 ${f1(m.dflashGB, 2)} GB（未計入）。`;
    const L = (t, h, inner) => `<label><span class="lbl">${t}${h ? C.tip(h) : ""}</span>${inner}</label>`;
    return `<article class="mz-card" data-id="${m.id}">
      <header><label class="sz-check"><input autocomplete="off" type="checkbox" class="mz-on" checked> <b>${esc(m.name)}</b>${C.tip(hint)}</label></header>
      <div class="mz-ctl">
        ${L("Quantization<span class=\"bz\">量化</span>", "", `<select autocomplete="off" class="mz-q">${opts}</select>`)}
        ${L("Context / request<span class=\"bz\">每個請求</span>", "每個請求的上下文長度（tokens）。", '<input autocomplete="off" class="mz-ctx" type="number" min="1024" step="1024" value="32768">')}
        ${L("Traffic share<span class=\"bz\">流量比例</span>", "三個模型分攤並行請求的相對比例（1：1：1＝平均）。", '<input autocomplete="off" class="mz-share" type="number" min="0" step="1" value="1">')}
        ${L("Extra GB (MTP)<span class=\"bz\">額外容量</span>", "推測解碼用的 MTP 草稿頭檔案大小，隨量化自動帶入；不用 MTP 填 0。", `<input autocomplete="off" class="mz-extra" type="number" min="0" step="0.01" value="${f1(C.mtpOf(m, "q4km"), 2)}">`)}
      </div>
      </article>`;
  }).join("");

  const card = id => document.querySelector(`.mz-card[data-id="${id}"]`);
  function readGlobal() {
    return { users: C.num($("mzUsers").value, 1000), active: C.num($("mzActive").value, 40), inflight: C.num($("mzInflight").value, 25),
      runtimeGB: Math.max(0, C.num($("mzRuntime").value, 5)), headroomPct: Math.max(0, C.num($("mzHeadroom").value, 15)),
      usable: Math.min(100, Math.max(50, C.num($("mzUsable").value, 90))), kvBits: C.num($("mzKvBits").value, 16),
      pack: $("mzPack").value === "1", ha: $("mzHA").checked };
  }
  function readModel(m) {
    const c = card(m.id);
    return { on: c.querySelector(".mz-on").checked, quant: c.querySelector(".mz-q").value, context: Math.max(1024, C.num(c.querySelector(".mz-ctx").value, 32768)),
      share: Math.max(0, C.num(c.querySelector(".mz-share").value, 1)), extraGB: Math.max(0, C.num(c.querySelector(".mz-extra").value, 1)) };
  }

  function sizeAll(items, g, pack, ha) {
    const p = C.place(items, g, g.usablePct, pack), servers = p.servers + (ha ? 1 : 0);
    return { ...p, servers, gpu: g };
  }

  let picked = null, browse = {};
  function syncSummaries(g, sel) {
    $("mzReqSum").textContent = sel.length ? `${f1(g.users, 0)} users · ${sel.length} models · ${sel.map(x => (Q[x.cfg.quant] || x.cfg.quant)).join("/")}` : "No model selected 未選模型";
    $("mzReqTab").classList.toggle("warn", !sel.length);
    $("mzOptSum").textContent = `${g.pack ? "Shared packing" : "Per-model"}${g.ha ? " · HA" : ""}`;
    $("mzOptTab").classList.toggle("set", g.ha);
  }
  function render() {
    if ($("szMulti").hidden) return;
    const g = readGlobal(), conc = C.concurrentFromUsers(g.users, g.active, g.inflight);
    const sel = C.VIS_MODELS.map(m => ({ m, cfg: readModel(m) })).filter(x => x.cfg.on);
    syncSummaries(g, sel);
    const shares = sel.map(x => x.cfg.share), split = C.splitConcurrency(conc, shares.some(v => v > 0) ? shares : shares.map(() => 1));
    const budgets = sel.map((x, i) => C.modelBudget(x.m, { ...x.cfg, concurrent: split[i], runtimeGB: g.runtimeGB, headroomPct: g.headroomPct, kvBits: g.kvBits }));
    const total = budgets.reduce((a, b) => a + b.total, 0);
    $("mzTotal").textContent = sel.length ? C.memText(total) : "—";

    // per-model result blocks
    const sections = [{ title: "並行請求", rows: [{ k: "C", sym: "U × A × R", sub: `${f1(g.users, 0)} × ${g.active}% × ${g.inflight}%`, out: `${conc} 個同時推論請求`, note: sel.length ? "依流量比例分配：" + sel.map((x, i) => `${x.m.name} ${split[i]}`).join(" · ") : "" }] }];
    sel.forEach((x, i) => {
      const b = budgets[i], m = x.m, groupsTxt = m.groups.map(gr => `${gr.layers}×2×${gr.kvHeads}×${gr.headDim}×${g.kvBits / 8}B×${gr.window ? `min(T,${gr.window})` : "T"}`).join(" + ") + (m.stateMB ? ` + state ${m.stateMB} MiB` : "");
      sections.push({ title: `${m.name} · ${b.quant} · ${split[i]} 個並行請求`, rows: [
        { k: "W", sym: b.w.real ? "實際檔案大小（Hugging Face）" : "P × b ÷ 8", sub: b.w.real ? `${b.w.file}（${b.w.repo}）` : `${m.params}B × ${b.bpw} ÷ 8`, out: C.memText(b.weights),
          note: `有效 ${f1(b.bpw, 2)} bit/weight${b.w.vsBf16 ? `；約為 BF16（${f1(m.files.bf16.bytes / 1e9)} GB）的 ${f1(b.w.vsBf16 * 100, 0)}%（÷${f1(1 / b.w.vsBf16, 1)}）` : ""}` },
        { k: "KV", sym: "Σ 層數 × 2 × H_KV × D × (b_KV ÷ 8) × min(T, 窗口) ＋ 固定 state", sub: `(${groupsTxt}) → ${f1(b.perReq, 3)} GB/請求 × ${split[i]} 請求`, out: C.memText(b.kv), note: `T = ${f1(x.cfg.context, 0)} tokens` },
        { k: "R + E", sym: "Runtime ＋ 額外（MTP 檔案）", sub: `${f1(b.runtime)} + ${f1(b.extra, 2)}`, out: `${f1(b.runtime + b.extra, 2)} GB` },
        { k: "M_i", sym: "(W + KV + R + E) × (1 + h)", sub: `(${f1(b.weights)} + ${f1(b.kv)} + ${f1(b.runtime + b.extra, 2)}) × (1 + ${g.headroomPct}%)`, out: C.memText(b.total) }] });
    });
    sections.push({ title: "合計", rows: [{ k: "M_total", sym: "Σ M_i", sub: sel.length ? budgets.map(b => f1(b.total)).join(" + ") : "0", out: sel.length ? C.memText(total) : "—", fin: true }] });
    const legend = [["U", "總使用人數", f1(g.users, 0)], ["A", "尖峰活躍比例", `${g.active}%`], ["R", "活躍者等待回應比例", `${g.inflight}%`], ["C", "同時推論請求數", String(conc)],
      ["W", "模型權重（實際檔案）", sel.length ? C.memText(budgets.reduce((a, b) => a + b.weights, 0)) + " 合計" : "—"], ["KV", "KV Cache（每請求 × 請求數）", sel.length ? C.memText(budgets.reduce((a, b) => a + b.kv, 0)) + " 合計" : "—"],
      ["R + E", "Runtime 與 MTP 額外", `${f1(g.runtimeGB)} GB／模型 + MTP`], ["M_i", "單一模型顯存需求", "見各模型小節"], ["M_total", "三模型合計", sel.length ? C.memText(total) : "—"],
      ["h", "安全餘裕比例", `${g.headroomPct}%`], ["T", "每請求 Context", "各模型設定"]];
    window.SizingUI.setCalc($("mzFormula"), C.calcBoxHtml({ line: "M_total = Σ M_i，M_i = (W + KV + R + E) × (1 + h)", legend, sections }));

    // warnings
    const warn = [];
    if (!sel.length) warn.push("請至少勾選一個模型。");
    if (g.runtimeGB <= 0) warn.push("Runtime overhead 為 0 不實際：每個模型程序都要有 CUDA context 與 activation（建議每個模型至少 3～5 GB）。");
    if (g.headroomPct <= 0) warn.push("安全餘裕為 0%，沒有緩衝。");
    $("mzWarn").hidden = !warn.length; $("mzWarn").textContent = warn.join(" ");
    if (!sel.length) { ["mzCasHost", "mzPickDetail", "mzDetail", "mzCombos"].forEach(id => { $(id).innerHTML = ""; }); $("mzJumpTxt").textContent = "—"; return; }

    // GPU options
    const items = sel.map((x, i) => ({ name: x.m.name, total: budgets[i].total }));
    const list = C.variants(gpus).map(gp => ({ gpu: gp, size: sizeAll(items, { ...gp, usablePct: g.usable }, g.pack, g.ha) }))
      .sort((a, b) => (a.size.crossNode - b.size.crossNode) || a.size.servers * a.gpu.perServer - b.size.servers * b.gpu.perServer || a.size.servers - b.size.servers || a.size.gpus - b.size.gpus || b.gpu.vram - a.gpu.vram);
    if (picked && !list.some(o => o.gpu.id === picked)) picked = null;
    const nm = o => `${o.gpu.vendor} ${o.gpu.model} · ${o.gpu.perServer} GPU${o.gpu.perServer === 1 ? "" : "s"}/server`;
    const its = list.map((o, i) => ({ gpu: o.gpu, servers: o.size.servers, need: o.size.gpus, cross: o.size.crossNode, best: i === 0 && !o.size.crossNode }));
    $("mzCasHost").innerHTML = C.pickPanelHtml(its, picked, "mz", browse);
    $("mzJumpTxt").textContent = ` · ${nm(its[0])} · ${C.resEn(its[0].servers, C.physical(its[0]))}`;
    $("mzRows").innerHTML = C.refRowsHtml(gpus, gp => {
      const z = sizeAll(items, { ...gp, usablePct: g.usable }, g.pack, g.ha);
      return { warn: z.crossNode, html: `Needs <b>${z.gpus}</b> GPU${z.gpus === 1 ? "" : "s"} → <b>${C.resEn(z.servers, z.servers * gp.perServer)}</b>${z.crossNode ? ' <em class="warn">⚠ cross-node 需跨節點</em>' : ""}` };
    }, false);
    const cur = list.find(o => o.gpu.id === picked);
    if (!cur) {
      $("mzPickDetail").innerHTML = `<p class="sz-final-line">${C.memText(total)}<span class="bz">合計顯存 · 請從上方選擇機型</span></p>`;
      $("mzDetail").innerHTML = `<p class="sz-sub">Choose a machine first<span class="bz">先選擇機型</span></p>`;
    } else {
    const s = cur.size, gp = cur.gpu, ci = its.find(o => o.gpu.id === picked);
    const iso = sizeAll(items, { ...gp, usablePct: g.usable }, false, false), pk = sizeAll(items, { ...gp, usablePct: g.usable }, true, false);
    $("mzPickDetail").innerHTML = `<p class="sz-final-line">${C.memText(total)} → <b>${esc(nm(ci))} × ${C.resEn(s.servers, C.physical(ci))}</b><span class="bz">${s.servers} 台 · ${C.physical(ci)} 張 GPU</span></p>` +
      `<p class="sz-sub">${g.pack ? "共用打包" : "各模型獨立"}，容量需要 ${s.gpus} 張；每卡 ${gp.vram} GB（可規劃 ${f1(s.cap)} GB）、每台 ${gp.perServer} 張${g.ha ? "；含 +1 備援" : ""}　<small>共用打包 ${pk.gpus} 張／各模型獨立 ${iso.gpus} 張</small></p>` +
      (s.crossNode ? `<p class="sz-warnp">⚠ 需跨節點：有模型的 TP 超過每台 ${gp.perServer} 張 ${C.tip("不建議：必須跨節點（需高速互連，會拖慢 TPOT）。這只代表「顯存加起來夠」，不代表可行；建議改用單卡顯存更大的 GPU。")}</p>` : "");
    $("mzDetail").innerHTML = `<p class="sz-sub">TP 分片：${s.tp.map(t => `${esc(t.name)} ${t.k} 張`).join(" · ")} ${C.tip("每個模型的 TP 取 2 的次方張；同一模型的分片一定放在不同 GPU。")}</p>` +
      `<ol class="mz-bins">${s.bins.map((b, i) => `<li><b>GPU ${i + 1}</b><div class="mz-bar"><i style="width:${Math.min(100, b.used / s.cap * 100)}%"></i></div><span>${f1(b.used)} / ${f1(s.cap)} GB　${b.shards.map(sh => `${esc(sh.name)}${sh.k > 1 ? `（1/${sh.k} 分片）` : ""} ${f1(sh.gb)}`).join(" ＋ ")}</span></li>`).join("")}</ol>`;
    }

    // Q4 / Q8 combinations (only q4km / q8 considered)
    const opts = sel.map(x => x.m.quants.filter(q => Q[q]));
    const combos = opts.reduce((acc, qs) => acc.flatMap(c => qs.map(q => [...c, q])), [[]]);
    const feat = ["rtxpro6000", "h200", "b300"].map(id => gpus.find(x => x.id === id)).filter(Boolean);
    const curKey = sel.map(x => x.cfg.quant).join("|");
    const rowsHtml = combos.map(c => {
      const bs = sel.map((x, i) => C.modelBudget(x.m, { ...x.cfg, quant: c[i], extraGB: x.cfg.quant === c[i] ? x.cfg.extraGB : C.mtpOf(x.m, c[i]), concurrent: split[i], runtimeGB: g.runtimeGB, headroomPct: g.headroomPct, kvBits: g.kvBits }));
      const tot = bs.reduce((a, b) => a + b.total, 0), wsum = bs.reduce((a, b) => a + b.weights, 0), it = sel.map((x, i) => ({ name: x.m.name, total: bs[i].total }));
      const res = feat.map(gp => ({ gp, s: sizeAll(it, { ...gp, usablePct: g.usable }, g.pack, g.ha) }));
      const best = res.reduce((a, b) => (b.s.servers < a.s.servers || (b.s.servers === a.s.servers && b.s.gpus < a.s.gpus) ? b : a));
      return `<tr class="${c.join("|") === curKey ? "cur" : ""}"><th>${c.map(q => Q[q]).join(" · ")}${c.join("|") === curKey ? ' <i class="sz-flag">Current 目前</i>' : ""}</th><td>${C.memText(tot)}</td><td>${f1(wsum)} GB<small>${f1(tot - wsum)} GB 為 KV、Runtime 等</small></td>` +
        res.map(r => `<td class="${r === best ? "best" : ""}">${r.s.gpus} GPUs<small>${r.s.servers} server${r.s.servers === 1 ? "" : "s"}${r === best ? " ★" : ""}</small></td>`).join("") + "</tr>";
    }).join("");
    $("mzCombos").innerHTML = `<thead><tr><th>${sel.map(x => esc(x.m.name)).join(" · ")}</th><th>Total memory<span class="bz">合計顯存</span></th><th>of which weights<span class="bz">其中權重（檔案）</span></th>${feat.map(gp => `<th>${esc(shortName(gp.name))}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody>`;
  }

  $("mzCasHost").addEventListener("click", e => {
    const v = e.target.closest(".pp-v"), mo = e.target.closest(".pp-m"), c = e.target.closest(".pp-c");
    if (v) { browse = { v: v.dataset.v }; render(); } else if (mo) { browse = { ...browse, m: mo.dataset.m }; render(); } else if (c) { picked = c.dataset.id; browse = {}; render(); }
  });
  document.querySelectorAll(".mz-q").forEach(sel => sel.addEventListener("change", () => {
    const c = sel.closest(".mz-card"), m = C.VIS_MODELS.find(x => x.id === c.dataset.id);
    c.querySelector(".mz-extra").value = f1(C.mtpOf(m, sel.value), 2);
  }));
  $("szMulti").addEventListener("input", render);
  $("szMulti").addEventListener("change", render);
  window.SizingMulti = { render };
})();
