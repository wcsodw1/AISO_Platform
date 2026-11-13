"use strict";
/* Run wizard for benchmark.html — same configurator pattern as the Benchmark hub (preview stage on the left, ONE question on the right).
   It does not own any logic: every choice is written into the existing (now hidden) controls of benchmark-app.js and a change event is dispatched,
   and every action clicks the existing button (so the password gate, Connect, Discover, Start, Stop and Terminal all keep working unchanged). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const STEPS = [["engine", "Inference engine", "推論引擎"], ["model", "Model", "模型"], ["test", "Test type", "測試方式"], ["load", "Workload", "工作負載"], ["run", "Run", "開始"]];
  const STEPS_EXEC = [["engine", "Inference engine", "推論引擎"], ["model", "Models", "模型"], ["run", "Run", "開始"]];
  const EXEC = { kind: "smoke", on: false, machine: null, models: [], version: "", device: "", status: null, timer: null, msg: "", unavailable: false };
  const S = () => (EXEC.on || (typeof HUBCARD !== "undefined" && HUBCARD[machineId()]) ? STEPS_EXEC : STEPS);      // these machines never fall back to the old five-step flow
  const st = { step: 0 };
  let root, connectHome = null;

  const opts = sel => (sel ? [...sel.options] : []).map(o => ({ v: o.value, t: o.textContent }));
  const setVal = (id, v) => { const e = $(id); if (!e) return; e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  const visible = e => !!e && e.style.display !== "none" && !e.closest("[hidden]");

  function parkConnect() {            // the existing "connect with token" row is moved into the wizard while needed, and parked back before every re-render
    const c = $("liveConnect");
    if (c && connectHome && c.parentNode !== connectHome.parent) connectHome.parent.insertBefore(c, connectHome.next);
  }
  const termIds = ["termPanel", "aisoTermRun"], termHome = {};
  function parkTerm() {              // the run log (#termPanel) and the real shell (#aisoTermRun) are moved into the Run step, and parked back before every re-render
    termIds.forEach(id => { const n = $(id), h = termHome[id]; if (n && h && n.parentNode !== h.parent) h.parent.insertBefore(n, h.next); });
  }
  function opt(id, left, right, sel, off) {
    return `<button type="button" class="mw-opt${sel ? " sel" : ""}${off ? " off" : ""}" data-id="${esc(id)}"${off ? ' aria-disabled="true"' : ""}><span class="mw-l">${left}</span><span class="mw-r">${right || ""}</span></button>`;
  }
  const mode = () => ($("liveMode") && $("liveMode").value) || "single";
  const canSweep = () => visible($("liveModeRow"));
  const engine = () => { if (EXEC.on && EXEC.framework) return EXEC.framework; const s = $("frameworkSelect"); const o = s && s.options[s.selectedIndex]; return o ? o.textContent.split(" — ")[0] : ""; };
  const modelName = () => { const m = $("liveModel"); const o = m && m.options[m.selectedIndex]; return o && o.value ? o.textContent : ""; };
  const ready = () => !!$("liveStart") && !$("liveStart").classList.contains("is-idle");

  // test parameters: every one has a default and can be changed by hand inside the limits the machine allows (a fixed one is set by the machine's own protocol)
  const PNAME = { np: ["NP", "並發"], input: ["Input tokens", "輸入長度"], output: ["Output tokens", "輸出長度"], repeat: ["Repeats", "重複次數"], inputs: ["Input tokens", "輸入長度"], nps: ["NP", "並發"], repeats: ["Repeats", "重複次數"] };
  function resetParams() {
    const sp = EXEC.spec || {};
    EXEC.params = {}; Object.keys(sp).forEach(k => { EXEC.params[k] = sp[k].default; });
    const sd = EXEC.stdspec;
    EXEC.std = sd ? { inputs: sd.inputs.default.join(", "), nps: sd.nps.default.join(", "), output: sd.output.default, repeats: sd.repeats.default } : {};
  }
  const pval = k => (EXEC.params && EXEC.params[k] != null ? EXEC.params[k] : (EXEC.spec[k] || {}).default);
  const smokeLine = () => { const sp = EXEC.spec; return sp ? `Smoke · NP${pval("np")} · input ${pval("input")} · output ${pval("output")} · ×${pval("repeat")}` : "Smoke"; };
  // parameters are folded away: a one-line "Default" bar; pointing at it (or a click, which pins it) drops the list down. Untouched = the default of this machine's scale.
  const TIERN = { consumer: ["Consumer", "消費級"], "mini-workstation": ["Mini-workstation", "迷你工作站"], server: ["Server", "伺服器"] };
  function pdd(same, summary, fields) {
    const t = TIERN[EXEC.tier];
    const val = same ? `${bi("Default", "預設")}${t ? `<small class="rw-tier">${t[0]} · ${t[1]}</small>` : ""}` : `${bi("Custom", "自訂")}<small class="rw-tier">${esc(summary)}</small>`;
    return `<div class="rw-pdd${EXEC.pdOpen ? " open" : ""}"><button type="button" class="rw-pdd-h" data-act="epdd" aria-expanded="${!!EXEC.pdOpen}"><span class="rw-pdd-t">${bi("Parameters", "測試參數")}</span><span class="rw-pdd-v">${val}</span><i aria-hidden="true">▾</i></button>
      <div class="rw-pdd-b">${fields}${same ? "" : `<div class="rw-row"><button type="button" class="rw-reset" data-act="eparamreset">${bi("Reset to default", "還原預設")}</button></div>`}</div></div>`;
  }
  // standard test: lists of Input and NP (comma separated), Output, Repeats - defaults from the machine, editable inside its limits (checked again on the server)
  function stdParamsHtml() {
    const sd = EXEC.stdspec; if (!sd || !EXEC.std) return "";
    const same = ["inputs", "nps"].every(k => EXEC.std[k] === sd[k].default.join(", ")) && +EXEC.std.repeats === sd.repeats.default && +EXEC.std.output === sd.output.default;
    const field = (k, list) => { const x = sd[k], fixed = !!x.fixed;
      const hint = fixed ? bi("fixed by the machine protocol", "由機器協定固定") : list ? `default ${esc(x.default.join(", "))} · ${x.min}–${x.max} · max ${x.count}` : `default ${x.default} · ${x.min}–${x.max}`;
      return `<label class="rw-pf"><span>${PNAME[k][0]}<small class="zhs">${PNAME[k][1]}</small></span><input ${list ? 'type="text"' : 'type="number"'} data-p="standard:${k}" value="${esc(EXEC.std[k])}"${fixed ? " disabled" : ""}${!list && !fixed ? ` min="${x.min}" max="${x.max}" step="1"` : ""}><em>${hint}</em></label>`; };
    return pdd(same, `${EXEC.std.inputs} × NP ${EXEC.std.nps} × ${EXEC.std.repeats}`, field("inputs", true) + field("nps", true) + field("output", false) + field("repeats", false));
  }
  const toList = t => String(t).split(/[,\s]+/).filter(Boolean).map(Number);
  const stdParams = () => { const sd = EXEC.stdspec, p = { inputs: toList(EXEC.std.inputs), nps: toList(EXEC.std.nps), repeats: Number(EXEC.std.repeats) }; if (sd && !sd.output.fixed) p.output = Number(EXEC.std.output); return p; };
  const stdCases = () => { const p = stdParams(), n = (EXEC.pick || "all") === "all" ? EXEC.models.length : 1; return n * p.inputs.length * p.nps.length * p.repeats; };
  function paramsHtml(kind) {
    if (kind === "standard") return stdParamsHtml();
    const sp = EXEC.spec; if (!sp) return "";
    const same = kind === "smoke" ? Object.keys(sp).every(k => pval(k) === sp[k].default) : (EXEC.std.input === "4096, 8192, 16384" && EXEC.std.np === "1, 2, 4" && +EXEC.std.repeat === 3 && +EXEC.std.output === sp.output.default);
    const field = k => {
      const n = PNAME[k], x = sp[k], fixed = !!x.fixed;
      const isList = kind === "standard" && (k === "input" || k === "np");
      const val = kind === "smoke" ? pval(k) : EXEC.std[k];
      const hint = fixed ? bi("fixed by the machine protocol", "由機器協定固定") : isList ? `default ${esc(k === "input" ? "4096, 8192, 16384" : "1, 2, 4")}` : `default ${x.default} · ${x.min}–${x.max}`;
      return `<label class="rw-pf"><span>${n[0]}<small class="zhs">${n[1]}</small></span><input ${isList ? 'type="text"' : 'type="number"'} data-p="${kind}:${k}" value="${esc(val)}"${fixed ? " disabled" : ""}${!isList && !fixed ? ` min="${x.min}" max="${x.max}" step="1"` : ""}><em>${hint}</em></label>`;
    };
    return pdd(same, `NP${pval("np")} · ${pval("input")} in · ${pval("output")} out · ×${pval("repeat")}`, ["np", "input", "output", "repeat"].map(field).join(""));
  }
  // left side, EXEC machines: the two kinds of test as Step 1 / Step 2 (click to choose what the right panel shows)
  function stdNote() {
    const s = EXEC.status || {}, sl = s.standard_last || {};
    if (s.busy && s.kind === "standard") return bi("Running", "測試中");
    const n = (sl.cases || []).length;
    return n ? `${n} cases` : "";
  }
  function kindsHtml() {
    if (!EXEC.on) return "";
    const m = mergedOf(EXEC.status || {}), ids = Object.keys(m), pass = ids.filter(k => m[k].state === "pass").length;
    const k = (kind, n, en, zh, note) => `<li><button type="button" class="rw-kind${EXEC.kind === kind ? " sel" : ""}" data-act="ekind" data-kind="${kind}"><span class="rw-kn">Step ${n}</span><b>${en}<small class="zhs">${zh}</small></b><em>${note}</em></button></li>`;
    return `<ol class="rw-kinds">${k("smoke", 1, "Smoke Test", "冒煙測試", ids.length ? `${pass}/${ids.length} PASS` : "")}${k("standard", 2, "Standard Test", "標準測試", stdNote())}</ol>`;
  }
  // same wording as machine-picker.js on the hub (kept in step by hand: two machines)
  const HUBCARD = {
    pro6000: { vendor: "NVIDIA", tier: ["Server", "伺服器"], name: "RTX PRO 6000", spec: "8 × RTX PRO 6000 Blackwell · 96 GB / GPU" },
    aiso1: { vendor: "AMD", tier: ["Mini-workstation", "迷你工作站"], name: "AISO1 · AI MAX+ 395", spec: "Ryzen AI Max+ 395 · Radeon iGPU" }
  };
  function stage() {
    const name = ($("selectedUnitTitle") && $("selectedUnitTitle").textContent.trim()) || "";
    const tier = ($("unitTier") && $("unitTier").textContent.trim()) || "";
    const badge = ($("accessBadge") && $("accessBadge").textContent.trim()) || "";
    const card = $("machineCard") ? $("machineCard").querySelector("small") : null;
    const engChip = engine() ? `<span class="mw-chip">${esc(engine())}</span>` : "", mdlChip = modelName() ? `<span class="mw-chip">${esc(modelName())}</span>` : "";
    const hub = HUBCARD[machineId()];
    if (hub) {      // the same left side as the Benchmark hub (vendor · scale, name, spec, chips), so going from one screen to the next only changes the right side; the first chip is the machine state instead of "Online"
      const busy = EXEC.status && EXEC.status.busy;
      const state = !EXEC.on && !EXEC.loading ? `<span class="mw-chip off">${bi("● Not loaded", "未載入")}</span>` : !EXEC.status ? `<span class="mw-chip wait">${bi("● Checking", "檢查中")}</span>` : busy ? `<span class="mw-chip busy">${bi("● Busy", "忙碌中")}</span>` : EXEC.status.external ? `<span class="mw-chip busy">${bi("● In use by others", "他人使用中")}</span>` : `<span class="mw-chip on">${bi("● Idle", "閒置")}</span>`;
      return `<p class="mw-kicker">${esc(hub.vendor)} · ${bi(hub.tier[0], hub.tier[1])}</p><h2 class="mw-big">${esc(hub.name)}</h2><p class="mw-spec">${esc(hub.spec)}</p>
      <div class="mw-chips">${state}${engChip}${EXEC.needLocal ? `<span class="mw-chip off">${bi("View only", "僅檢視")}</span>` : ""}</div>${kindsHtml()}`;
    }
    return `<p class="mw-kicker">${bi("Run benchmark", "實測")}${tier ? " · " + esc(tier) : ""}</p><div class="rw-namerow"><h2 class="mw-big">${esc(name)}</h2></div>
      <p class="mw-spec">${esc(card ? card.textContent : "")}</p>
      <div class="mw-chips"><span class="mw-chip ${/LOCAL ADMIN/.test(badge) ? "on" : "off"}">${esc(badge || "—")}</span>${engChip}${mdlChip}</div>`;
  }

  function question() {
    const id = S()[st.step][0];
    if (!EXEC.on && !EXEC.loading && HUBCARD[machineId()]) {     // the executor did not answer: say so, instead of showing the old "Detect models" flow that cannot work here
      const base = machineId(), other = EXEC.execId && EXEC.execId !== base;
      const why = EXEC.needLocal ? `${bi("Tests can only be started from the local page. Open", "測試只能從本機頁面啟動，請改開")} <a href="${esc("http://localhost:8765/benchmark.html" + location.hash)}">localhost:8765</a>` : esc(EXEC.msg || "") || bi("The platform did not get an answer from this machine's test service. If the platform was just updated, restart the server.", "平台沒有收到這台機器測試服務的回應；若剛更新過平台，請重啟伺服器。");
      return { title: bi("Cannot load this machine", "無法載入這台機器"), ok: false, auto: true, next: "",
        body: `<p class="rw-msg warn">⚠ ${why}</p><div class="rw-row"><button type="button" class="rw-btn" data-act="eretry">${bi("Try again", "重試")}</button>${other ? `<button type="button" class="rw-btn" data-act="ebase">${bi("Back to the first engine", "回到第一個引擎")}</button>` : ""}</div>` };
    }
    if (EXEC.loading && !EXEC.on) return { title: bi("Checking the machine…", "檢查機器中…"), ok: false, auto: true, next: "", body: `<p class="rw-msg">${bi("Asking the machine for its models. A few seconds.", "向機器詢問可用模型，需要幾秒。")}</p>` };
    if (EXEC.on && id === "model") {
      const pick = EXEC.pick || "all";
      return { title: bi("Which model to test?", "要測哪個模型？"), ok: true, auto: true, next: "",
        body: opt("xm:all", `<b>${bi("All models", "全部模型")}</b>`, "", pick === "all") +
          EXEC.models.map(m => opt("xm:" + m.id, `<b>${esc(m.id)}</b>`, esc(specText(m.id)), pick === m.id)).join("") };
    }
    if (EXEC.on && id === "run" && EXEC.kind === "standard") {
      const s = EXEC.status || {}, busyNow = !!s.busy, f = EXEC.formal || [], total = f.reduce((a, r) => a + r.n, 0), pr = stdParams(), n = stdCases();
      const row = (k, v) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`;
      const page = ({ aiso1: "stress-test-aiso1.html", pro6000: "stress-test-pro6000.html" })[baseOf(EXEC.machine)] || "stress-test-compare.html";
      const bad = s.external ? "The GPU is in use by other work on this shared machine - start is off until it is free." : !EXEC.stdspec ? "This engine has no standard test yet - only the smoke test (the comparison models are not on this machine)." : !(n > 0) ? "Check the Input / NP lists." : "";
      return { title: bi("Standard test", "標準測試"), ok: false, next: "", last: true,
        body: `<dl class="rw-sum">${row("Machine", ($("selectedUnitTitle") || {}).textContent || EXEC.machine)}${row("Models", (EXEC.pick || "all") === "all" ? EXEC.models.map(m => m.id).join(", ") : EXEC.pick)}${EXEC.stdspec ? row("Test", `Standard · Input ${pr.inputs.join("/")} × NP ${pr.nps.join("/")} × ${pr.repeats}`) + row("Cases", isFinite(n) ? String(n) : "—") : row("Test", "Smoke only on this engine")}${row("On the platform", total + " conditions" + (f.length ? " (" + f.map(r => r.framework + " " + r.n).join(", ") + ")" : ""))}</dl>
          ${busyNow ? benchHtml() + `<div class="rw-row"><button type="button" class="rw-btn" data-act="estop">${bi("Stop", "停止")}</button></div>` : (EXEC.stdspec ? stdParamsHtml() + `<div class="rw-row"><button type="button" class="mw-next" data-act="estandard"${bad ? " disabled" : ""}>${bi("Start standard test", "開始標準測試")}</button></div>` : "") + `${bad ? `<p class="rw-msg warn">${esc(bad)}</p>` : `<p class="rw-msg">${bi("Runs in the background on the machine and can take hours. Results stay on the machine until they are added to the platform data.", "在機器上背景執行，可能要數小時；結果先留在機器上，之後才匯入平台資料。")}</p>`}`}
          ${s.kind === "standard" ? progressHtml(s) : ""}
          <div class="rw-row"><a class="rw-btn" href="${page}">${bi("Open the result page", "開啟結果頁")} →</a></div>` };
    }
    if (EXEC.on && id === "run") {
      const s = EXEC.status || {}, busyNow = !!s.busy;
      const row = (k, v) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`;
      return { title: bi("Smoke test", "冒煙測試"), ok: false, next: "", last: true,
        body: `<dl class="rw-sum">${row("Machine", ($("selectedUnitTitle") || {}).textContent || EXEC.machine)}${row("Models", (EXEC.pick || "all") === "all" ? EXEC.models.map(m => m.id).join(", ") : EXEC.pick)}${row("Test", smokeLine())}</dl>
          ${busyNow ? "" : paramsHtml("smoke")}
          ${busyNow ? benchHtml() + `<div class="rw-row"><button type="button" class="rw-btn" data-act="estop">${bi("Stop", "停止")}</button></div>` : `<div class="rw-row"><button type="button" class="mw-next" data-act="esmoke"${s.external ? " disabled" : ""}>${bi("Start smoke test", "開始冒煙測試")}</button></div>${s.external ? `<p class="rw-msg warn">${bi("The GPU is in use by other work on this shared machine, not by a platform test. Start is off until it is free.", "共用機器上的 GPU 正被其他工作使用（不是平台測試），空出後才能開始。")}</p>` : ""}`}
          ${s.kind === "standard" ? "" : progressHtml(s)}` };
    }
    if (id === "engine") {
      const s = $("frameworkSelect"), list = opts(s);
      const localUrl = "http://localhost:8765/benchmark.html" + location.hash;
      const localNote = EXEC.needLocal ? `<p class="rw-msg warn">⚠ ${bi("Tests can only be started from the local page. Open", "測試只能從本機頁面啟動，請改開")} <a href="${esc(localUrl)}">localhost:8765</a></p>` : "";
      const notice = localNote || (EXEC.unavailable ? `<p class="rw-msg warn">⚠ ${bi("The platform smoke test is not loaded. Stop the local server (Ctrl+C in the make run window) and start it again.", "平台冒煙測試還沒載入：請把本機伺服器（make run 的視窗）按 Ctrl+C 停掉，再啟動一次。")}</p>` : "");
      return { auto: true, title: bi("Choose an inference engine", "選擇推論引擎"), ok: list.length > 0 && !!s.value, next: bi("Next", "下一步"),
        body: notice + (list.length ? list.map(o => { const [n, status] = o.t.split(" — "), norm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ""), mine = EXEC.on && norm(n) === norm(EXEC.framework);
          // executor machines: the platform runs ONE engine per machine (the one its runner uses); its state comes from the smoke result, not from a fixed label
          if (EXEC.on || EXEC.loading) { const target = (ENGINES[machineId()] || {})[norm(n)], cur = target === EXEC.machine, ok = cur && EXEC.status && Object.values(mergedOf(EXEC.status)).some(v => v.state === "pass");
            return opt("fw:" + o.v, `<b>${esc(n)}</b>`, !target ? bi("Not available yet", "尚未開放") : !cur ? bi("Smoke test", "冒煙測試") : !EXEC.status ? "" : ok ? bi("Verified", "已驗證") : bi("Not tested yet", "尚未測試"), cur, !target); }
          const wait = /unavailable/i.test(status || ""); return opt("fw:" + o.v, `<b>${esc(n)}</b>`, wait ? bi("Wait Develop", "待開發") : esc(status || ""), o.v === s.value, wait); }).join("") : `<p class="rw-msg warn">${bi("Connect first to load the engines of this machine.", "請先連線載入這台機器的推論引擎。")}</p>`) };
    }
    if (id === "model") {
      const needConnect = visible($("liveConnect"));
      const svc = opts($("liveService")), mdl = opts($("liveModel")).filter(o => o.v);
      let body = EXEC.needLocal ? `<p class="rw-msg warn">⚠ ${bi("Tests can only be started from the local page. Open", "測試只能從本機頁面啟動，請改開")} <a href="${esc("http://localhost:8765/benchmark.html" + location.hash)}">localhost:8765</a></p>` : EXEC.unavailable ? `<p class="rw-msg warn">⚠ ${bi("This is the old flow, it cannot find AISO1's models. Stop the local server (Ctrl+C in the make run window) and start it again to load the smoke test.", "這是舊流程，找不到 AISO1 的模型。請把本機伺服器（make run 的視窗）按 Ctrl+C 停掉再啟動一次，才會載入冒煙測試。")}</p>` : "";
      body += needConnect ? `<div class="rw-connect" id="rwConnectSlot"></div><p class="rw-msg warn">${bi("Connect with the local token before detecting models.", "請先用本機 Token 連線，再偵測模型。")}</p>` : "";
      if (svc.length > 1) body += svc.map(o => opt("svc:" + o.v, `<b>${esc(o.t)}</b>`, bi("Service", "服務"), o.v === $("liveService").value)).join("");
      body += `<div class="rw-row"><button type="button" class="rw-btn" data-act="discover"${needConnect ? " disabled" : ""}>${bi("Detect models", "偵測實機模型")}</button></div>`;
      body += mdl.length ? mdl.map(o => opt("mdl:" + o.v, `<b>${esc(o.t)}</b>`, "", o.v === $("liveModel").value)).join("") : `<p class="rw-msg">${bi("No model detected yet.", "尚未偵測到模型。")}</p>`;
      return { auto: true, title: bi("Choose a model", "選擇模型"), body, ok: !!modelName(), next: bi("Next", "下一步") };
    }
    if (id === "test") {
      return { auto: true, title: bi("How do you want to test?", "選擇測試方式"), ok: true, next: bi("Next", "下一步"),
        body: opt("mode:single", `<b>${bi("Quick single run", "快速單次測試")}</b>`, bi("One prompt, check it works", "單一提示，確認能跑"), mode() === "single") +
          opt("mode:sweep", `<b>${bi("V4 sweep", "V4 同參數掃描")}</b>`, canSweep() ? "Input × NP · llama.cpp" : bi("llama.cpp only", "僅 llama.cpp"), mode() === "sweep", !canSweep()) };
    }
    if (id === "load") {
      if (mode() === "sweep") {
        return { title: bi("Workload", "工作負載"), ok: true, next: bi("Next", "下一步"),
          body: `<dl class="rw-sum"><div><dt>Input</dt><dd>${esc(($("liveInputs") || {}).value || "4096, 8192, 16384")}</dd></div><div><dt>NP</dt><dd>${esc(($("liveNps") || {}).value || "1, 2, 4, 5")}</dd></div><div><dt>Output</dt><dd>1024</dd></div><div><dt>Repeat</dt><dd>3</dd></div><div><dt>Prefix cache</dt><dd>OFF</dd></div></dl><p class="rw-msg">${bi("Fixed by the V4 same-parameter protocol.", "依 V4 同參數規格固定，不可改。")}</p>` };
      }
      const g = (title, id, vals, label) => `<div class="rw-group"><h4>${title}</h4><div class="rw-opts-cols">${vals.map(v => opt(id + ":" + v, `<b>${label ? label(v) : v}</b>`, "", String(($(id === "np" ? "liveNp" : id === "out" ? "liveOutput" : "liveRepeat") || {}).value) === String(v))).join("")}</div></div>`;
      return { title: bi("Workload", "工作負載"), ok: true, next: bi("Next", "下一步"),
        body: g(bi("Concurrency (NP)", "並發"), "np", [1, 2, 3, 4], v => "NP" + v) + g(bi("Output tokens", "輸出長度"), "out", [128, 256, 512, 1024]) + g(bi("Repeats", "重複次數"), "rep", [1, 2, 3], v => "×" + v) };
    }
    const sweep = mode() === "sweep", status = ($("liveStatus") && $("liveStatus").textContent.trim()) || "";
    const row = (k, v) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`;
    return { title: bi("Ready to run", "準備開始"), ok: false, next: "", last: true,
      body: `<dl class="rw-sum">${row("Machine", ($("selectedUnitTitle") || {}).textContent || "")}${row("Engine", engine())}${row("Model", modelName() || "—")}${row("Test", sweep ? "V4 sweep" : "Quick single run")}${row("Workload", sweep ? "Input 4K/8K/16K × NP 1/2/4/5 · Output 1024 · ×3" : `NP${$("liveNp").value} · Output ${$("liveOutput").value} · ×${$("liveRepeat").value}`)}</dl>
        <div class="rw-row"><button type="button" class="mw-next" data-act="start"${ready() ? "" : " disabled"}>${bi("Start test", "開始測試")}</button></div>
        <div class="rw-row"><button type="button" class="rw-btn" data-act="stop">${bi("Stop", "停止")}</button><button type="button" class="rw-btn" data-act="results">${bi("Results", "結果")}</button></div>
        ${status ? `<p class="rw-msg">${esc(status)}</p>` : ""}` };
  }

  function render() {
    if (!root) return;
    parkConnect(); parkTerm();
    const q = question(), bars = S().map((_, i) => `<span class="${i <= st.step ? "on" : ""}"></span>`).join("");
    root.innerHTML = `<div class="mw"><div class="mw-stage">${stage()}</div><div class="mw-panel"><div class="mw-bars" aria-label="Step ${st.step + 1} of ${S().length}">${bars}</div>
      ${EXEC.on && EXEC.status && EXEC.status.busy && S()[st.step][0] !== "run" ? benchHtml() : ""}
      <h3 class="mw-q">${q.title}</h3><div class="mw-opts" role="listbox">${q.body}</div>
      ${q.last || q.auto ? "" : `<button type="button" class="mw-next" data-act="next"${q.ok ? "" : " disabled"}>${q.next}</button>`}<div class="mw-foot"><button type="button" class="mw-back mw-back-s" aria-label="Back 返回"${st.step === 0 ? " hidden" : ""}>← <small>${bi("Back", "返回")}</small></button>${q.last && EXEC.on ? `<button type="button" class="mw-refresh" data-act="erefresh">${bi("Refresh", "重新整理")}</button>` : ""}</div></div></div>`;
    const slot = $("rwConnectSlot"), c = $("liveConnect");
    if (slot && c) slot.appendChild(c);
    if (q.last) {
      const box = document.createElement("section"); box.className = "rw-term";
      box.innerHTML = `<h3 class="rw-term-h">${bi("Run log", "執行紀錄")}<small class="zhs">${bi("read-only · live progress of the run", "唯讀 · 即時顯示進行狀態")}</small></h3><div id="rwTermSlot"></div>`;
      root.appendChild(box);
      // the Terminal here is only the live progress of the run; the password-protected real shell is not part of the Run page (starting a run is already approved by the backend after the test password)
      const log = $("termPanel");
      if (log) { $("rwTermSlot").appendChild(log); log.hidden = false; const hb = log.querySelector("header b"); if (hb) hb.textContent = "RUN LOG"; }
      // notices belong in the Terminal, not on the card
      if (!EXEC.hinted && typeof tlog === "function") { EXEC.hinted = true; tlog("The test password is asked first. Nothing runs without it. 開始前會先要求輸入測試密碼，沒有密碼不會執行。"); }
    }
  }

  function pick(id) {
    const [k, v] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if (k === "fw") {
      setVal("frameworkSelect", v);
      const o = opts($("frameworkSelect")).find(x => x.v === v), target = o && (ENGINES[machineId()] || {})[normE(o.t.split(" — ")[0])];
      if (target && target !== EXEC.machine) switchEngine(target);
    }
    else if (k === "xt") EXEC.kind = v;
    else if (k === "svc") setVal("liveService", v);
    else if (k === "mdl") setVal("liveModel", v);
    else if (k === "mode") setVal("liveMode", v);
    else if (k === "xm") EXEC.pick = v;
    else if (k === "np") setVal("liveNp", v);
    else if (k === "out") setVal("liveOutput", v);
    else if (k === "rep") setVal("liveRepeat", v);
  }

  // one executor per (machine, engine): the engine picked on step 1 decides which one answers
  const ENGINES = { pro6000: { vllm: "pro6000", llamacpp: "pro6000_llamacpp" }, aiso1: { llamacpp: "aiso1" } };
  const baseOf = id => String(id || "").split("_")[0];
  const normE = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const execId = () => EXEC.execId || machineId();
  function switchEngine(id) {      // another engine of the same machine: forget the answers of the first one and ask the new executor
    clearInterval(EXEC.timer); if (EXEC.poll) { clearInterval(EXEC.poll); EXEC.poll = null; }
    Object.assign(EXEC, { execId: id, on: false, status: null, models: [], formal: null, pick: "all", ready: false, kindSet: false, kind: "smoke", unavailable: false, msg: "", seen: null, lastShown: false, hinted: false, loading: true });
    document.body.classList.remove("rw-exec"); render();
    if (!primeFromCache()) EXEC.loading = true;
    detectExec().then(() => { EXEC.loading = false; render(); });
  }
  const machineId = () => { const m = location.hash.match(/^#\/pick\/[a-z]+\/([a-z0-9-]+)/); return m ? ({ "aiso1-amd": "aiso1", "pro6000-tpi": "pro6000" }[m[1]] || null) : null; };
  // clean smoke progress: one row per model; the raw log is folded away
  // rough duration of one model's smoke (seconds, from the runs on this machine): loading the model dominates
  const EST = { gemma26: 60, gemma31: 210, laguna: 60, nemotron: 90, "GPT-OSS-20B": 300 };
  // the models of the run on screen: what this page started, else what the log shows, else the selection
  const shown = s => {
    if (EXEC.runModels && EXEC.runModels.length) return EXEC.runModels;
    if (s && s.run_models && s.run_models.length) return s.run_models;      // from the run's own manifest on the machine
    const keys = Object.keys(progressOf(s || EXEC.status || {}));
    if (keys.length && !(s && s.busy && (EXEC.pick || "all") === "all")) return EXEC.models.map(m => m.id).filter(id => keys.includes(id));
    return (EXEC.pick || "all") === "all" ? EXEC.models.map(m => m.id) : [EXEC.pick];
  };
  const estFor = () => shown().reduce((a, id) => a + (EST[id] || 120), 0);
  const startOf = log => { const m = String(log || "").match(/platform_(?:smoke|standard)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null; };
  const mmss = sec => { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"); };
  function benchHtml() {
    return `<div class="rw-bench" id="rwBench"><div class="rw-bench-t"><span class="rw-pulse">Benchmarking<small class="zhs">測試進行中</small></span>
        <svg class="rw-axe" viewBox="0 0 64 64" width="60" height="60" aria-hidden="true"><g class="rw-axe-g"><rect x="29" y="16" width="6" height="44" rx="3" fill="#c98a43"/><rect x="29" y="16" width="2" height="44" rx="1" fill="#e3a766" opacity=".6"/><path d="M5 10 C5 6 10 5 15 5 L29 5 L29 25 L15 25 C10 25 5 24 5 20 Z" fill="#9aa0a8"/><path d="M59 10 C59 6 54 5 49 5 L35 5 L35 25 L49 25 C54 25 59 24 59 20 Z" fill="#9aa0a8"/><path d="M9 9 C12 8 20 8 26 9" fill="none" stroke="#d7dbe0" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M55 9 C52 8 44 8 38 9" fill="none" stroke="#d7dbe0" stroke-width="2" stroke-linecap="round" opacity=".7"/><rect x="26" y="12" width="12" height="7" rx="2" fill="#7b5a34"/></g></svg></div>
      <div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="rwBarFill" style="width:0%"></i></div>
      <div class="rw-bench-m"><b id="rwPct">0%</b><span id="rwEta"></span></div></div>`;
  }
  function tickBench() {
    const s = EXEC.status || {}, fill = document.getElementById("rwBarFill"); if (!fill) return;
    const start = EXEC.startedAt || startOf(s.log) || Date.now(), total = estFor(), el = (Date.now() - start) / 1000;
    const prog = progressOf(s), done = Object.values(prog).filter(x => x.state === "pass" || x.state === "fail").length, want = shown(s).length;
    let pct = s.busy ? Math.min(97, (el / total) * 100) : (done >= want ? 100 : Math.min(97, (el / total) * 100));
    if (s.busy) pct = Math.max(pct, Math.min(97, (done / want) * 100));
    let etaStd = null;
    if (s.kind === "standard" && s.plan) {      // a standard run: progress = cases reported / cases planned; the time left is estimated from the pace so far
      const n = (s.cases || []).length, tot = s.plan.cases;
      pct = s.busy ? Math.min(97, (n / tot) * 100) : 100;
      etaStd = s.busy ? ` · ${n}/${tot} · ${bi("elapsed", "已過")} ${mmss(el)}${n ? ` · ${bi("about", "預計剩")} ${mmss((el / n) * (tot - n))}` : ""}` : "";
    }
    fill.style.width = pct.toFixed(1) + "%";
    document.getElementById("rwPct").textContent = Math.round(pct) + "%";
    document.getElementById("rwEta").innerHTML = etaStd !== null ? etaStd : s.busy ? ` · ${bi("elapsed", "已過")} ${mmss(el)} · ${bi("about", "預計剩")} ${mmss(Math.max(0, total - el))}` : "";
  }
  setInterval(() => { if (EXEC.on && EXEC.status && EXEC.status.busy) tickBench(); }, 1000);
  const PROG = { pass: ["✓", "PASS", "通過", "ok"], fail: ["✕", "FAIL", "失敗", "bad"], loading: ["◐", "Running", "測試中", "run"], waiting: ["○", "Waiting", "等待", "wait"] };
  // log lines shown to the user: keep progress and results, drop internal paths and the old campaign summary, round long numbers
  const tidy = l => { let t = String(l).replace(/\s+/g, " ").trim();
    if (!t || /^(RESULT_DIR|REPORT):/.test(t) || /B1024：\d+\/\d+ PASS/.test(t) || /LOADING:\s+\w+\s+LOG:/.test(t)) return "";
    return t.replace(/(\d+\.\d{3,})/g, m => String(Math.round(parseFloat(m) * 100) / 100)); };
  const tidyAll = lines => (lines || []).map(tidy).filter(Boolean);
  function progressOf(s) {
    return s.progress || (() => { const o = {};   // an older server only sends the log tail: read the states from it
      (s.tail || []).forEach(l => { let m = l.match(/LOADING:\s+([\w.-]+)/); if (m) o[m[1]] = { state: "loading", agg: null };
        m = l.match(/(?:llamacpp|vllm)\/([\w.-]+)\s+NP=\d+\s+input=\d+\s+R=\d+\s+(PASS|FAIL)(?:.*?agg=([\d.]+))?/); if (m) o[m[1]] = { state: m[2].toLowerCase(), agg: m[3] ? Math.round(parseFloat(m[3]) * 100) / 100 : null }; });
      return o; })();
  }
  // newest smoke result of every model over ALL smoke runs (server: status.last); the run on screen wins for its own models
  // "26B · Q4_0": size read from the model repo / id (never guessed: no B in the name -> only the quantization), quantization from the machine's profile
  const specText = id => { const m = EXEC.models.find(x => x.id === id) || {}; const b = String(m.repo || m.id || id).match(/(\d+(?:\.\d+)?)B(?![a-z])/i);
    const gb = m.size_gb != null ? m.size_gb : (m.bytes ? Math.round(m.bytes / 1e8) / 10 : null);       // parameters (B) · quantization (Q4_0 / MXFP4 / BF16 ...) · weights size on disk
    return [b ? b[1] + "B" : "", m.quant || "", gb != null ? gb + " GB" : ""].filter(Boolean).join(" · "); };
  const specHtml = id => { const t = specText(id); return t ? `<small class="rw-spec">${esc(t)}</small>` : ""; };
  const smokeProg = s => (s && s.kind === "standard" ? {} : progressOf(s || {}));      // a standard run never counts as a smoke result
  function mergedOf(s) {
    const out = {}, last = (s && s.last) || {};
    Object.keys(last).forEach(k => { const v = last[k]; out[k] = { state: v.status === "PASS" ? "pass" : "fail", agg: v.agg, ttft_s: v.ttft_s, tpot_ms: v.tpot_ms, earlier: true }; });
    const cur = smokeProg(s); Object.keys(cur).forEach(k => { out[k] = Object.assign({}, out[k] && out[k].state === cur[k].state ? out[k] : {}, cur[k]); });
    return out;
  }
  function progressHtml(s) {
    const prog = progressOf(s);
    if (!s.log || s.log === "none" || !Object.keys(prog).length) return "";
    const ids = shown(s);
    const rest = EXEC.models.map(m => m.id).filter(id => !ids.includes(id) && !((s.last || {})[id] && s.last[id].status === "PASS"));
    // a pulsing "!" at the right of the tested item: pointing at it shows the other models and the question (popover, no long block)
    const hasMore = s.kind !== "standard" && !s.busy && rest.length > 0;
    const pop = hasMore ? `<span class="rw-pop"><span class="rw-pop-n">${rest.map(esc).join(" · ")}</span><button type="button" class="mw-next" data-act="esmokerest">${bi("Test the other " + rest.length, "測試其餘 " + rest.length + " 個")}</button></span>` : "";
    const rows = ids.map((id, n) => { const p = prog[id] || { state: "waiting" }; const t = PROG[p.state] || PROG.waiting; const last = hasMore && n === ids.length - 1;
      const fin = p.state === "pass" || p.state === "fail";
      return `<li class="${t[3]}${last ? " has-more" : ""}${fin ? " go" : ""}"${fin ? ' data-act="eresult" title="Result 結果"' : ""}${last ? ' tabindex="0"' : ""}><i>${t[0]}</i><b>${esc(id)}${specHtml(id)}</b><span>${t[1]}<small class="zhs">${t[2]}</small>${p.total ? " · " + p.done + "/" + p.total + (p.bad ? " · " + p.bad + " FAIL" : "") : p.agg ? " · " + esc(p.agg) + " tok/s" : ""}${fin ? ` <em class="rw-go">Result<small class="zhs">結果</small> ›</em>` : ""}</span>${last ? `<em class="rw-hint">${bi(rest.length + " more", "還有 " + rest.length + " 個")}</em>${pop}` : ""}</li>`; }).join("");
    const more = "";
    return `<ul class="rw-prog">${rows}</ul>`;   // the summary line and the log are shown in the Terminal below
  }
  // the Terminal block under the card shows the run as it goes (only while a run is going / was started from this page)
  function streamToTerminal(s) {
    if (!s || !s.ok) return;
    window.__rwBusy = !!s.busy;
    const ts = document.getElementById("termState"); if (ts) ts.textContent = s.busy ? "running" : (EXEC.watch ? "done" : "idle");
    if (s.busy && !EXEC.watch) EXEC.watch = true;
    if (!EXEC.watch) {      // page opened after a run: show the last run once, in the Terminal
      const pr = progressOf(s), ids = Object.keys(pr);
      if (!EXEC.lastShown && typeof tlog === "function" && s.log && s.log !== "none" && ids.length) {
        EXEC.lastShown = true;
        tlog((s.kind === "standard" ? "Last standard test 上一次標準測試 · " : "Last smoke test 上一次冒煙測試 · ") + ids.filter(k => pr[k].state === "pass").length + "/" + ids.length + " PASS");
        tidyAll(s.tail).forEach(k => tlog(k, /FAIL|Traceback|Error/.test(k) ? "err" : undefined));
      }
      return;
    }
    if (typeof tlog !== "function") return;
    EXEC.seen = EXEC.seen || new Set();
    if (!EXEC.seen.size) { const clr = document.getElementById("termClear"); if (clr) clr.click(); tlog("$ " + (EXEC.runKind === "standard" ? "standard test" : "smoke test") + " · " + EXEC.machine + " · " + EXEC.models.map(m => m.id).join(", ")); if (typeof termOpen === "function") termOpen(true); }
    tidyAll(s.tail).forEach(k => { if (!EXEC.seen.has(k)) { EXEC.seen.add(k); tlog(k, /FAIL|Traceback|Error/.test(k) ? "err" : undefined); } });
    if (!s.busy && EXEC.seen.size && !EXEC.doneNote) { EXEC.doneNote = true; tlog(s.result ? "done · " + s.result : "done"); }
  }
  // Results tab for runner machines: FORMAL results only (a link to the result page + what is on the platform); smoke runs are listed apart and are never counted as results
  async function loadFormal() {
    if (EXEC.formal || !EXEC.machine) return;
    try {
      const reg = await (await fetch("data/benchmark-registry.json", { cache: "no-store" })).json();
      const rows = [];
      for (const d of (reg.datasets || []).concat(reg.single_machines || []).filter(x => x.machine === baseOf(EXEC.machine))) {
        const ds = await (await fetch(d.file, { cache: "no-store" })).json();
        rows.push({ framework: (reg.frameworks.find(f => f.key === d.framework) || {}).label || d.framework, n: (ds[d.runs_key] || []).length, until: ds.evidence_until || "" });
      }
      EXEC.formal = rows;
    } catch (e) { EXEC.formal = []; }
    renderResults();
  }
  // result of the standard run (the one going now, else the newest on the machine): one row per model x NP x Input, mean over the repeats that passed
  function stdResultsHtml() {
    const st = EXEC.status || {}, sl = st.standard_last || {};
    const live = st.kind === "standard" && (st.busy || !(sl.cases || []).length);
    const cases = (live ? st.cases : sl.cases) || [];
    if (!cases.length) return "";
    const g = {};
    cases.forEach(c => { const key = [c.model, c.np, c.input].join("|"); (g[key] = g[key] || { model: c.model, np: c.np, input: c.input, n: 0, ok: [] }).n++; if (c.status === "PASS") g[key].ok.push(c); });
    const mean = (a, f) => { const v = a.map(f).filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
    const fx = (v, d) => v == null ? "—" : v.toFixed(d);
    const rows = Object.values(g).map(x => `<tr class="${x.ok.length === x.n ? "ok" : "bad"}"><td>${esc(x.model)}</td><td>${x.np}</td><td>${x.input}</td><td>${fx(mean(x.ok, c => c.ttft_ms), 0)}</td><td>${fx(mean(x.ok, c => c.tpot_ms), 1)}</td><td>${fx(mean(x.ok, c => c.agg != null ? c.agg : c.aggregate_tps), 1)}</td><td>${x.ok.length}/${x.n}</td></tr>`).join("");
    const when = live ? "" : (sl.finished_at || sl.started_at || "");
    return `<h3 class="rw-sub">${bi("Standard test run", "本次標準測試")}<small class="zhs">${live ? bi("running", "進行中") : esc(when) + (sl.stopped ? " · stopped 已停止" : "")}</small></h3>
      <div class="rw-tblw"><table class="rw-tbl"><thead><tr><th>Model</th><th>NP</th><th>Input</th><th>TTFT ms</th><th>TPOT ms</th><th>tok/s</th><th>PASS</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="rw-msg">${bi("Mean of the repeats that passed. Not added to the platform data yet.", "取通過的重複次數平均；尚未匯入平台資料。")}</p>`;
  }
  function renderResults() {
    const host = $("parameterPage"); if (!host || !EXEC.on) return;
    let sec = $("rwResults");
    if (!sec) { sec = document.createElement("section"); sec.id = "rwResults"; sec.className = "report-section"; sec.setAttribute("data-v", "result"); host.appendChild(sec); }
    const page = ({ aiso1: "stress-test-aiso1.html", pro6000: "stress-test-pro6000.html" })[baseOf(EXEC.machine)] || "stress-test-compare.html";
    const f = EXEC.formal || [], total = f.reduce((a, r) => a + r.n, 0), until = f.map(r => r.until).sort().pop() || "";
    const prog = smokeProg(EXEC.status || {}), ids = Object.keys(prog), pass = ids.filter(k => prog[k].state === "pass").length;
    const merged = mergedOf(EXEC.status || {});
    const shownIds = EXEC.models.map(m => m.id).filter(k => merged[k]);
    const rowsHtml = shownIds.map(k => { const p = merged[k], t = PROG[p.state] || PROG.waiting; const met = (n, zh, v, u) => v == null ? "" : `<div><dt>${n}<small class="zhs">${zh}</small></dt><dd>${esc(v)}<small> ${u}</small></dd></div>`;
      const m = p.agg || p.ttft_s != null ? `<dl class="rw-met">${met("TTFT", "首字時間", p.ttft_s, "s")}${met("TPOT", "每字時間", p.tpot_ms, "ms")}${met("Throughput", "吞吐量", p.agg, "tok/s")}</dl>` : "";
      return `<li class="${t[3]} met"><i>${t[0]}</i><b>${esc(k)}${specHtml(k)}</b><span>${t[1]}<small class="zhs">${t[2]}</small></span>${m}</li>`; }).join("");
    const bad = shownIds.filter(k => merged[k].state === "fail").length, wait = shownIds.filter(k => merged[k].state === "loading").length;
    const verdict = !shownIds.length ? "" : (bad ? `<span class="rw-verdict bad">${bi(bad + " FAIL", bad + " 個失敗")}</span>` : wait ? `<span class="rw-verdict run">${bi("Running…", "測試中…")}</span>` : `<span class="rw-verdict ok">${bi("All PASS", "全部通過")}</span>`);
    sec.innerHTML = `<header><div><p class="section-label">SMOKE TEST RESULT</p><h2>${bi("Smoke test result", "冒煙測試結果")} ${verdict}</h2></div></header>
      ${shownIds.length ? `<ul class="rw-prog">${rowsHtml}</ul><p class="rw-msg">${bi("NP1 · 4K · 1 request per model. Only checks that the model loads and answers; these numbers are not benchmark results.", "NP1、4K，每個模型 1 個請求。只確認模型能載入並回應；這些數字不是 Benchmark 結果。")}</p>` : `<p class="rw-msg">${bi("No smoke test yet.", "還沒有冒煙測試。")}</p>`}
      ${stdResultsHtml()}
      <h3 class="rw-sub">${bi("Standard results", "標準結果")}<small class="zhs">${bi("on the platform", "已在平台上")}</small></h3>
      <dl class="rw-sum"><div><dt>${bi("Conditions", "條件數")}</dt><dd>${total}${until ? " · " + esc(until) : ""}</dd></div>
      ${f.map(r => `<div><dt>${esc(r.framework)}</dt><dd>${r.n}</dd></div>`).join("")}</dl>
      <div class="rw-row"><a class="rw-btn" href="${page}">${bi("Open the result page", "開啟結果頁")} →</a><button type="button" class="rw-btn" id="rwBackRun">← ${bi("Run again", "再測一次")}</button></div>
      <p class="rw-msg">${bi("Only standard runs (full protocol, 3 repeats) are results. Smoke tests are never counted and never reach the comparison.", "只有標準測試（完整規格、3 次重複）才算結果。冒煙測試不列入，也不會進比較頁。")}</p>`;
    const back = $("rwBackRun"); if (back) back.onclick = () => { if (typeof setView === "function") setView("run"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  }
  async function loadExecStatus() {
    try { const r = await fetch("/api/benchmark/executor/status?machine=" + EXEC.machine, { cache: "no-store" }); EXEC.status = await r.json(); } catch (e) { EXEC.msg = "status: " + e.message; }
    if (EXEC.status && EXEC.status.busy && !EXEC.kindSet) { EXEC.kind = EXEC.status.kind === "standard" ? "standard" : "smoke"; EXEC.kindSet = true; }      // opened in the middle of a run: show that run
    streamToTerminal(EXEC.status);
    const nowBusy = !!(EXEC.status && EXEC.status.busy);
    if (EXEC.wasBusy && !nowBusy && EXEC.watch && typeof setView === "function") setTimeout(() => { setView("result"); const r = $("rwResults"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" }); }, 2500);   // the run finished: the next screen is the Results
    EXEC.wasBusy = nowBusy;
    renderResults();
    render();
    tickBench();
    // poll while a run is going (also when the page was opened in the middle of one); stop when it is finished
    if (EXEC.status && EXEC.status.busy) { if (!EXEC.poll) EXEC.poll = setInterval(loadExecStatus, 5000); }
    else if (EXEC.poll) { clearInterval(EXEC.poll); EXEC.poll = null; }
  }
  async function stopRun() {
    if (!window.confirm("Stop the running test? 要停止正在執行的測試嗎？")) return;
    try {
      const ticket = await window.RunGate.ticket();
      const r = await fetch("/api/benchmark/executor/stop", { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": ticket }, body: JSON.stringify({ machine: EXEC.machine }) });
      const d = await r.json();
      if (typeof tlog === "function") tlog(d.ok ? "Stop sent: the runner closes its server first. 已送出停止，執行器會先關閉伺服器。" : (d.error || "could not stop"), d.ok ? undefined : "err");
    } catch (e) { if (typeof tlog === "function") tlog(String(e.message || e), "err"); }
    EXEC.watch = true; await loadExecStatus();
  }
  async function startSmoke(list, kind) {
    kind = kind || "smoke";
    if (EXEC.starting) return;   // a second click while the password dialog / request is open does nothing
    EXEC.starting = true; EXEC.msg = ""; EXEC.watch = true; EXEC.runKind = kind; EXEC.startedAt = Date.now(); EXEC.runModels = (list || [EXEC.pick || "all"])[0] === "all" ? EXEC.models.map(m => m.id) : (list || [EXEC.pick]); EXEC.seen = new Set(); EXEC.doneNote = false;
    try {
      const ticket = await window.RunGate.ticket();
      const r = await fetch("/api/benchmark/executor/smoke", { method: "POST", headers: { "Content-Type": "application/json", "X-Run-Ticket": ticket }, body: JSON.stringify({ machine: EXEC.machine, kind, models: list || [EXEC.pick || "all"], params: kind === "standard" ? stdParams() : Object.fromEntries(Object.keys(EXEC.spec || {}).filter(k => !EXEC.spec[k].fixed).map(k => [k, pval(k)])) }) });
      const d = await r.json();
      EXEC.msg = d.ok ? d.message : (d.error || "could not start");
    } catch (e) { EXEC.msg = String(e.message || e); }
    EXEC.starting = false;
    await loadExecStatus();
    if (EXEC.msg && typeof tlog === "function") {          // the answer of the start request (cancelled / refused / started) goes to the Terminal
      const bad = !/started/i.test(EXEC.msg);
      if (bad && !(EXEC.status && EXEC.status.busy)) EXEC.watch = false;
      tlog(EXEC.msg, bad ? "err" : undefined); if (typeof termOpen === "function") termOpen(true);
    }
    const term = document.querySelector(".rw-term"); if (term) term.scrollIntoView({ behavior: "smooth", block: "start" });
    clearInterval(EXEC.timer); EXEC.timer = setInterval(() => { if (S()[st.step] && S()[st.step][0] === "run") loadExecStatus(); }, 6000);
  }
  // The machine answers over SSH, which takes a few seconds. The last answer is kept in the browser: the flow is drawn from it at once and refreshed when the live answer arrives.
  const useModels = (id, d) => { Object.assign(EXEC, { on: true, machine: id, models: d.models, version: d.version || "", device: d.device || "", framework: d.framework || "", spec: d.params || null, stdspec: d.standard || null, tier: d.tier || "" }); document.body.classList.add("rw-exec"); };
  function primeFromCache() {
    const id = execId(); if (!id) return false;
    try {
      const c = JSON.parse(localStorage.getItem("rw-exec-" + id) || "null");
      if (c && c.models && c.models.length && c.params) { useModels(id, c); resetParams(); loadFormal(); return true; }
    } catch (e) { /* no cache: the loading state is shown instead */ }
    return false;
  }
  async function detectExec() {
    const id = execId(); if (!id) return;
    try {
      const r = await fetch("/api/benchmark/executor/models?machine=" + id, { cache: "no-store" });
      const d = await r.json();
      if (d.ok && d.models && d.models.length) {
        const first = !EXEC.on;
        useModels(id, d);
        if (first) { resetParams(); loadFormal(); }
        EXEC.unavailable = false; EXEC.needLocal = false;
        try { localStorage.setItem("rw-exec-" + id, JSON.stringify({ models: d.models, version: d.version, device: d.device, framework: d.framework, params: d.params, standard: d.standard, tier: d.tier })); } catch (e) { /* private window */ }
        if (!EXEC.ready) {
          EXEC.ready = true;
          // the old log lines ("enter the Bearer Token", "detect models") do not apply to this flow: drop them, then show our own
          const orig = window.tlog;
          if (typeof orig === "function" && !orig.__rw) { const f = (t, c) => (/Bearer Token|請偵測模型|請先於上方輸入/.test(String(t)) ? undefined : orig(t, c)); f.__rw = true; window.tlog = f; }
          const clr = document.getElementById("termClear"); if (clr) clr.click();
          if (typeof tlog === "function") tlog("Ready: " + d.models.map(m => m.id).join(", ") + " · press Start smoke test (the test password is asked first).");
        }
        await loadExecStatus();      // streams the run into the Terminal when one is going
      }
      else if (/localhost administrator/i.test(d.error || "")) { EXEC.needLocal = true; EXEC.unavailable = false; }     // opened from the LAN address: tests can only be started from the local page
      else EXEC.unavailable = !d.ok && /no executor|unreach|answer/i.test(d.error || "") ? false : true;
      if (!d.ok) EXEC.msg = d.error || "";
    } catch (e) { EXEC.unavailable = true; }     // an old server answers 404 / HTML: say so on the screen instead of silently showing the old flow
  }
  function mount() {
    const host = $("legacyConfig");
    if (!host || $("runWizard")) return;
    root = document.createElement("section");
    root.id = "runWizard"; root.className = "rw-mount"; root.setAttribute("data-v", "run");
    host.parentNode.insertBefore(root, host);
    termIds.forEach(id => { const n = $(id); if (n) termHome[id] = { parent: n.parentNode, next: n.nextSibling }; });
    const c = $("liveConnect"); if (c) connectHome = { parent: c.parentNode, next: c.nextSibling };
    document.body.classList.add("rw-on");
    root.addEventListener("click", e => {
      const o = e.target.closest(".mw-opt"), b = e.target.closest(".mw-back"), a = e.target.closest("[data-act]");
      if (o && o.getAttribute("aria-disabled") !== "true") { pick(o.dataset.id); if (/^(fw|mdl|mode|xm|xt):/.test(o.dataset.id)) st.step = Math.min(S().length - 1, st.step + 1); render(); }
      else if (b) { st.step = Math.max(0, st.step - 1); render(); }
      else if (a && !a.disabled) {
        const act = a.dataset.act;
        if (act === "next") { st.step = Math.min(S().length - 1, st.step + 1); render(); }
        else if (act === "discover") { $("liveDiscover").click(); }
        else if (act === "eretry") { EXEC.loading = true; EXEC.msg = ""; render(); detectExec().then(() => { EXEC.loading = false; render(); }); }
        else if (act === "ebase") { switchEngine(machineId()); }
        else if (act === "epdd") { EXEC.pdOpen = !EXEC.pdOpen; render(); }
        else if (act === "eparamreset") { resetParams(); render(); }
        else if (act === "ekind") { EXEC.kind = a.dataset.kind; render(); }
        else if (act === "erefresh") { loadExecStatus(); }
        else if (act === "eresult") { if (typeof setView === "function") setView("result"); const r = $("rwResults"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" }); }
        else if (act === "esmoke") { startSmoke(); }
        else if (act === "estandard") { startSmoke(undefined, "standard"); }
        else if (act === "estop") { stopRun(); }
        else if (act === "esmokerest") { const done = Object.keys(smokeProg(EXEC.status || {})); startSmoke(EXEC.models.map(m => m.id).filter(id => !done.includes(id))); }
        else if (act === "start") { $("liveStart").click(); }
        else if (act === "stop") { $("liveStop") && $("liveStop").click(); }
        else if (act === "term") { $("terminalToggle") && $("terminalToggle").click(); }
        else if (act === "results") { const t = document.querySelector('#viewTabs [data-view="result"]'); if (t) t.click(); }
      }
    });
    root.addEventListener("change", e => {
      const el = e.target.closest("[data-p]"); if (!el || !EXEC.spec) return;
      const [kind, k] = el.dataset.p.split(":");
      if (kind === "smoke") { const x = EXEC.spec[k]; let v = Math.round(Number(el.value)); if (!isFinite(v)) v = x.default; EXEC.params[k] = Math.min(x.max, Math.max(x.min, v)); }   // a value outside the limits is pulled back to the nearest allowed one
      else EXEC.std[k] = el.value;   // standard: lists stay as typed; the server checks them again
      EXEC.pdOpen = true;           // editing keeps the list open
      render();
    });
    // keep the wizard in step with what the page logic changes (models found, status text, button state, access badge)
    let timer = null; const again = () => { clearTimeout(timer); timer = setTimeout(() => { if (!root.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") render(); }, 120); };
    ["frameworkSelect", "liveService", "liveModel", "liveStatus", "liveStart", "accessBadge", "selectedUnitTitle", "liveModeRow", "liveConnect", "machineCard"].forEach(id => {
      const e = $(id); if (e) new MutationObserver(again).observe(e, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    });
    EXEC.loading = !primeFromCache() && !!machineId();      // nothing remembered: a short "checking the machine" panel instead of a blank page
    const reveal = () => document.documentElement.classList.remove("rw-boot");       // the page stays invisible until the real flow is drawn: no flash of the old screen
    const tryDetect = (n) => detectExec().then(() => { EXEC.loading = false; render(); if (EXEC.unavailable && n < 4) setTimeout(() => tryDetect(n + 1), 3000); });   // the server may still be (re)starting: ask again before showing a notice for good
    render(); requestAnimationFrame(reveal);      // drawn at once (from the remembered answer, or the loading panel); the live answer updates it
    tryDetect(0);
  }
  window.addEventListener("DOMContentLoaded", () => setTimeout(mount, 0));
  window.addEventListener("hashchange", () => { st.step = 0; setTimeout(render, 300); });
})();
