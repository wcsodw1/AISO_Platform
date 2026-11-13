/* Build Your Own System: machines (photo + best for) + how many users + how many machines + the architect's gates.
   Capacity numbers come from data/sizing-capacity.json (scripts/build_sizing_capacity.py computes it from the benchmark datasets on the platform). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const zh = t => '<small class="zhs">' + esc(t) + "</small>";
  const lines = a => esc(a[0]) + a.slice(1).map(x => "<small>" + esc(x) + "</small>").join("");

  // hardware facts are copied from each machine's own dataset profile (data/benchmark-*/...) and data/products.json, not estimated; "—" = not on the platform yet
  const VENDORS = [["Intel", "英特爾"], ["AMD", "AMD"], ["NVIDIA", "輝達"]];
  const ARCH = [
    { id: "B70", vendor: "Intel", unit: "GPU 32 × 2 = 64 GB", name: "B70", title: "Intel Arc Pro B70", sub: "2-GPU workstation", zh: "工作站 GPU", photo: "assets/products/sparkle-arc-pro-b70-blower.webp", measured: true,
      vramGb: 64, vram: ["64 GB", "GPU 32 GB × 2 · GDDR6 ECC"], dram: ["—", "not on the platform yet"], ssd: ["—", "not on the platform yet"], backend: ["SYCL", "Intel Xe2"],
      detail: [["Memory bandwidth 記憶體頻寬", "608 GB/s per GPU", "Xe2 architecture"], ["Tested with 測試條件", "2 GPUs · llama.cpp e937b17 · batch 1024", "context 18432 per slot"], ["Frameworks 框架", "llama.cpp", "vLLM, SGLang: Oct 2026, historical"]] },
    { id: "B60", vendor: "Intel", unit: "GPU 48 × 2 = 96 GB", name: "B60", title: "Intel Arc Pro B60", sub: "4-GPU box", zh: "工作站 GPU", photo: "assets/products/sparkle-arc-pro-b60-blower.webp", measured: true,
      vramGb: 96, vram: ["96 GB", "GPU 48 GB × 2"], dram: ["—", "not on the platform yet"], ssd: ["—", "not on the platform yet"], backend: ["SYCL", "llama.cpp · vLLM XPU TP2"],
      detail: [["Memory bandwidth 記憶體頻寬", "—", "not on the platform yet"], ["Tested with 測試條件", "2 of 4 GPUs · llama.cpp e937b17 · batch 4096", "context 18432 per slot"], ["Frameworks 框架", "vLLM · SGLang · llama.cpp", "2026-11-05"]] },
    { id: "AISO1", vendor: "AMD", unit: "GPU share 64 GB", name: "AISO1", title: "AISO1", sub: "AMD Ryzen AI Max+ 395 · Radeon 8060S", zh: "迷你工作站", photo: "assets/products/aiso1-ai-max395.png", measured: true,
      vramGb: 64, vram: ["64 GB", "GPU share of the 128 GB unified memory"], dram: ["128 GB", "LPDDR5x-8533, shared with the GPU"], ssd: ["1 TB", "SSD"], backend: ["Vulkan", "Radeon 8060S (integrated)"],
      detail: [["Usable GPU memory 可用顯存", "97,499 MiB", "reported by Vulkan"], ["Tested with 測試條件", "1 unit · llama.cpp e937b17 · batch 1024", "context 18432 per slot"], ["Frameworks 框架", "llama.cpp", "vLLM: 2026-10-15, historical"]] },
    { id: "PRO6000", vendor: "NVIDIA", unit: "8 GPUs", name: "RTX PRO 6000", title: "RTX PRO 6000", sub: "NVIDIA Blackwell Server Edition", zh: "伺服器", photo: "assets/products/pro6000-server-chassis-cutout.png", measured: false,
      vram: ["96 GB per GPU", "TPI server: 8 GPUs"], dram: ["—", "not on the platform yet"], ssd: ["—", "not on the platform yet"], backend: ["CUDA", "Blackwell"],
      detail: [["Server models 伺服器型號", "HPE 2-GPU · TPI 8-GPU", "both use RTX PRO 6000"], ["Tested with 測試條件", "vLLM (aiDAPTIV image), without / cold / warm", "not the same protocol as B60 / B70 / AISO1"], ["Frameworks 框架", "vLLM", "llama.cpp: smoke test only"]] },
  ];
  const state = { machine: "All", arch: "All", moreOpen: false, spd: false, scn: "s8", use: "typ", len: 1, ha: false, set: "Nemotron", data: null, open: {}, why: { machine: "B70", type: "MoE", key: null }, ev: "matrix", mxInput: "8192" };
  const LABEL = { "4096": "4K", "8192": "8K", "16384": "16K" };
  /* three team sizes; one fixed assumption: 3 of every 10 people ask at the same moment, with a normal 4K prompt (our assumption, not a measurement) */
  const SCALES = [
    { id: "s4", people: 4, en: "Small team", zh: "小團隊" },
    { id: "s8", people: 8, en: "Team", zh: "團隊" },
    { id: "s30", people: 30, en: "Department", zh: "部門" },
  ];
  const scn = () => SCALES.find(x => x.id === state.scn) || SCALES[1];
  const LENS = ["4096", "8192", "16384"], LENK = () => LENS[state.len], SHARE = 0.3;
  const needFor = n => Math.ceil(n * SHARE);
  const unitsFor = (np, n) => Math.ceil(needFor(n) / np) + (state.ha ? 1 : 0);
  const unitText = u => u + (u === 1 ? " machine" : " machines");
  // display names from each dataset's model_parity table
  const MODEL_NAME = { Gemma26: "Gemma 4 26B A4B", Gemma31: "Gemma 4 31B", Laguna: "Laguna XS 2.1", Nemotron: "Nemotron 3.5 Lightning 30B A3B" };

  const rowsOf = (m, type) => state.data.rows.filter(r => r.role === "main" && r.machine === m && r.arch.startsWith(type));
  /* a cell counts only when it is at least 7% above 15 tok/s: borderline results (e.g. 15.06) are not used for sizing */
  const MARGIN = 1.07;
  const okAt = (r, k) => {
    const cs = (r.by_input[k] || {}).cells || [], lim = state.data.threshold_tps * (state.raw ? 1 : MARGIN), pass = cs.filter(c => c.tps >= lim);
    const np = pass.length ? Math.max(...pass.map(c => c.np)) : 0, hit = pass.find(c => c.np === np);
    return { np, plus: np > 0 && np === cs[cs.length - 1].np, tps: hit ? hit.tps : null, ttft: hit ? hit.ttft_s : null };
  };
  const npAt = (r, k) => okAt(r, k).np, plusAt = (r, k) => okAt(r, k).plus;

  /* machines needed use the model that keeps 15 tok/s (with margin) at BOTH 4K and 8K input, so a long-ish prompt does not break it */
  function bestFor(m, type, ks = [LENK()]) {
    let best = null;
    for (const r of rowsOf(m, type)) {
      const np = Math.min(...ks.map(k => npAt(r, k))), plus = ks.every(k => npAt(r, k) !== np || plusAt(r, k));
      if (np > 0 && (!best || np > best.np)) best = { np, plus, r };
    }
    return best;
  }
  /* a package = one model configuration (type and size may differ; the speeds should be close). Per machine: the framework that serves it best at 4K and 8K */
  /* quantization family from the dataset's own format string: GGUF Q4_x -> Q4, W4A16 -> INT4, FP8 -> FP8 ... */
  const qFamily = f => /Q4/i.test(f || "") ? "Q4" : /Q8/i.test(f || "") ? "Q8" : /W4A16|INT4/i.test(f || "") ? "INT4" : /W8A8|INT8/i.test(f || "") ? "INT8" : /FP8/i.test(f || "") ? "FP8" : (f || "—");
  const quantOf = model => { const r = state.data.rows.find(x => x.model === model && x.framework.startsWith("llama.cpp")) || state.data.rows.find(x => x.model === model) || {}; return { fam: qFamily(r.format), fmt: (r.format || "").replace("GGUF ", "") }; };
  const SHORT = { Gemma26: "Gemma 26B", Gemma31: "Gemma 31B", Laguna: "Laguna", Nemotron: "Nemotron" };
  const MODELS = ["Gemma26", "Laguna", "Nemotron", "Gemma31"];
  /* model sets are designed by us: models of a similar size / type kept together, all served on one machine. Parameters (B) are the model names' own (Laguna's is not on the platform). */
  const MODEL_B = { Gemma26: "26B (4B active)", Gemma31: "31B", Laguna: "", Nemotron: "30B (3B active)" };
  /* ONE model at a time: all measurements are single-model runs. Several models on one machine were never benchmarked, so that is not calculated. */
  const SETS = [
    { id: "Gemma26", en: "Gemma 4 26B", zh: "MoE", models: ["Gemma26"] },
    { id: "Gemma31", en: "Gemma 4 31B", zh: "Dense", models: ["Gemma31"], more: true },
    { id: "Laguna", en: "Laguna XS 2.1", zh: "MoE", models: ["Laguna"] },
    { id: "Nemotron", en: "Nemotron 3.5 30B", zh: "MoE 混合", models: ["Nemotron"] },
  ];
  /* typical input per request, in K tokens (lo..hi, or a single point), drawn on the same 0-16K scale as the tested lengths; k = the tested length used for that case */
  const SCENS = [
    { id: "chat", en: "Chat", zh: "對話", rng: "1–4K", lo: 1, hi: 4, k: 4, src: "LMSYS-Chat-1M" },
    { id: "cs", en: "Support", zh: "客服", rng: "2–4K", lo: 2, hi: 4, k: 4, src: "vendor guides, rough" },
    { id: "typ", en: "Typical", zh: "一般請求", rng: "4–8K", lo: 4, hi: 8, k: 8, src: "OpenRouter average ≈6K; the range is our estimate" },
    { id: "doc", en: "Document", zh: "文件", rng: "3–16K", lo: 3, hi: 16, k: 16, src: "vendor blogs, rough" },
    { id: "agent", en: "Agent", zh: "Agent", rng: "7–35K", lo: 7, hi: 35, k: 16, beyond: true, src: "agent measurements, rough" },
    { id: "code", en: "Coding", zh: "程式", rng: "20K+", lo: 20, hi: 40, k: 16, beyond: true, src: "OpenRouter" },
  ];
  SCENS.forEach((x, i) => { x.let = "ABCDEFGH"[i]; });
  const curUse = () => SCENS.find(x => x.id === state.use);
  const curSet = () => SETS.find(x => x.id === state.set) || SETS[3];
  const setModels = () => curSet().models;
  function pkgBest(m, model, ks = [LENK()]) {
    let best = null;
    for (const r of state.data.rows.filter(x => x.role === "main" && x.machine === m && x.model === model)) {
      const np = Math.min(...ks.map(k => npAt(r, k))), plus = ks.every(k => npAt(r, k) !== np || plusAt(r, k));
      if (np > 0 && (!best || np > best.np)) best = { np, plus, r };
    }
    return best;
  }
  const modelInfo = model => { const r = state.data.rows.find(x => x.model === model) || {}; const w = (state.data.rows.find(x => x.model === model && x.weights_gb != null) || {}).weights_gb; return { arch: r.arch || "", gb: w }; };
  const USABLE = 0.9;
  /* people spread equally over the models; each model needs (people x 30% / models) requests at once. A model that alone holds NP requests at 15 tok/s uses need/NP of the machine,
     the loads add up (shared compute, no contention overhead). Weights of all models must sit in memory together; if not, more machines (first-fit). */
  function slowBest(m, model, ks = [LENK()]) {
    let best = null;
    for (const r of state.data.rows.filter(x => x.role === "main" && x.machine === m && x.model === model)) { const c = ((r.by_input[ks[0]] || {}).cells || [])[0]; if (c && (!best || c.tps > best.tps)) best = { np: 1, plus: false, tps: c.tps, r }; }
    return best;
  }
  function bundle(machineId, models, people, ks) {
    const m = ARCH.find(x => x.id === machineId), each = models.length === 1 ? needFor(people) : people * SHARE / models.length, kk = ks || [LENK()];
    const items = models.map(mod => { let b = pkgBest(machineId, mod, ks), slow = false; if (!b) { b = slowBest(machineId, mod, kk); slow = true; } return { mod, b, slow, tps: slow && b ? b.tps : null, need: each, cap: 1 * (b ? b.np : 1), plus: b && !slow ? b.plus : false, load: each / (b ? b.np : 1), w: b && b.r ? b.r.weights_gb : null, fw: b && b.r ? b.r.framework : "" }; });
    const usable = m.vramGb * USABLE, load = items.reduce((a, i) => a + i.load, 0), wSum = items.reduce((a, i) => a + (i.w || 0), 0), wUnknown = items.some(i => i.w == null);
    const bins = []; items.map(i => i.w || 0).sort((a, b) => b - a).forEach(w => { const bin = bins.find(x => x + w <= usable + 1e-9); if (bin === undefined) bins.push(w); else bins[bins.indexOf(bin)] += w; });
    const byMem = Math.max(1, bins.length), byLoad = Math.max(1, Math.ceil(load - 1e-9));
    return { ok: true, items, slow: items.filter(i => i.slow), usable, load, wSum, wUnknown, byMem, byLoad, machines: Math.max(byMem, byLoad) + (state.ha ? 1 : 0), plus: items.some(i => i.plus) };
  }
  const pkgGB = models => models.reduce((a, mod) => a + (modelInfo(mod).gb || 0), 0);
  /* speed of one request alone (lowest tested NP, 4K), best framework: the number that says whether two packages are comparable */
  function speed1(m, model) {
    let best = null;
    state.data.rows.filter(x => x.role === "main" && x.machine === m && x.model === model).forEach(r => { const c = ((r.by_input["4096"] || {}).cells || [])[0]; if (c && (!best || c.tps > best)) best = c.tps; });
    return best;
  }
  /* recommended models: every tested model that reaches 15 tok/s per request at 4K on this machine (any framework) */
  function modelsOf(m) {
    const out = [];
    for (const r of state.data.rows.filter(x => x.role === "main" && x.machine === m)) {
      const n4 = npAt(r, LENK()); if (!n4) continue;
      const g = k => ({ np: npAt(r, k), plus: plusAt(r, k) });
      out.push({ model: r.model, arch: r.arch, fw: r.framework, quant: r.format, n: { "4096": g("4096"), "8192": g("8192"), "16384": g("16384") } });
    }
    return out.sort((a, b) => (a.arch.startsWith("MoE") ? 0 : 1) - (b.arch.startsWith("MoE") ? 0 : 1) || b.n["4096"].np - a.n["4096"].np);
  }
  /* ✓ = highest NP that still keeps 15 tok/s, ✗ = first tested NP above it that does not ( + = nothing above was tested) */
  const sp = x => x == null ? "" : x >= 20 ? String(Math.round(x)) : x.toFixed(1);
  const npPills = n => '<span class="bs-npl">NP<small class="zhs">同時請求</small></span>' + ["4096", "8192", "16384"].map(k => { const v = n[k];
    const body = v.np ? "<b>✓" + v.np + (v.plus ? "+" : "") + "</b>" + (v.fail ? '<i class="bs-nf">✗' + v.fail + "</i>" : "") : v.fail ? '<b class="bad">✗' + v.fail + "</b>" : "<b>—</b>";
    const speed = v.np ? sp(v.tps) + (v.fail && v.ftps != null ? " → " + sp(v.ftps) : "") : v.fail && v.ftps != null ? sp(v.ftps) : "";
    return '<span class="bs-npp' + (v.np ? "" : " zero") + '"><span>' + LABEL[k] + " " + body + "</span>" + (speed ? '<small class="bs-npspd">' + speed + "</small>" : "") + "</span>"; }).join("");
  const nfOf = (r, k, thr) => { const cs = (r.by_input[k] || {}).cells || [], pass = npAt(r, k); const f = cs.find(c => c.np > pass && c.tps < thr); return f ? f.np : null; };
  /* models menu, level 1 = inference framework, level 2 (flies out to the right) = that framework's models with usable NP.
     Main rows count toward the 15 tok/s lists; "historical" rows (older runs, other parameters) are shown for completeness and marked. */
  const FW_ORDER = ["llama.cpp", "vLLM", "SGLang"];
  function fwMenu(m) {
    const by = {};
    state.data.rows.filter(r => (r.role === "main" || r.role === "historical") && r.machine === m).forEach(r => (by[r.framework] = by[r.framework] || []).push(r));
    return Object.keys(by).sort((a, b) => (FW_ORDER.indexOf(a) + 1 || 9) - (FW_ORDER.indexOf(b) + 1 || 9)).map(fw => ({ fw, rows: by[fw].sort((x, y) => npAt(y, "4096") - npAt(x, "4096") || (x.arch.startsWith("MoE") ? 0 : 1) - (y.arch.startsWith("MoE") ? 0 : 1)) }));
  }
  function failItem(r) {
    const per = ["4096", "8192", "16384"].map(k => { const cs = (r.by_input[k] || {}).cells || []; return cs.length ? '<span class="bs-nfl"><i>' + LABEL[k] + "</i>" + cs.map(c => '<span class="bs-nch">NP' + c.np + " <b>" + c.tps.toFixed(1) + "</b></span>").join("") + "</span>" : ""; }).join("");
    const lowest = Math.min(...["4096", "8192", "16384"].flatMap(k => ((r.by_input[k] || {}).cells || []).map(c => c.np)));
    return '<li><b>' + esc(MODEL_NAME[r.model] || r.model) + '</b> <span class="bs-tag ' + (r.arch.startsWith("MoE") ? "moe" : "dense") + '">' + esc(r.arch) + "</span> " + esc(r.format || "") + (r.role === "historical" ? ' <span class="bs-hist">older run</span>' : "") +
      '<div class="bs-nfs">' + per + "</div>" + (lowest > 1 ? '<small class="bs-nt">NP1 was not tested, so it is unknown whether one request works.</small>' : "") + "</li>";
  }
  function flyItem(r) {
    const thr = state.data.threshold_tps * MARGIN;
    const g = k => { const cs = (r.by_input[k] || {}).cells || [], tp = n => (cs.find(c => c.np === n) || {}).tps, np = npAt(r, k), fail = nfOf(r, k, thr); return { np, plus: plusAt(r, k), fail, tps: np ? tp(np) : null, ftps: fail ? tp(fail) : null }; };
    const n = { "4096": g("4096"), "8192": g("8192"), "16384": g("16384") };
    const any = n["4096"].np || n["8192"].np || n["16384"].np;
    const c0 = r.by_input["4096"].cells[0];
    return '<li><div class="bs-mi-h"><b>' + esc(MODEL_NAME[r.model] || r.model) + '</b> <span class="bs-tag ' + (r.arch.startsWith("MoE") ? "moe" : "dense") + '">' + esc(r.arch) + "</span>" + (r.role === "historical" ? ' <span class="bs-hist">older run</span>' : "") + '</div><div class="bs-mi-fw"><span>' + esc(r.format || "—") + '</span></div><div class="bs-mi-np">' + npPills(n) + "</div>" +
      (any ? "" : '<p class="bs-best">None reaches 15 tok/s' + (c0 ? ": best " + c0.tps.toFixed(1) + " tok/s at NP" + c0.np + ", 4K" : "") + "</p>") + "</li>";
  }
  const kv = (label, v) => "<dt>" + label + "</dt><dd>" + esc(v[0]) + "<small>" + esc(v[1]) + "</small></dd>";
  function renderArch() {
    $("bsMachines").innerHTML = VENDORS.map(v => {
      const ms = ARCH.filter(m => m.vendor === v[0]);
      if (!ms.length) return "";
      return '<div class="bs-vendor"><h3>' + esc(v[0]) + (v[1] !== v[0] ? zh(v[1]) : "") + "</h3>" + ms.map(m => {
        const img = m.photo ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.title) + '" loading="lazy">' : '<span class="bs-nophoto">Photo<br>to add</span>';
        let models = '<div class="bs-menu"><span class="bs-menu-bar">Models<small class="zhs">適用模型</small><i class="bs-count">—</i><span class="bs-caret" aria-hidden="true">▾</span></span></div><p class="bs-sum">Not measured with the same protocol yet</p>', size = '<span class="bs-big">—<small>Not measured with the same protocol yet</small></span>';
        if (state.data && m.measured) {
          const list = modelsOf(m.id), names = [...new Set(list.map(x => x.model))], moe = names.filter(n => list.find(x => x.model === n).arch.startsWith("MoE")).length;
          const fws = fwMenu(m.id);
          models = '<div class="bs-menu"><span class="bs-menu-bar">Models<small class="zhs">適用模型</small><i class="bs-count">' + names.length + '</i><span class="bs-caret" aria-hidden="true">▾</span></span>' +
            (fws.length ? '<div class="bs-pop bs-pop1"><p class="bs-pop-h">Inference framework<small class="zhs">推論框架</small></p><ul class="bs-fwlist">' + fws.map(g => { const any = r => npAt(r, "4096") || npAt(r, "8192") || npAt(r, "16384"), pass = g.rows.filter(any), low = g.rows.filter(r => !any(r)); const ok = new Set(g.rows.filter(r => r.role === "main" && npAt(r, LENK())).map(r => r.model)).size;
              return '<li class="bs-fwrow" tabindex="0"><span class="bs-fwname">' + esc(g.fw) + '</span><i class="bs-count' + (ok ? "" : " zero") + '">' + ok + '</i><span class="bs-arrow" aria-hidden="true">▸</span><div class="bs-fly"><div class="bs-fly-in">' + (pass.length ? "<ul>" + pass.map(flyItem).join("") + "</ul>" : '<p class="bs-verdict no">✗ No model reaches 15 tok/s<small class="zhs">沒有達標的模型</small></p>') +
                (low.length ? '<p class="bs-below">Below 15 tok/s<small class="zhs">未達標</small></p><ul class="bs-failist">' + low.map(failItem).join("") + "</ul>" : "") + "</div></div></li>"; }).join("") +
              '</ul>' + '<a class="bs-dl2" href="' + ({ B70: "stress-test-b70.html", B60: "stress-test-b60.html", AISO1: "stress-test-aiso1.html" })[m.id] + '">Full benchmark data<small class="zhs">完整測試資料</small> →</a>' + bul(['<b>Number</b> = models that pass', '<b>✓</b> works up to this NP', '<b>✗</b> fails from this NP', '<b>+</b> more untested', '<b>small</b> = tok/s per request, at ✓ → at ✗']).replace('class="bs-bul"', 'class="bs-bul bs-pop-note"') + '</div>' : "") + "</div>" +
            '<p class="bs-sum">' + (list.length ? moe + " MoE · " + (names.length - moe) + " Dense" : "None reaches 15 tok/s") + "<small>keep 15 tok/s per request at " + LABEL[LENK()] + "</small></p>";
          const n = scn().people;
          const one = () => { const r = bundle(m.id, setModels(), n); return '<p class="bs-line"><span class="bs-big">' + unitText(r.machines) + "<small>" + r.wSum.toFixed(0) + " GB in memory</small></span>" + (r.slow.length ? '<span class="bs-warn">⚠ ' + esc(r.slow.map(x => (SHORT[x.mod] || x.mod) + (x.tps != null ? " " + Math.round(x.tps) + " tok/s" : "")).join(", ")) + " under 15</span>" : "") + "</p>"; };
          size = one() + '<button type="button" class="bs-why-link" data-why="' + m.id + '">Why<small class="zhs">為什麼</small></button>';
        }
        return '<article class="bs-card" data-m="' + m.id + '"><div class="bs-main">' +
          '<div class="bs-id">' + img + "<div><b>" + esc(m.title) + "</b><span>" + esc(m.sub) + " · " + esc(m.zh) + "</span></div></div>" +
          '<div class="bs-blk"><h4>Specs<small>基本資訊</small></h4><dl class="bs-kv">' + kv("VRAM", m.vram) + kv("DRAM", m.dram) + kv("SSD", m.ssd) + kv("Backend", m.backend) + "</dl></div>" +
          '<div class="bs-blk bs-models" tabindex="0">' + models + "</div>" +
          '<div class="bs-blk"><h4>Machines needed<small>所需台數</small></h4><span class="bs-for-sc">' + scn().people + " people · " + LABEL[LENK()] + "</span>" + size + "</div></div>" +
          '<button type="button" class="bs-more" aria-expanded="' + (!!state.open[m.id]) + '" data-more="' + m.id + '">Details<small class="zhs">細節</small> ' + (state.open[m.id] ? "▴" : "▾") + "</button>" +
          '<div class="bs-detail"' + (state.open[m.id] ? "" : " hidden") + ">" + m.detail.map(d => "<div><h5>" + esc(d[0]) + "</h5><p>" + esc(d[1]) + "<small>" + esc(d[2]) + "</small></p></div>").join("") + "</div></article>";
      }).join("") + "</div>";
    }).join("");
  }
  $("bsArchNote").innerHTML = '<ul class="bs-bul bs-notel">' +
    "<li>One model at a time" + zh("一次一個模型") + "<ul><li>Every number is a single-model benchmark</li><li>Several models on one machine: not benchmarked yet</li></ul></li>" +
    "<li>Assumption, not measured" + zh("假設，不是實測") + "<ul><li>3 of every 10 people ask at once</li></ul></li>" +
    "<li>A range like 1–2 = exactly 15 tok/s to 15 tok/s plus a 7% margin</li><li>Counted at 15+ tok/s with a 7% margin; slower models still get a count and a ⚠" + zh("需 15 tok/s 以上且留 7% 餘裕；較慢的標 ⚠") + "</li>" +
    '<li>Typical input<ul><li>Chat: 69.5 tokens a turn (<a href="https://arxiv.org/abs/2309.11998">LMSYS-Chat-1M</a>)</li><li>Typical: ≈6K (<a href="https://arxiv.org/abs/2601.10088">OpenRouter</a>)</li><li>Support, Document, Agent, Coding: vendor posts, rough</li><li>Above 16K: not tested</li></ul></li>' +
    '<li class="bs-warn">B60 llama.cpp ran at batch 4096, B70 and AISO1 at 1024: not an exact match' + zh("B60 的 llama.cpp 用 batch 4096，B70、AISO1 用 1024") + "</li></ul>";


  const tabs = (id, list, key) => {
    $(id).innerHTML = list.map(v => '<button type="button" role="tab" data-k="' + key + '" data-v="' + v + '" aria-selected="' + (String(state[key]) === String(v)) + '" class="' + (String(state[key]) === String(v) ? "on" : "") + '">' + esc(v === "All" ? "All" : v) + (v === "All" ? zh("全部") : "") + "</button>").join("");
  };
  /* usage intensity = share of people waiting for an answer at the same moment; each level shows how many people every machine serves at that level (best MoE model) */
  function renderPk() {
    const typeMix = ms => { const moe = ms.filter(x => modelInfo(x).arch.startsWith("MoE")).length; return [moe ? "MoE ×" + moe : "", ms.length - moe ? "Dense ×" + (ms.length - moe) : ""].filter(Boolean).join(" · "); };
    const row = x => { const m = x.models[0], i = modelInfo(m); return '<div class="bs-setrow' + (x.id === state.set ? " on" : "") + '" data-set="' + x.id + '" tabindex="0" role="radio" aria-checked="' + (x.id === state.set) + '"><span class="bs-setrow-t"><b>' + esc(x.en) + '</b> <span class="bs-tag ' + (i.arch.startsWith("MoE") ? "moe" : "dense") + '">' + esc(i.arch.replace(" (hybrid)", "")) + '</span><small><span class="bs-qp">' + esc(quantOf(m).fam) + '</span> ' + esc((MODEL_B[m] || "").match(/\(.*\)/) ? (MODEL_B[m] || "").match(/\(.*\)/)[0] : "") + '</small></span><span class="bs-setrow-gb">' + (i.gb != null ? i.gb : "—") + '<small>GB</small></span></div>'; };
    const hid = SETS.filter(x => x.more), open = state.moreOpen, selHid = hid.find(x => x.id === state.set);
    $("bsPk").innerHTML = SETS.filter(x => !x.more).map(row).join("") + '<div class="bs-setrow more' + (!open && selHid ? " has-sel" : "") + '" data-toggle="more" tabindex="0" role="button" aria-expanded="' + open + '"><span class="bs-setrow-t"><b>More models</b>' + zh('更多模型') + '<small>' + (!open && selHid ? esc(selHid.en) + ' selected' : 'Dense: slow on every machine') + '</small></span><span class="bs-setrow-gb">' + (open ? '▴' : '▾') + '</span></div>' + (open ? hid.map(row).join("") : "") +
      '<div class="bs-setrow soon" title="Not benchmarked yet: several models running on one machine"><span class="bs-setrow-t"><b>Several models on one machine</b>' + zh("多模型同機") + '</span><span class="bs-setrow-gb">soon</span></div>';
  }
  /* each team-size card: a small table. Rows = machines, columns = package A and B (named by their model), cell = machines needed */
  /* dashboard: shows the chosen model set, the input, and how many machines of each kind (columns = team size, click one to drive the cards below) */
  function renderDash() {
    const c = curSet(), u = curUse();
    $("bsSetSum").innerHTML = '<p class="bs-setname">Model<small class="zhs">模型</small> <b>' + esc(c.en) + '</b></p><div class="bs-setchips">' + c.models.map(m => { const i = modelInfo(m), dead = ARCH.filter(x => x.measured).every(x => !pkgBest(x.id, m)); return '<span class="bs-mchip' + (dead ? " dead" : "") + '"><b>' + esc(SHORT[m] || m) + '</b><span class="bs-tag ' + (i.arch.startsWith("MoE") ? "moe" : "dense") + '">' + esc(i.arch.replace(" (hybrid)", "")) + '</span><span class="bs-qp" title="' + esc(quantOf(m).fmt) + '">' + esc(quantOf(m).fam) + "</span><small>" + esc([MODEL_B[m], i.gb != null ? i.gb + " GB" : ""].filter(Boolean).join(" · ")) + "</small>" + (dead ? '<small class="deadnote">⚠ under 15 tok/s on every machine at ' + LABEL[LENK()] + "</small>" : "") + "</span>"; }).join("") + '</div>';
    $("bsInSum").innerHTML = '<p class="bs-setname">Scenario<small class="zhs">情境</small> <b>' + (u ? u.let + " · " + esc(u.en) + " <span class=\"bs-rng\">(" + esc(u.rng) + ")</span>" : "Custom") + "</b>" + (u ? zh(u.zh) : zh("自訂")) + '<span class="bs-lenbig">' + LABEL[LENK()] + "</span>" + (u && u.beyond ? ' <span class="bs-warn" title="Longer in practice than the 16K tested">⚠</span>' : "") + "</p>";
  }
  function renderScn() {
    const pct = v => Math.max(0, Math.min(100, v / 16 * 100)), sel = pct(Number(LENK()) / 1024);
    $("bsScn").innerHTML = SCENS.map(x => {
      let bar;
      if (x.pt != null) bar = '<i class="bs-pt" style="left:' + pct(x.pt) + '%"></i>';
      else { const l = pct(x.lo), r = pct(x.hi), cut = x.hi > 16; bar = '<i class="bs-bar' + (cut ? " open" : "") + '" style="left:' + l + "%;width:" + Math.max(1.5, (cut ? 100 : r) - l) + '%"></i>'; }
      return '<div class="bs-rc-row' + (x.id === state.use ? " on" : "") + '" data-use="' + x.id + '" tabindex="0" role="radio" aria-checked="' + (x.id === state.use) + '"><span class="bs-rc-lab"><i class="bs-let">' + x.let + '</i><b>' + esc(x.en) + '</b> <span class="bs-rng">(' + esc(x.rng) + ")</span>" + zh(x.zh) + '</span><div class="bs-rc-plot"><div class="bs-rc-in">' + bar + '<i class="bs-sel" style="left:' + sel + '%"></i></div></div><span class="bs-tip">' + (/\+$/.test(x.rng) ? "Input tokens " + esc(x.rng) : "Input tokens between " + esc(x.rng.replace(/^(\d+)–/, "$1K–"))) + (x.beyond ? " · tested at " + x.k + "K only" : "") + "</span></div>";
    }).join("");
  }
  /* speed table: tok/s per request of the chosen model at the chosen length, per machine and NP; opens as a see-through sheet over the numbers */
  /* AISO1 NP5 cases that were really attempted and gave no numbers (status DEFERRED in the 2026-11-11 handoff, Gemma26 8K and 16K). Other AISO1 NP5 cases were never run, so they stay "—". */
  const AISO1_NP5_OVERLOAD = { Gemma26: [8192, 16384] };
  function renderSpd() {
    const box = $("bsSpdPanel"); box.hidden = !state.spd; $("bsSpd").setAttribute("aria-pressed", String(!!state.spd));
    if (!state.spd || !state.data) return;
    const k = LENK(), mod = setModels()[0], NPS = [1, 2, 4, 5], lim = state.data.threshold_tps * MARGIN;
    const rows = ARCH.filter(m => m.measured).map(m => { let best = null; state.data.rows.filter(r => r.role === "main" && r.machine === m.id && r.model === mod).forEach(r => { const cs = (r.by_input[k] || {}).cells || []; if (cs.length && (!best || cs[0].tps > best.cs[0].tps)) best = { r, cs }; });
      return "<tr><th scope=\"row\">" + esc(m.name) + (best ? "<small>" + esc(best.r.framework) + "</small>" : "") + "</th>" + NPS.map(n => { const c = best && best.cs.find(x => x.np === n); return c ? '<td class="' + (c.tps >= lim ? "ok" : "no") + '">' + sp(c.tps) + "</td>" : (m.id === "AISO1" && n === 5 && (AISO1_NP5_OVERLOAD[mod] || []).indexOf(Number(k)) >= 0 ? '<td class="ov" title="Tested on AISO1, could not run (overload), no numbers">Overload<small>超負載</small></td>' : "<td>—</td>"); }).join("") + "</tr>"; }).join("");
    box.innerHTML = '<div class="bs-spd-h"><b>' + esc(curSet().en) + " · " + LABEL[k] + '</b><small>tok/s per request<span class="zhs">每個請求速度</span></small></div><table><thead><tr><th></th>' + NPS.map(n => "<th>NP" + n + "</th>").join("") + "</tr></thead><tbody>" + rows + '</tbody></table><small class="bs-spd-f"><span class="okc">green</span> = counts (' + sp(lim) + '+) · <span class="noc">red</span> = too slow</small>';
  }
  function renderShare() {
    if (!state.data) { $("bsShare").innerHTML = "…"; return; }
    const ms = ARCH.filter(m => m.measured);
    const warnText = r => r.slow.length === 1 ? "⚠ " + (SHORT[r.slow[0].mod] || r.slow[0].mod) + (r.slow[0].tps != null ? " " + Math.round(r.slow[0].tps) + " tok/s" : "") : "⚠ " + r.slow.length + " slow";
    const cellOf = (m, c) => { const r = bundle(m.id, setModels(), c.people); const lo = (() => { state.raw = true; const x = bundle(m.id, setModels(), c.people).machines; state.raw = false; return x; })(), txt = lo < r.machines ? lo + "–" + r.machines : String(r.machines); return '<td class="bs-dn' + (r.slow.length ? " warn" : "") + (c.id === state.scn ? " on" : "") + '"' + (r.slow.length ? ' title="' + esc(r.slow.map(x => (SHORT[x.mod] || x.mod) + (x.tps != null ? " " + x.tps.toFixed(1) + " tok/s" : "")).join(", ") + " is under 15 tok/s here: more machines will not make it faster") + '"' : "") + " title=\"" + (lo < r.machines ? lo + " = exactly 15 tok/s, " + r.machines + " = with a 7% margin" : "") + "\">" + txt + '<i class="bs-u">台</i>' + (r.slow.length ? '<small class="bs-wm">⚠</small>' : "") + "</td>"; };
    $("bsShare").innerHTML = '<table class="bs-dtbl"><thead><tr><th>Machines needed<small class="zhs">所需台數</small></th>' + SCALES.map(c => '<th class="' + (c.id === state.scn ? "on" : "") + '"><button type="button" data-k="scn" data-v="' + c.id + '"><b>' + c.people + "</b><small>people 人</small></button></th>").join("") + "</tr></thead><tbody>" +
      ms.map(m => '<tr><th scope="row">' + (m.photo ? '<img class="bs-dimg" src="' + esc(m.photo) + '" alt="' + esc(m.title) + '" loading="lazy">' : "") + esc(m.name) + "<small>" + esc(m.unit) + "</small></th>" + SCALES.map(c => cellOf(m, c)).join("") + "</tr>").join("") + "</tbody></table>";
    $("bsHA").checked = state.ha;
    renderSpd();
  }
  const speedCell = (c, thr) => {
    if (!c || !c.np) return '<span class="bs-none">—</span>';
    const close = c.tps < thr * 1.07;
    return '<span class="bs-np">NP' + c.np + (c.reached_top ? "+" : "") + " <i>· " + c.tps.toFixed(1) + "</i>" + (close ? ' <span class="bs-warn" title="Close to the threshold">⚠</span>' : "") + "</span>" + (c.ttft_s != null ? "<small>TTFT " + c.ttft_s + " s</small>" : "");
  };
  function renderCap() {
    const d = state.data, thr = d.threshold_tps;
    tabs("bsMachine", ["All", "B60", "B70", "AISO1"], "machine"); tabs("bsArchTab", ["All", "MoE", "Dense"], "arch");
    const keep = r => (state.machine === "All" || r.machine === state.machine) && (state.arch === "All" || r.arch.startsWith(state.arch));
    const row = r => '<tr class="' + (r.role === "reference" ? "bs-ref" : "") + '"><td><b>' + esc(r.machine) + "</b></td><td>" + esc(r.framework) + "</td><td>" + esc(r.model) + '</td><td><span class="bs-tag ' + (r.arch.startsWith("MoE") ? "moe" : "dense") + '">' + esc(r.arch) + "</span></td><td>" + esc(r.format) + "</td>" +
      ["4096", "8192", "16384"].map(k => "<td>" + speedCell(r.by_input[k], thr) + "</td>").join("") + "</tr>";
    const main = d.rows.filter(r => r.role === "main" && keep(r) && Object.values(r.by_input).some(v => v.np));
    const ref = d.rows.filter(r => r.role === "reference" && keep(r));
    const none = d.rows.filter(r => r.role === "main" && keep(r) && !Object.values(r.by_input).some(v => v.np));
    $("bsCapBody").innerHTML = main.map(row).join("") + (ref.length ? '<tr><td colspan="8"><b>Reference · AISO1 2026-11-09 retest</b><small>參數未對齊，僅供參考</small></td></tr>' + ref.map(row).join("") : "");
    $("bsCapNote").innerHTML = bul(["Cell = highest tested NP · tok/s per request · mean TTFT", "<b>+</b> = the largest NP tested still passes", '<span class="bs-warn">⚠</span> = within 7% of 15', "NP = requests at once, not people"].concat(none.length ? ["Never reaches 15<ul>" + none.map(r => "<li>" + esc(r.machine + " · " + r.framework + " · " + r.model) + "</li>").join("") + "</ul>"] : [])) + '<p class="bs-zhnote">每格＝已測最高 NP · 每個請求 tok/s · 平均 TTFT；＋＝更高沒測；⚠＝離 15 不到 7%；NP 是同時請求數，不是人數</p>';

  }

  /* how many machines: needed concurrent = ceil(people x share); N = ceil(needed / NP per machine); N+1 -> (N-1) x capacity >= needed */
  const GATES = [
    ["part", "1 · Requirements", "業務需求", "Team size only. No peak RPS or latency target yet."],
    ["part", "2 · Fits in memory", "裝得下", "Measured per model. Other models: use Sizing."],
    ["done", "3 · Reaches the load", "撐得住", "Measured NP at 15 tok/s per request."],
    ["todo", "4 · Latency (TTFT p95)", "延遲", "Only mean TTFT is on the platform."],
    ["part", "5 · Survives a failure", "故障備援", "+1 spare machine switch above."],
    ["todo", "6 · Real purchase (BOM)", "採購配置", "Network, CPU RAM, storage, power not modelled."],
  ];
  $("bsGates").innerHTML = GATES.map(g => '<li><b class="' + g[0] + '">' + (g[0] === "done" ? "✓ " : g[0] === "part" ? "◐ " : "○ ") + esc(g[1]) + "</b>" + zh(g[2]) + "<small>" + esc(g[3]) + "</small></li>").join("");


  /* why: fits -> speed per request -> people, for one machine + type + model, straight from the measured cells */
  function whyRows() { return state.data.rows.filter(r => r.role === "main" && r.machine === state.why.machine && r.arch.startsWith(state.why.type)); }
  const keyOf = r => r.model + "|" + r.framework;
  function renderWhy() {
    const d = state.data, w = state.why, thr = d.threshold_tps, m = ARCH.find(x => x.id === w.machine);
    const btn = (k, v, text) => '<button type="button" role="tab" data-w="' + k + '" data-v="' + esc(v) + '" aria-selected="' + (w[k] === v) + '" class="' + (w[k] === v ? "on" : "") + '">' + text + "</button>";
    $("bsWhyMachine").innerHTML = ARCH.filter(x => x.measured).map(x => btn("machine", x.id, esc(x.name))).join("");
    $("bsWhyType").innerHTML = ["MoE", "Dense"].map(t => btn("type", t, t)).join("");
    const rows = whyRows();
    if (!rows.some(r => keyOf(r) === w.key)) { const b = bestFor(w.machine, w.type); w.key = rows.length ? keyOf(b ? b.r : rows[0]) : null; }
    $("bsWhyModel").innerHTML = rows.map(r => btn("key", keyOf(r), esc(MODEL_NAME[r.model] || r.model) + " <small>" + esc(r.framework) + "</small>")).join("") || '<span class="bs-none">No tested model of this type</span>';
    const r = rows.find(x => keyOf(x) === w.key);
    if (!r) { $("bsWhy").innerHTML = ""; return; }
    const cells = k => r.by_input[k].cells, tested = cells("4096").map(c => c.np), top = tested[tested.length - 1];
    const KS = [LENK()], np = Math.min(...KS.map(k => npAt(r, k))), plus = KS.every(k => npAt(r, k) !== np || plusAt(r, k)), thrOk = thr * MARGIN;
    const next = tested.find(n => n > np);
    const at = (k, n) => (cells(k).find(c => c.np === n) || {});
    const limCells = new Set(), failing = [];
    const checkNp = np > 0 ? next : tested[0];
    if (checkNp) KS.forEach(k => { const c = at(k, checkNp); if (c.tps != null && c.tps < thrOk) { limCells.add(k + "|" + checkNp); failing.push(LABEL[k] + " = " + c.tps.toFixed(1) + (c.tps >= thr ? " (borderline)" : "")); } });
    const grid = '<div class="bs-wrap"><table class="bs-grid"><thead><tr><th>NP<small>同時請求</small></th>' + ["4096", "8192", "16384"].map(k => "<th>Input " + LABEL[k] + "</th>").join("") + "</tr></thead><tbody>" +
      tested.map(n => "<tr><th>NP" + n + "</th>" + ["4096", "8192", "16384"].map(k => { const c = at(k, n); return c.tps == null ? "<td>—</td>" : '<td class="' + (c.tps >= 20 ? "ok" : c.tps >= 15 ? "t-y" : c.tps >= 10 ? "t-o" : "no") + (limCells.has(k + "|" + n) ? " lim" : "") + '">' + c.tps.toFixed(1) + "<small>TTFT " + (c.ttft_s != null ? c.ttft_s + " s" : "—") + "</small></td>"; }).join("") + "</tr>").join("") + "</tbody></table></div>";
    const tk = at(LENK(), np).ttft_s, nPeople = scn().people, need = needFor(nPeople), units = np > 0 ? unitsFor(np, nPeople) : 0;
    const step2 = np === 0 ? "Not enough even at NP1 (" + (failing.join(", ") || "see table") + ")."
      : plus ? "NP" + np + " is the highest tested and still works (+ = more untested)."
      : "NP" + np + " works. NP" + next + " drops to " + (failing.join(" and ") || "under " + thrOk.toFixed(0)) + ".";
    $("bsWhy").innerHTML =
      '<div class="bs-step"><h4>1 · Fits in memory<small class="zhs">裝得下</small></h4><p class="bs-formula">Memory needed ≈ weights + KV cache + runtime' + zh("所需記憶體 ≈ 權重 + KV cache + 執行期") + '</p><dl class="bs-kv2">' +
        "<dt>Weights<small class=\"zhs\">權重</small></dt><dd>" + (r.weights_gb != null ? "<b>" + r.weights_gb + " GB</b> " : "<b>—</b> ") + '<small>' + esc(r.format || "") + (r.weights_gb != null ? "" : " · file size not on the platform") + "</small></dd>" +
        "<dt>KV cache</dt><dd><b>" + top + " × " + d.per_slot_context.toLocaleString("en-US") + " = " + (top * d.per_slot_context).toLocaleString("en-US") + " tokens</b><small>largest run, NP" + top + "</small></dd>" +
        "<dt>Machine memory<small class=\"zhs\">機器記憶體</small></dt><dd><b>" + m.vramGb + " GB</b></dd>" +
        '<dt>Result<small class="zhs">結果</small></dt><dd class="ok"><b>✓ Ran at NP' + top + " without running out of memory</b><small>measured</small></dd></dl></div>" +
      '<div class="bs-step"><h4>2 · Speed each request gets<small class="zhs">每個請求的速度</small></h4><p>tok/s per request: <span class="t-g">20+</span> · <span class="t-y">15–20</span> · <span class="t-o">10–15</span> · <span class="t-r">under 10</span>. Counted at ' + thr + "+ with a 7% margin.</p>" + grid + "<p>" + esc(step2) + "</p></div>" +
      '<div class="bs-step"><h4>3 · This model alone<small class="zhs">只跑這個模型</small></h4>' + (np > 0 ? '<p class="bs-result">NP' + np + (plus ? "+" : "") + " per machine ≈ " + Math.floor(np / SHARE) + (plus ? "+" : "") + ' people if all of them used only this model</p><p>First word after about ' + (tk != null ? tk + " s at " + LABEL[LENK()] : "—") + ".<small>Several models on one machine: see How it is calculated.</small></p>" : '<p class="bs-none">Not enough: under ' + thr + " tok/s even for one request.</p>") + "</div>";
  }


  /* evidence overview: one cell per model x machine = the most concurrent requests that still get 15 tok/s (best framework), for one input length */
  const MX_MODELS = ["Gemma26", "Laguna", "Nemotron", "Gemma31"], MX_MACHINES = ["B60", "B70", "AISO1"];
  function mxCell(machine, model, k) {
    let best = null;
    state.data.rows.filter(r => r.role === "main" && r.machine === machine && r.model === model).forEach(r => {
      const c = okAt(r, k); if (!c.np) return;
      if (!best || c.np > best.np || (c.np === best.np && c.tps > best.tps)) best = { np: c.np, tps: c.tps, plus: c.plus, fw: r.framework, row: r };
    });
    return best;
  }
  function renderMatrix() {
    const k = state.mxInput, archOf = m => (state.data.rows.find(r => r.model === m) || {}).arch || "";
    $("bsMxInput").innerHTML = ["4096", "8192", "16384"].map(v => '<button type="button" role="tab" data-k="mxInput" data-v="' + v + '" aria-selected="' + (k === v) + '" class="' + (k === v ? "on" : "") + '">' + LABEL[v] + "</button>").join("");
    const people = scn().people, need = needFor(people);
    const cells = {}; let top = null;
    MX_MODELS.forEach(m => MX_MACHINES.forEach(x => { const c = mxCell(x, m, k); cells[m + "|" + x] = c; if (c && (!top || c.np > top.np)) top = { ...c, machine: x, model: m }; }));
    const maxNp = top ? top.np : 0;
    $("bsMxHead").innerHTML = '<p class="bs-load">' + people + " people → <b>" + need + " requests at once</b></p>" +
      '<p class="bs-legend"><span class="bs-key ok">Enough<small class="zhs">夠用</small></span><span class="bs-key no">Not enough<small class="zhs">不夠</small></span><span class="bs-key top">★ Highest NP<small class="zhs">最高</small></span></p>';

    $("bsMatrix").innerHTML = "<thead><tr><th>Model<small>模型</small></th>" + MX_MACHINES.map(x => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      MX_MODELS.map(m => { const a = archOf(m).startsWith("MoE") ? "moe" : "dense"; return '<tr><th scope="row">' + esc(MODEL_NAME[m] || m) + ' <span class="bs-tag ' + a + '">' + esc(archOf(m)) + "</span></th>" + MX_MACHINES.map(x => { const c = cells[m + "|" + x];
        if (!c) return '<td class="mx no"><b>—</b><small>under 15 tok/s</small></td>';
        const state_ = c.np === maxNp ? "top" : c.np >= need ? "ok" : "no";
        return '<td class="mx ' + state_ + '" tabindex="0" data-mx="' + x + "|" + m + '" title="' + esc(c.fw + " · " + c.tps.toFixed(1) + " tok/s per request") + '">' + (state_ === "top" ? '<i class="bs-star">★</i>' : "") + "<b>NP" + c.np + (c.plus ? "+" : "") + "</b><small>" + esc(c.fw) + "</small></td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
    $("bsMxNote").innerHTML = "NP = requests at once. + = more untested. Click a cell for why." + zh("NP＝同時請求數；＋＝更高沒測；點一格看原因。");
  }
  const EV = [["matrix", "Overview", "總覽"], ["why", "Why this number", "推導"], ["all", "All data", "全部數據"]];
  function renderEv() {
    $("bsEvTabs").innerHTML = EV.map(e => '<button type="button" role="tab" data-ev="' + e[0] + '" aria-selected="' + (state.ev === e[0]) + '" class="' + (state.ev === e[0] ? "on" : "") + '">' + e[1] + zh(e[2]) + "</button>").join("");
    document.querySelectorAll(".bs-pane").forEach(p => { p.hidden = p.dataset.pane !== state.ev; });
  }
  const openEvidence = tab => { state.ev = tab; renderEv(); $("secEvidence").scrollIntoView({ behavior: "smooth", block: "start" }); };


  /* the whole trail: people -> requests at once -> split over the models -> each model's share of one machine -> memory -> machines */
  const bul = items => '<ul class="bs-bul">' + items.map(x => "<li>" + x + "</li>").join("") + "</ul>";
  const f1 = x => (Math.round(x * 10) / 10).toString();

  /* the scientific method, with this selection's numbers filled in (formulas follow the Sizing calculator: M = (W + KV + runtime) x (1 + headroom), GPUs = ceil(M / (VRAM x usable)), servers = max(by memory, by throughput), HA) */
  function formulaBlock(n, need, thr) {
    const models = setModels(), ms = ARCH.filter(m => m.measured).map(m => ({ m, r: bundle(m.id, models, n) })).sort((a, b) => a.r.machines - b.r.machines), e = ms[0], it = e.r.items[0], lim = thr * MARGIN;
    const wt = e.r.wSum, usable = e.m.vramGb * USABLE;
    return '<div class="bs-fm"><h4 class="bs-pk">Formulas<small class="zhs">公式</small> <span class="bs-pkm">example: ' + esc(e.m.name) + "</span></h4><ol>" +
      "<li><b>Requests at once</b><code>C = ⌈ N × p ⌉ = ⌈ " + n + " × " + Math.round(SHARE * 100) + "% ⌉ = " + need + "</code><small>N people, p = share asking at once (assumption)</small></li>" +
      "<li><b>Memory</b><code>M = ( W + KV + runtime ) × ( 1 + headroom )</code><code>W = " + (it.w != null ? it.w + " GB" : "—") + " (model file) · KV = 2 × layers × KV heads × head dim × bytes × tokens × C</code><small>KV and runtime are not calculated here (no architecture data for these models): the measured run at the largest NP stands in for them. Use Sizing for other models.</small></li>" +
      "<li><b>Fits</b><code>GPUs ≥ ⌈ M ÷ ( VRAM × 90% ) ⌉ = ⌈ " + f1(wt) + " ÷ " + f1(usable) + " ⌉ = " + Math.max(1, Math.ceil(wt / usable)) + "</code></li>" +
      "<li><b>Speed</b><code>v( NP ) = Aggregate( NP ) ÷ NP ≥ " + thr + " × 1.07 = " + f1(lim) + " tok/s</code><code>NP* = the largest measured NP that passes = " + it.cap + (it.plus ? "+" : "") + (it.slow ? " (none passes: NP1 used, marked ⚠)" : "") + "</code><small>Aggregate includes the wait for the first token</small></li>" +
      "<li><b>Machines</b><code>⌈ C ÷ NP* ⌉ = ⌈ " + need + " ÷ " + it.cap + " ⌉ = " + Math.ceil(need / it.cap) + "</code><code>with a spare: ( N − 1 ) × NP* ≥ C</code></li></ol></div>";
  }
  function renderCalc() {
    if (!state.data) return;
    const n = scn().people, need = needFor(n), thr = state.data.threshold_tps, machines = ARCH.filter(m => m.measured);
    const pack = code => {
      const models = setModels(), k = models.length, each = k === 1 ? need : n * SHARE / k, res = machines.map(m => bundle(m.id, models, n));
      const head = "<tr><th>" + (k === 1 ? "1 model" : k + " models") + "</th>" + machines.map(m => "<th>" + esc(m.name) + "</th>").join("") + "</tr>";
      const rows = models.map((mod, idx) => "<tr><th scope=\"row\">" + esc(SHORT[mod] || mod) + "<small>" + (modelInfo(mod).gb != null ? modelInfo(mod).gb + " GB · " : "") + esc(modelInfo(mod).arch.replace(" (hybrid)", "")) + "</small></th>" +
        res.map(r => { const it = r.items[idx]; return "<td>" + f1(each) + " ÷ NP" + it.cap + (it.plus ? "+" : "") + " = <b>" + f1(it.load) + "</b><small>" + esc(it.fw) + (it.slow ? " · ⚠ " + (it.tps != null ? Math.round(it.tps) + " tok/s" : "slow") : "") + "</small></td>"; }).join("") + "</tr>").join("");
      const sum = [
        ["② Memory", res.map(r => r.ok ? '<td><b class="' + (r.byMem > 1 ? "noc" : "okc") + '">' + (r.byMem > 1 ? "✗" : "✓") + "</b> " + f1(r.wSum) + (r.wUnknown ? "+" : "") + " / " + r.usable.toFixed(0) + " GB" + (r.byMem > 1 ? "<small>needs " + r.byMem + " machines</small>" : "") + "</td>" : "<td>—</td>")],
        ["④ Total load", res.map(r => r.ok ? "<td>" + f1(r.load) + " → <b>" + r.byLoad + "</b></td>" : "<td>—</td>")],
        ["⑤ Machines" + (state.ha ? " (+1)" : ""), res.map(r => r.ok ? '<td><b class="bs-n">' + r.machines + "</b></td>" : '<td class="bs-none">✗</td>')],
        ["Input 4K · 8K · 16K", machines.map(m => "<td>" + LENS.map(k => { const r = bundle(m.id, models, n, [k]); return r.ok ? "<b>" + r.machines + "</b>" : "✗"; }).join(' · ') + "</td>")],
      ].map(x => '<tr class="bs-sumrow"><th scope="row">' + x[0] + "</th>" + x[1].join("") + "</tr>").join("");
      const ok = res.map((r, i) => r.ok ? { m: machines[i], n: r.machines } : null).filter(Boolean).sort((a, b) => a.n - b.n)[0];
      return '<h4 class="bs-pk">' + esc(curSet().en) + zh(curSet().zh) + ' <span class="bs-pkm">' + pkgGB(models).toFixed(1) + " GB</span></h4>" +
        '<p class="bs-eq2">' + n + " × " + Math.round(SHARE * 100) + "% = <b>" + need + "</b> at once" + (k > 1 ? " ÷ " + k + " models = <b>" + f1(each) + "</b> each" : "") + "</p>" +
        '<div class="bs-wrap"><table class="bs-trail"><thead>' + head + "</thead><tbody>" + rows + sum + "</tbody></table></div>" +
        '<p class="bs-rec">Fewest: <b>' + (ok ? esc(ok.m.name) + " × " + ok.n : "none") + "</b></p>";
    };
    $("bsCalcBody").innerHTML = '<div class="bs-share-note"><b>' + Math.round(SHARE * 100) + "%</b>" + bul(["3 of every 10 people wait for an answer at the same moment", "Our assumption, not measured", "NVIDIA enterprise-RAG example: 10% for 1,000 people"]) + "</div>" +
      bul(["NP = the most requests one machine holds at " + thr + "+ tok/s (" + LABEL[LENK()] + ", measured)", "Machines = requests at once ÷ NP, rounded up"]).replace('class="bs-bul"', 'class="bs-bul bs-how"') + formulaBlock(n, need, thr) + pack("S") +
      bul(["Weights only, 90% of memory usable", 'Other models: <a href="sizing.html">Sizing</a>']).replace('class="bs-bul"', 'class="bs-bul bs-foot3"');
  }
  /* the calculation opens inside the Result panel; it opens by itself after each pick on the left */
  const calcPanel = () => $("bsCalcPanel");
  const setCalc = open => { const p = calcPanel(); state.calcOpen = open; $("bsCalc").setAttribute("aria-expanded", String(open)); clearTimeout(p._t);
    /* curtain: unfolds from the top-right corner toward the bottom-left, folds back the same way */
    if (open) { renderCalc(); if (p.hidden) { p.hidden = false; void p.offsetWidth; } p.classList.add("open"); }
    else { p.classList.remove("open"); p._t = setTimeout(() => { if (!state.calcOpen) p.hidden = true; }, 560); } };

  function renderAll() { if (state.data) { renderPk(); renderDash(); renderScn(); } renderShare(); renderArch(); renderEv(); if (state.calcOpen) renderCalc(); if (state.data) { renderMatrix(); renderWhy(); renderCap(); } }
  document.addEventListener("mouseover", e => {
    const row = e.target.closest(".bs-fwrow"); if (!row) return;
    const fly = row.querySelector(".bs-fly"), r = row.getBoundingClientRect();
    fly.classList.toggle("left", r.right + 540 > window.innerWidth && r.left > 540);
  });
  document.addEventListener("click", e => {
    const ev = e.target.closest("button[data-ev]");
    if (ev) { state.ev = ev.dataset.ev; renderEv(); return; }
    const mx = e.target.closest("td[data-mx]");
    if (mx && state.data) { const [mm, md] = mx.dataset.mx.split("|"), c = mxCell(mm, md, state.mxInput); state.why.machine = mm; state.why.type = c.row.arch.startsWith("MoE") ? "MoE" : "Dense"; state.why.key = c.row.model + "|" + c.row.framework; renderWhy(); openEvidence("why"); return; }
    const wb = e.target.closest("button[data-w]");
    if (wb && state.data) { state.why[wb.dataset.w] = wb.dataset.v; if (wb.dataset.w !== "key") state.why.key = null; renderWhy(); return; }
    const wl = e.target.closest("button[data-why]");
    if (wl && state.data) { const bA = setModels().map(mod => pkgBest(wl.dataset.why, mod)).filter(Boolean)[0]; state.why.machine = wl.dataset.why; state.why.type = (bA ? bA.r.arch : "MoE").startsWith("MoE") ? "MoE" : "Dense"; state.why.key = bA ? bA.r.model + "|" + bA.r.framework : null; renderWhy(); openEvidence("why"); return; }
    const more = e.target.closest("button[data-more]");
    if (more) { state.open[more.dataset.more] = !state.open[more.dataset.more]; renderArch(); return; }
    const b = e.target.closest("button[data-k]"); if (!b || !state.data) return;
    state[b.dataset.k] = b.dataset.v;
    renderAll();
  });
  $("bsHA").addEventListener("change", () => { state.ha = $("bsHA").checked; renderAll(); });
  const pickUse = row => { if (!row || !state.data) return; state.use = row.dataset.use; setLen(curUse().k); };
  const pickSet = row => { if (!row || !state.data) return; state.set = row.dataset.set; if (SETS.some(x => x.more && x.id === state.set)) state.moreOpen = true; state.calcOpen = true; renderAll(); setCalc(true); };
  document.addEventListener("click", e => { if (e.target.closest("[data-toggle=more]") && state.data) { state.moreOpen = !state.moreOpen; renderPk(); return; } pickSet(e.target.closest("[data-set]")); pickUse(e.target.closest("[data-use]")); });
  document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-set],[data-use],[data-toggle=more]")) { e.preventDefault(); if (e.target.matches("[data-toggle=more]")) { state.moreOpen = !state.moreOpen; renderPk(); return; } pickSet(e.target.closest("[data-set]")); pickUse(e.target.closest("[data-use]")); } });
  const KS = [4, 8, 16];
  const setLen = k => { state.len = Math.max(0, KS.indexOf(Number(k))); state.mxInput = LENK(); $("bsLen").value = String(KS[state.len]); state.calcOpen = true; renderAll(); setCalc(true); };
  $("bsLen").addEventListener("input", () => { const v = Number($("bsLen").value), snap = v <= 6 ? 4 : v <= 12 ? 8 : 16; state.use = "custom"; setLen(snap); });
  document.querySelectorAll(".bs-scale button").forEach(b => b.addEventListener("click", () => { state.use = "custom"; setLen(b.dataset.k); }));
  state.mxInput = LENK();
  $("bsSpd").addEventListener("click", () => { state.spd = !state.spd; renderSpd(); });
  $("bsCalc").addEventListener("click", () => setCalc(!state.calcOpen));
  $("bsCalcX").addEventListener("click", () => setCalc(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && state.calcOpen) setCalc(false); });
  renderAll();
  fetch("data/sizing-capacity.json").then(r => r.json()).then(d => { state.data = d; renderAll(); }).catch(() => { $("bsCapNote").textContent = "Could not load data/sizing-capacity.json"; });
})();
