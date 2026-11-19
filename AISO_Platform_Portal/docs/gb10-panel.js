"use strict";
/* GB10 weight-quantization panel for the Run page (third kind of test on GB10; run-wizard.js draws it).
   WHAT is tested (spec + weights choice) and HOW FAR (12 cases, done / total = percent, per-case grid), live from /api/benchmark/gb10matrix/status - also when the run was started by hand.
   Start / Stop go through the one-time test password; the weights option is a fixed list (never free text). Same look as the AISO1 KV cache panel. */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const W = { bf16: ["bf16", "bf16（不量化）"], fp8: ["fp8 online", "fp8 線上量化"], fp8pre: ["fp8 pre-quantized", "fp8 預量化"], int8: ["int8 AWQ", "int8 AWQ"], nvfp4: ["NVFP4", "NVFP4（NVIDIA 官方）"], int4: ["int4 AWQ", "int4 AWQ"] };
  const NPS = [1, 3, 5], INS = [65536, 131072], OUTS = [256, 512], TOTAL = 12;
  const kn = n => `${n / 1024}K`;
  const G = { status: null, weights: "bf16", msg: "", starting: false, poll: null, render: null, at: 0, loading: false, term: false, seenLog: null, seenN: 0, last: "", wasBusy: false, fold: {} };
  const fold = (k, title, inner) => `<details class="gb-fold" data-gbfold="${k}"${G.fold[k] ? " open" : ""}><summary>${title}</summary>${inner}</details>`;
  if (!document.getElementById("gbfold-css")) {
    const st = document.createElement("style"); st.id = "gbfold-css";
    st.textContent = ".gb-fold{margin:10px 0;border-top:1px solid rgba(244,239,228,.1)}.gb-fold>summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none;padding:10px 0;font-weight:600;color:var(--ivory,#f3efe5)}"
      + ".gb-fold>summary::-webkit-details-marker{display:none}.gb-fold>summary::before{content:\"\\25B8\";color:var(--gold,#d8c779);font-size:18px;line-height:1}.gb-fold[open]>summary::before{content:\"\\25BE\"}"
      + ".gb-fold>summary small.gb-pick{margin-left:auto;font-weight:500;color:var(--muted,#98a0ad)}"
      + ".gb-now{margin:12px 0;padding:12px 14px;border:1px solid rgba(216,199,121,.45);border-radius:12px;background:rgba(216,199,121,.07)}.gb-now b{color:var(--gold,#d8c779)}.gb-now .gb-pos{display:block;margin-top:4px;font-size:20px;font-weight:700;color:var(--ivory,#f3efe5)}.gb-now small{display:block;color:var(--muted,#98a0ad);margin-top:2px}";
    document.head.appendChild(st);
    document.addEventListener("toggle", e => { const d = e.target; if (d && d.matches && d.matches("details[data-gbfold]")) G.fold[d.dataset.gbfold] = d.open; }, true);
  }
  const pc = (d, t) => `${d}/${t} = ${(100 * d / t).toFixed(1)}%`;

  function plain(l) {
    let m;
    if ((m = /^CASE NP(\d+) input (\d+) output (\d+)(.*)$/.exec(l))) return `▶ NP${m[1]} · Input ${kn(+m[2])} · Output ${m[3]}${m[4] ? " (KV tight: sent anyway)" : ""}`;
    if ((m = /^\s+(PASS|FAIL) NP(\d+) in(\d+) out(\d+)\s*(.*)$/.exec(l))) return `${m[1] === "PASS" ? "✓" : "✗"} ${m[1]} · NP${m[2]} · ${kn(+m[3])} / ${m[4]} · ${m[5].replace(/\s+/g, " ")}`;
    if (/^DONE/.test(l)) return "✓ All cases done · 全部完成";
    if (/^SUMMARY_CSV/.test(l)) return "Summary saved · 摘要已存檔";
    if (/^starting vLLM/.test(l)) return "Starting vLLM (own container) · 啟動 vLLM";
    if ((m = /^KV cache capacity: (.*)$/.exec(l))) return `KV cache capacity: ${m[1]}`;
    return l;
  }
  function feed() {
    const st = G.status;
    if (!G.term || typeof window.tlog !== "function" || !st || !st.ok) return;
    window.__rwBusy = !!st.busy; const ts = document.getElementById("termState"); if (ts) ts.textContent = st.busy ? "running" : "idle";
    if (Array.isArray(st.vllm) && st.vllm.length) {      // the vLLM container's own lines: loading / compiling / KV allocation are silent in the matrix log
      const i = G.vLast ? st.vllm.lastIndexOf(G.vLast) : -1, fresh = i >= 0 ? st.vllm.slice(i + 1) : st.vllm.slice(-6);
      fresh.forEach(l => window.tlog("vLLM › " + l, /^⚠|Traceback|Error/.test(l) ? "err" : undefined)); G.vLast = st.vllm[st.vllm.length - 1];
    }
    if (!st.log) return;
    const tail = st.tail || [], total = st.log_lines || tail.length;
    if (st.log !== G.seenLog) { G.seenLog = st.log; G.seenN = Math.max(0, total - Math.min(tail.length, 40)); G.last = ""; window.tlog(`── GB10 · ${(st.config && st.config.en) || (W[st.weights] || ["?"])[0]} · ${st.log} ──`); }
    const n = total - G.seenN; if (n <= 0) return;
    tail.slice(-Math.min(n, tail.length)).map(plain).forEach(l => { if (l && l !== G.last) { G.last = l; window.tlog(l, /^✗|Traceback|Error/.test(l) ? "err" : undefined); } });
    G.seenN = total;
  }

  function grid(st) {
    const by = {}; (st.cases_all && st.cases_all.length ? st.cases_all : (st.cases || [])).forEach(c => { by[`${c.np}|${c.input}|${c.output}`] = c; });
    const ins = (st.progress && st.progress.total > TOTAL) || (st.cases_all || []).some(c => c.input === 8192) ? [8192, 65536, 131072] : INS;      // the 8K round is part of this run: show its cells too
    const now = st.now && `${st.now.np}|${st.now.input}|${st.now.output}`;
    const cell = (np, i, o) => {
      const k = `${np}|${i}|${o}`, c = by[k];
      if (c) return `<td class="${c.status === "PASS" ? "kv-ok" : "kv-bad"}" title="${esc(c.status)}"><b>${c.status === "PASS" ? "✓" : "✗"}</b>${c.status === "PASS" ? `<small>${c.agg != null ? c.agg.toFixed(1) : ""} tok/s</small>` : ""}</td>`;
      if (k === now && st.busy) return `<td class="kv-cur"><b>…</b></td>`;
      return `<td class="kv-wait"><b>—</b></td>`;
    };
    return `<div class="kv-where"><p class="kv-note">${bi("Where it is · one cell per case (NP × Input × Output)", "測到哪 · 每格一個情境（NP × 輸入 × 輸出）")}</p><div class="kv-wrap"><table class="kv-tab"><thead><tr><th>NP</th>${ins.flatMap(i => OUTS.map(o => `<th>${kn(i)} · ${o}</th>`)).join("")}</tr></thead><tbody>${NPS.map(np => `<tr><th>NP${np}</th>${ins.flatMap(i => OUTS.map(o => cell(np, i, o))).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }

  function question() {
    const st = G.status, ok = st && st.ok, busy = ok && st.busy, ours = ok && st.ours, byHand = busy && !ours;
    const done = ok ? (st.cases || []).length : 0, row = (a, b) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`;
    const sel = (st && busy && W[st.weights]) ? st.weights : G.weights;
    const cfg = busy && st.config ? st.config : null, wl = cfg ? cfg.en : (W[sel] || ["?"])[0];      // what is REALLY running (a configuration the option list does not know, e.g. NVFP4 weights + NVFP4 KV, must not show as the default bf16)
    const pdone = (ok && st.progress) ? st.progress.done : done, ptot = (ok && st.progress) ? st.progress.total : TOTAL;
    const spec = `<dl class="rw-sum kv-spec">${row("Test", cfg && cfg.key === "nvfp4kv" ? "NVFP4 weights + NVFP4 KV cache · Gemma 4 26B on vLLM · long context" : "Weight quantization (bf16 / fp8 / int8 / int4) · Gemma 4 26B on vLLM · KV cache fp8 · long context")}${row("Machine", "GB10 · 128 GB unified memory")}${row("Weights", wl + (busy ? " (running now)" : ""))}${row("Concurrency", "NP 1 / 3 / 5")}${row("Input", st && st.progress && st.progress.total > TOTAL ? "8K / 64K / 128K" : "64K (65,536) / 128K (131,072)")}${row("Output", "256 / 512 tokens")}${row("Repeat", "1 run per case · " + ((busy && st.progress) ? st.progress.total : 12) + " cases")}</dl>`;
    const opts = Object.keys(W).map(k => `<button type="button" class="mw-opt${k === sel ? " sel" : ""}${busy ? " off" : ""}" data-act="gbw" data-w="${k}"${busy ? ' aria-disabled="true"' : ""}><span class="mw-l"><b>${bi(W[k][0], W[k][1])}</b></span></button>`).join("");
    const bar = ok && (busy || pdone) ? `<span class="kv-bar"><i style="width:${Math.round(100 * pdone / ptot)}%"></i></span><span class="kv-pc">${esc(pc(pdone, ptot))}${st.done ? " · done" : ""}</span>` : "";
    const nowBox = busy ? `<div class="gb-now"><b>${bi("Now", "目前")}</b>${cfg ? " · " + esc(cfg.en) : ""}<span class="gb-pos">${st.now ? esc(`Input ${kn(st.now.input)} · NP${st.now.np} · Output ${st.now.output}`) : (st.phase ? bi(esc(st.phase.en), esc(st.phase.zh)) : bi("Starting…", "啟動中…"))}</span><small>${pdone} / ${ptot} ${bi("cases done", "組完成")}${!st.now ? " · " + bi("waiting for the first case of this round", "等這一輪的第一個情境") : ""}</small></div>` : "";
    const why = byHand ? "" : (ok && !st.script_ok ? `<p class="rw-msg warn">⚠ ${bi("The matrix script on the machine changed; Start is off.", "機器上的矩陣腳本已被更動，不能開始。")}</p>` : "");
    const btn = ours ? `<button type="button" class="rw-btn kv-stop" data-act="gbstop">${bi("Stop", "停止")}</button>`
      : `<button type="button" class="mw-next" data-act="gbstart"${!ok || busy || G.starting || !st.script_ok ? " disabled" : ""}>${busy ? bi("Running…", "執行中…") : bi("Start", "開始")}</button>`;
    return { title: bi("Weight quantization test", "權重量化測試"), ok: false, next: "", last: true,
      body: `<p class="rw-msg">${bi("One click runs all 12 cases in one server start", "一鍵、一次開機跑完 12 組")}</p>
        ${ok ? "" : `<p class="rw-msg warn">⚠ ${esc((st && st.error) || "Checking the machine… 檢查機器中…")}</p>`}${fold("setup", bi("Test setup", "測試設定"), spec)}
        ${fold("weights", bi("Weight precision", "權重精度（量化）") + `<small class="gb-pick">${esc(wl)}${busy ? " · running" : ""}</small>`, `<div class="mw-opts" role="listbox">${opts}</div>`)}
        <h4 class="kv-h4">${bi("Progress", "進度")}</h4>${nowBox}${bar}${ok ? grid(st) : ""}${why}
        <div class="rw-row kv-act">${btn}</div>${G.msg ? `<p class="rw-msg">${esc(G.msg)}</p>` : ""}
        <div class="rw-row"><a class="rw-btn" href="stress-test-gb10.html">${bi("Open the results", "開啟結果頁")} →</a></div>
        <p class="kv-note">${bi("The log is in the Run log below.", "執行紀錄顯示在下方 Run log。")}</p>` };
  }

  async function load() {
    if (G.loading) return G.status;
    G.loading = true;
    try { const r = await fetch("/api/benchmark/gb10matrix/status", { cache: "no-store" }); G.status = await r.json(); } catch (e) { G.status = { ok: false, error: String(e.message || e) }; }
    G.loading = false; G.at = Date.now();
    const busy = !!(G.status && G.status.busy);
    if (busy) { if (!G.poll) G.poll = setInterval(load, 8000); } else if (G.poll) { clearInterval(G.poll); G.poll = null; }
    G.wasBusy = busy; feed();
    if (G.render) G.render();
    return G.status;
  }
  async function post(path, body) {
    const ticket = await window.RunGate.ticket();      // the one-time test password, same as every other run
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": ticket }, body: JSON.stringify(body || {}) });
    return r.json();
  }
  async function start() {
    if (G.starting) return;
    G.starting = true; G.msg = ""; if (G.render) G.render();
    try { const d = await post("/api/benchmark/gb10matrix/start", { weights: G.weights }); G.msg = d.ok ? d.message : (d.error || "could not start"); if (typeof window.tlog === "function") window.tlog(G.msg, d.ok ? undefined : "err"); } catch (e) { G.msg = String(e.message || e); }
    G.starting = false; await load();
  }
  async function stop() {
    if (!window.confirm("Stop the GB10 matrix started from the platform? 要停止從平台啟動的 GB10 測試嗎？")) return;
    try { const d = await post("/api/benchmark/gb10matrix/stop", {}); G.msg = d.ok ? d.message : (d.error || "could not stop"); } catch (e) { G.msg = String(e.message || e); }
    await load();
  }
  window.GbPanel = {
    init(render) { G.render = render; if (!G.status || Date.now() - G.at > 15000) load(); },
    question, load, start, stop, status() { return G.status; },
    setWeights(w) { if (W[w]) { G.weights = w; if (G.render) G.render(); } },
    attachTerminal() { G.term = true; G.seenLog = null; G.vLast = null; const c = document.getElementById("termClear"); if (c) c.click(); feed(); },
    detachTerminal() { G.term = false; },
    note() { const st = G.status; return st && st.busy ? bi("Running", "執行中") : ""; }
  };
})();
