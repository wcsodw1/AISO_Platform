"use strict";
/* KV cache test panel for the AISO1 run wizard (run-wizard.js draws it as the third kind of test).
   ONE button (David 2026-11-18): it starts the chain script on the machine, which runs every remaining step in order; each step ticks itself when its result exists.
   The log goes to the Run log terminal below, in plain words. Data: /api/benchmark/kvcache/status (read-only). Start / stop: /api/benchmark/kvcache/* with one password per 2 hours.
   The campaign scripts are David's own (benchmark/runners/aiso1_kvcache_*.py); nothing here changes them. */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const NM = { gemma26: "Gemma 4 26B", gemma31: "Gemma 4 31B", laguna: "Laguna XS 2.1", nemotron: "Nemotron 3.5" };
  const STEPNAME = { preflight: ["Preflight", "預檢"], smoke: ["Smoke", "冒煙"], run: ["Run", "正式測試"], run_np2: ["Run NP2", "正式 NP2"], run_np4: ["Run NP4", "正式 NP4"], audit: ["Audit", "核對"], all: ["All steps", "全部步驟"] };
  const DESC = {
    preflight: ["Checks the 4 model files and which KV types this llama.cpp has", "核對模型檔與支援的 KV 型別"],
    smoke: ["Starts every model once per type: which ones really run", "每種精度各啟動一次，看哪些能跑"],
    run: ["Formal test: 3 Inputs × 3 repeats", "正式測試：3 種輸入 × 3 次"],
    run_np2: ["Formal test, 2 users at once", "正式測試，同時 2 人"],
    run_np4: ["Formal test, 4 users at once", "正式測試，同時 4 人"]
  };
  const STAGES = { np1: { label: ["NP1", "並發 1"], steps: ["preflight", "smoke", "run"] }, np24: { label: ["NP2 · NP4", "並發 2、4"], steps: ["preflight", "smoke", "run_np2", "run_np4"] },
    np8fa: { label: ["NP8 · FA on", "並發 8・開 FA"], steps: ["preflight", "smoke", "run"] } };      /* NP8, Flash Attention on, f16 / q8_0 / q4_0 (David 2026-11-18) */
  const npOf = (stage, step) => step === "run" ? (stage === "np8fa" ? "np8" : "np1") : { run_np2: "np2", run_np4: "np4" }[step];
  const K = { stage: "np1", status: null, starting: false, msg: "", poll: null, render: null, wasBusy: false, at: 0, loading: false, session: null, term: false, seenLog: null, seenN: 0, lastLine: "", prevDone: null };
  const camp = (st, stage) => (st && st.stages && st.stages[stage] && st.stages[stage].campaign) || null;
  const stageFile = (c, n) => (c && c.stages && c.stages[n]) || null;

  function done(stage, step) {
    const c = camp(K.status, stage);
    if (!c) return false;
    if (step === "preflight") return true;
    if (step === "smoke") return !!(c.smoke && c.smoke.length && c.smoke.every(r => r.status !== "PENDING"));
    const f = stageFile(c, npOf(stage, step));
    return !!f && (f.status === "COMPLETE" || !(K.status && K.status.busy));      // the script rewrites the stage file after every model: while it runs only COMPLETE counts
  }
  /* the step running now: the newest log says which (for the chain: its last STEP_BEGIN) */
  function current() {
    const st = K.status;
    if (!st || !st.busy || !st.log) return null;
    const m = /platform_kvcache_(np\d+(?:fa)?)_([a-z0-9_]+?)_(\d{8})_(\d{6})/.exec(st.log);
    if (!m) return null;
    let step = m[2];
    if (step === "all") {
      const b = [...(st.tail || [])].reverse().find(l => /^STEP_BEGIN\s/.test(l));
      step = b ? b.split(/\s+/)[1] : (st.tail || []).some(l => /^WAITING/.test(l)) ? "wait" : "preflight";
    }
    return { stage: STAGES[m[1]] ? m[1] : "np24", step };
  }

  /* one raw line of the scripts -> a plain sentence (unknown lines stay as they are) */
  function plain(l) {
    let m;
    if ((m = /^STEP_BEGIN\s+(\S+)/.exec(l))) return `▶ ${(STEPNAME[m[1]] || [m[1]])[0]} started · ${(STEPNAME[m[1]] || ["", ""])[1]}開始`;
    if ((m = /^STEP_END\s+(\S+)\s+rc=(\d+)/.exec(l))) return m[2] === "0" ? `✓ ${(STEPNAME[m[1]] || [m[1]])[0]} done · ${(STEPNAME[m[1]] || ["", ""])[1]}完成` : `✗ ${(STEPNAME[m[1]] || [m[1]])[0]} stopped with an error (code ${m[2]}) · 出錯停止`;
    if ((m = /^STEP_SKIP\s+(\S+)/.exec(l))) return `✓ ${(STEPNAME[m[1]] || [m[1]])[0]} already done, skipped · 已完成，略過`;
    if (/^WAITING/.test(l)) return "Waiting for the step that is already running · 等待正在跑的步驟結束";
    if (/^ALL_DONE/.test(l)) return "✓ All steps done. Opening the report. · 全部完成，開啟報告";
    if (/^STEP_STOPPED/.test(l)) return "■ Stopped · 已停止";
    if ((m = /^HASHING\s+(\S+)/.exec(l))) return `Checking the model file of ${NM[m[1]] || m[1]} · 核對模型檔`;
    if ((m = /^PREFLIGHT_OK\s+\S+\s+KV_TYPES\s+(.*)$/.exec(l))) return `✓ Preflight OK · KV types on this machine: ${m[1].replace(/[\[\]']/g, "")}`;
    if ((m = /^KV_SMOKE\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l))) return `${m[3] === "PASS" ? "✓" : "✗"} Smoke · ${m[1]} · ${NM[m[2]] || m[2]} → ${m[3]}`;
    if (/^KV_SMOKE_CSV/.test(l)) return "Smoke table saved · 冒煙結果已存檔";
    if ((m = /^FORMAL_(PASS|FAIL|TIMEOUT)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(l))) return `${m[1] === "PASS" ? "✓" : "✗ " + m[1]} Run · ${m[2]} · ${NM[m[3]] || m[3]} · NP${m[4]} · Input ${m[5]} · repeat ${m[6]}/3`;
    if ((m = /^SKIP_SMOKE_NOT_PASS\s+(\S+)\s+(\S+)/.exec(l))) return `Skipped ${m[1]} · ${NM[m[2]] || m[2]} (did not pass the smoke) · 冒煙未過，略過`;
    if ((m = /^NP_STAGE\s+(\d+)\s+(\d+)\s+\/\s+(\d+)/.exec(l))) return `NP${m[1]}: ${m[2]} of ${m[3]} cases complete · 已完成`;
    if ((m = /^LOADING:\s+(\S+)/.exec(l))) return `Loading ${NM[m[1]] || m[1]} (starting the model server) · 載入模型中`;
    if (/^CAMPAIGN\s/.test(l)) return "Campaign opened · 開始";
    if (/^LOAD_OR_WAVE_FAIL/.test(l)) return "✗ The model server or a wave failed (kept as evidence) · 失敗，已保留證據";
    if (/^(NP1_COMPARABLE|KV_VERIFIED_COMPLETE_CASES)/.test(l)) return l;
    return l;
  }
  /* "Now" line with counts */
  /* "Now" line: done / total = percent (David 2026-11-18: 50/75 = 66.7%) */
  const frac = (d, t) => (t ? `${d}/${t} = ${(100 * d / t).toFixed(1)}%` : `${d}`);
  function nowLine() {
    const st = K.status, cur = current();
    if (!cur) return "";
    const c = camp(st, cur.stage) || {}, types = (c.kv_types || []).length, cnt = (st.progress || {}).counts || {};
    if (cur.step === "wait") return "Waiting for the step that is already running · 等待正在跑的步驟";
    if (cur.step === "preflight") { const n = Math.max(1, (st.tail || []).filter(l => /^HASHING\s/.test(l)).length); return `Preflight: model file ${frac(n, 4)} · 預檢：模型檔 ${frac(n, 4)}`; }
    if (cur.step === "smoke") { const t = types * 4; return `Smoke: ${frac(cnt.smoke || 0, t)} · ${cnt.smoke_pass || 0} pass · 冒煙：${frac(cnt.smoke || 0, t)}，通過 ${cnt.smoke_pass || 0}`; }
    /* run: every (type, model) that passed the smoke x 3 Inputs x 3 repeats; done = the larger of the log count and the repeats already in the result table */
    const pairs = (c.smoke || []).filter(r => r.status === "PASS").length, total = pairs * 3 * 3;
    const np = npOf(cur.stage, cur.step) || "np1";
    const inTable = ((c.results || {})[np] || []).reduce((s, r) => s + String(r.verified_repeats || "").split(",").filter(Boolean).length, 0);
    const done = Math.min(total || Infinity, Math.max(cnt.formal_pass || 0, inTable));
    return `Run: ${frac(done, total)} repeats passed${cnt.formal_other ? ` · ${cnt.formal_other} failed` : ""} · 正式測試：${frac(done, total)}`;
  }

  /* the log goes to the Run log terminal of the page (benchmark-app.js tlog), only the new lines */
  function feed() {
    const st = K.status;
    if (!K.term || typeof window.tlog !== "function" || !st || !st.ok) return;
    window.__rwBusy = !!st.busy; const ts = document.getElementById("termState"); if (ts) ts.textContent = st.busy ? "running" : "idle";
    if (!st.log) return;
    const tail = st.tail || [], total = st.log_lines || tail.length;
    if (st.log !== K.seenLog) {
      K.seenLog = st.log; K.seenN = Math.max(0, total - Math.min(tail.length, 40)); K.lastLine = "";
      const m = /platform_kvcache_(np\d+(?:fa)?)_([a-z0-9_]+?)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(st.log);
      window.tlog(m ? `── KV cache · ${m[1].toUpperCase()} · ${(STEPNAME[m[2]] || [m[2]])[0]} · ${m[6]}:${m[7]}:${m[8]} ──` : "── KV cache ──");
    }
    const n = total - K.seenN;
    if (n <= 0) return;
    tail.slice(-Math.min(n, tail.length)).map(plain).forEach(l => { if (l && l !== K.lastLine) { K.lastLine = l; window.tlog(l, /^✗|Traceback|Error/.test(l) ? "err" : undefined); } });
    K.seenN = total;
  }

  /* where the test is: one cell per (precision, model) with its repeats done of 9 (3 Inputs x 3 repeats); the cell being worked on pulses */
  function whereHtml(stage) {
    const st = K.status, c = camp(st, stage); if (!c || !(c.smoke || []).length) return "";
    const by = (st.progress || {}).by_case || {}, npl = (NPS[stage] || [1]).map(String), per = 9 * npl.length;
    const ok = (c.smoke || []).filter(r => r.status === "PASS"), kvs = [...new Set(ok.map(r => r.kv_cache_k))], models = Object.keys(NM);
    if (!kvs.length) return "";
    const cur = current(), last = [...(st.tail || [])].reverse().find(l => /^FORMAL_/.test(l)), lf = last && last.split(/\s+/);
    const cell = (kv, m) => {
      if (!ok.some(r => r.kv_cache_k === kv && r.model === m)) return `<td class="kv-na">—</td>`;
      const n = npl.reduce((s, np) => s + (by[kv + "|" + m + "|" + np] || 0), 0), done = n >= per, now = !done && cur && lf && lf[1] === kv && lf[2] === m || (!done && n > 0 && st.busy);
      return `<td class="${done ? "kv-ok" : n ? "kv-part" : "kv-wait"}${now && !done ? " kv-cur" : ""}"><b>${done ? "✓" : n + "/" + per}</b><i style="width:${Math.min(100, Math.round(100 * n / per))}%"></i></td>`;
    };
    return `<div class="kv-where"><p class="kv-note">${bi("Where it is · repeats done per cell (3 Inputs × 3 repeats" + ((NPS[stage] || []).length > 1 ? " × 2 NP" : "") + ")", "測到哪 · 每格完成的重複次數")}</p><div class="kv-wrap"><table class="kv-tab"><thead><tr><th>KV</th>${models.map(m => `<th>${esc(NM[m])}</th>`).join("")}</tr></thead><tbody>${kvs.map(kv => `<tr><th>${esc(kv)}</th>${models.map(m => cell(kv, m)).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }

  /* WHAT is tested and HOW FAR (David 2026-11-18: 「看不出來測什麼測到哪」): the spec of the stage, then for every step a concrete line with done / total = percent */
  const NPS = { np1: [1], np24: [2, 4], np8fa: [8] };
  const pc = (d, t) => (t ? `${d}/${t} = ${(100 * d / t).toFixed(1)}%` : `${d}`);
  function specHtml(stage) {
    const c = camp(K.status, stage) || {}, types = c.kv_types || [], nps = NPS[stage] || [];
    const row = (a, b) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`;
    return `<dl class="rw-sum kv-spec">${row("Test", "KV cache precision, K = V · same machine and settings, f16 is the baseline")}${row("Machine", "AISO1 · llama.cpp (Vulkan)")}${row("Models", Object.values(NM).join(" · "))}${row("KV types", types.length ? types.join(" · ") : "found by the preflight")}${row("Concurrency", "NP " + nps.join(" / "))}${row("Flash Attention", stage === "np8fa" ? "on" : "off (as the original AISO1 F16 results)")}${row("Load", "Input 4K / 8K / 16K × 3 repeats · Output 1024")}</dl>`;
  }
  function stepInfo(stage, id) {
    const st = K.status, c = camp(st, stage) || {}, cur = current(), isCur = cur && cur.stage === stage && cur.step === id, cnt = (st.progress || {}).counts || {};
    const types = (c.kv_types || []).length, nps = NPS[stage].length, ok = (c.smoke || []).filter(r => r.status === "PASS").length;
    if (id === "preflight") { const n = (st.tail || []).filter(l => /^HASHING\s/.test(l)).length; return { detail: `Check the 4 model files and the KV types this llama.cpp has · 核對 4 個模型檔與支援的型別${types ? ` → ${types} types` : ""}`, prog: isCur ? [Math.max(1, n), 4] : null }; }
    if (id === "smoke") {
      const t = types * 4, d = (c.smoke || []).filter(r => r.status !== "PENDING").length;
      return { detail: `Start every model once per type: ${types || "?"} types × 4 models = ${t || "?"} starts · 每種精度各啟動一次`, prog: t ? [isCur ? (cnt.smoke || 0) : d, t] : null, extra: t && (c.smoke || []).length ? `${ok} start / ${d - ok} do not · ${ok} 組能啟動` : "" };
    }
    const np = npOf(stage, id), total = ok * 3 * 3 * (stage === "np24" ? 1 : 1), by = (st.progress || {}).by_case || {};
    const byNp = Object.entries(by).filter(([key]) => key.endsWith("|" + String(np).replace("np", ""))).reduce((s, [, v]) => s + v, 0);
    const f = (c.stages || {})[np], d = isCur ? byNp : f ? (f.completed_cases || 0) * 3 : 0;
    return { detail: `${ok || "?"} type × model pairs × 3 Inputs × 3 repeats${stage === "np24" ? " at NP" + np.replace("np", "") : ""} = ${total || "?"} repeats · 正式測試`, prog: total ? [Math.min(total, d), total] : null };
  }

  function question() {
    const st = K.status, s = STAGES[K.stage], cur = current();
    const busy = !!(st && st.busy), ext = !!(st && st.external), bad = !st ? "Checking the machine… 檢查機器中…" : !st.ok ? (st.error || "no answer") : "";
    const np1Done = done("np1", "run");
    const tabs = `<div class="rw-row kv-tabs">${Object.keys(STAGES).map(k => `<button type="button" class="rw-btn${k === K.stage ? " sel" : ""}" data-act="kvstage" data-stage="${k}">${bi(STAGES[k].label[0], STAGES[k].label[1])}</button>`).join("")}</div>`;
    const steps = s.steps.map((id, i) => {
      const ok = st && st.ok && done(K.stage, id), now = cur && cur.stage === K.stage && cur.step === id, info = st && st.ok ? stepInfo(K.stage, id) : { detail: "", prog: null };
      const mark = ok ? `<span class="kv-n ok" aria-label="done">✓</span>` : now ? `<span class="kv-n now"><i class="kv-dot on"></i></span>` : `<span class="kv-n">${i + 1}</span>`;
      const pr = info.prog && (now || ok) ? (ok ? [info.prog[1], info.prog[1]] : info.prog) : null;
      const state = ok ? `<em class="rw-st done">${bi("Done", "完成")}</em>` : now ? `<em class="rw-st prog">${bi("Running", "執行中")}</em>` : `<em class="rw-st wait">${bi("To do", "待測")}</em>`;
      const bar = pr ? `<span class="kv-bar"><i style="width:${Math.min(100, Math.round(100 * pr[0] / pr[1]))}%"></i></span><span class="kv-pc">${esc(pc(pr[0], pr[1]))}${info.extra && ok ? " · " + esc(info.extra) : ""}</span>` : "";
      return `<li class="kv-step${ok ? " is-done" : now ? " is-now" : ""}">${mark}<div class="kv-t"><b>${bi(STEPNAME[id][0], STEPNAME[id][1])}</b><span class="kv-desc">${esc(info.detail)}</span>${bar}</div>${state}</li>`;
    }).join("");
    const allDone = s.steps.every(id => st && st.ok && done(K.stage, id));
    const locked = K.stage === "np24" && !np1Done;
    const why = ext ? bi("The machine is in use by other work. Start is off until it is free.", "機器正被其他工作使用，空閒前不能開始。") : locked ? bi("Finish NP1 first.", "請先完成 NP1。") : "";
    const chainOn = !!(st && st.chain);
    const btn = busy && chainOn
      ? `<button type="button" class="rw-btn kv-stop" data-act="kvstop">${bi("Stop", "停止")}</button>`
      : `<button type="button" class="mw-next" data-act="kvstart" data-stage="${K.stage}" data-step="all"${!st || !st.ok || ext || locked || K.starting ? " disabled" : ""}>${allDone ? bi("Run again (only what is missing)", "再跑一次（只補沒完成的）") : busy ? bi("Start: continue after the running step", "開始：接在目前步驟之後全部跑完") : bi("Start", "開始")}</button>${busy ? `<button type="button" class="rw-btn kv-stop" data-act="kvstop">${bi("Stop", "停止")}</button>` : ""}`;
    const now = nowLine();
    return { title: bi("KV cache test", "KV cache 測試"), ok: false, next: "", last: true,
      body: `<p class="rw-msg">${bi("K = V cache precision · 4 models · one click runs every step", "K＝V 快取精度 · 4 個模型 · 一鍵跑完所有步驟")}</p>
        ${tabs}${bad ? `<p class="rw-msg warn">⚠ ${esc(bad)}</p>` : ""}${st && st.ok ? specHtml(K.stage) : ""}<h4 class="kv-h4">${bi("Progress", "進度")}</h4><ol class="kv-steps">${steps}</ol>
        ${now ? `<p class="kv-now">${esc(now)}</p>` : ""}${whereHtml(K.stage)}${why ? `<p class="rw-msg warn">⚠ ${why}</p>` : ""}
        <div class="rw-row kv-act">${btn}</div>${K.msg ? `<p class="rw-msg">${esc(K.msg)}</p>` : ""}
        ${allDone || camp(st, K.stage) ? `<div class="rw-row"><a class="rw-btn" href="stress-test-aiso1.html#kv">${bi("Open the report", "開啟報告")} →</a></div>` : ""}
        <p class="kv-note">${bi("The log is in the Run log below.", "執行紀錄顯示在下方 Run log。")}</p>` };
  }

  async function load() {
    if (K.loading) return K.status;
    K.loading = true;
    try { const r = await fetch("/api/benchmark/kvcache/status", { cache: "no-store" }); K.status = await r.json(); } catch (e) { K.status = { ok: false, error: String(e.message || e) }; }
    K.loading = false; K.at = Date.now();
    const busy = !!(K.status && K.status.busy);
    { const c = current(); if (c && !K.picked && STAGES[c.stage]) K.stage = c.stage; }      /* a run is going: show ITS tab (NP8 · FA on), not NP1, until the user picks a tab */
    if (busy) { if (!K.poll) K.poll = setInterval(load, 5000); } else if (K.poll) { clearInterval(K.poll); K.poll = null; }
    /* a formal run finished while this page was open: the report is built from the machine's files and opened */
    const doneNow = [["np1", "run"], ["np24", "run_np2"], ["np24", "run_np4"], ["np8fa", "run"]].filter(([g, s]) => done(g, s)).map(([g, s]) => g + ":" + s).join(",");
    const newly = doneNow.split(",").filter(x => x && !(K.prevDone || "").split(",").includes(x));
    if (K.wasBusy && !busy && K.prevDone !== null && newly.length) {
      K.msg = "Run finished - opening the report. 測試完成，開啟報告。";
            setTimeout(() => { location.href = "stress-test-aiso1.html#kv"; }, 2500);
    }
    K.prevDone = doneNow; K.wasBusy = busy;
    feed();
    if (K.render) K.render();
    return K.status;
  }
  /* one password for the whole sequence (David 2026-11-18): a session token (2 hours, memory only, valid only for the KV cache requests) */
  async function post(path, body, retry) {
    if (!K.session || K.session.exp < Date.now()) {
      await window.RunGate.ticket("kvcache");
      const d = window.RunGate.last || {};
      K.session = { token: d.ticket, exp: Date.now() + (d.expires_in || 0) * 1000 - 30000 };
    }
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": K.session.token }, body: JSON.stringify(body || {}) });
    if (r.status === 401 && !retry) { K.session = null; return post(path, body, true); }       // expired or the launcher restarted: ask once more
    return r.json();
  }
  async function start(stage, step) {
    if (K.starting) return;
    K.starting = true; K.msg = ""; if (K.render) K.render();
    try { const d = await post("/api/benchmark/kvcache/start", { stage, step: step || "all" }); K.msg = d.ok ? d.message : (d.error || "could not start"); if (typeof window.tlog === "function") window.tlog(K.msg, d.ok ? undefined : "err"); } catch (e) { K.msg = String(e.message || e); }
    K.starting = false;
    await load();
  }
  async function stop() {
    if (!window.confirm("Stop the KV cache test? 要停止 KV cache 測試嗎？")) return;
    try { const d = await post("/api/benchmark/kvcache/stop", {}); K.msg = d.ok ? d.message : (d.error || "could not stop"); } catch (e) { K.msg = String(e.message || e); }
    await load();
  }
  window.KvPanel = {
    init(render) { K.render = render; if (!K.status || Date.now() - K.at > 15000) load(); },      // the machine changes while the page is open: never show an old answer for long
    question, load,
    attachTerminal() { K.term = true; K.seenLog = null; const c = document.getElementById("termClear"); if (c) c.click(); feed(); },
    detachTerminal() { K.term = false; },
    setStage(s) { if (STAGES[s]) { K.stage = s; K.picked = true; if (K.render) K.render(); } },
    start, stop,
    note() { const st = K.status; return st && st.busy ? bi("Running", "執行中") : ""; }
  };
})();
