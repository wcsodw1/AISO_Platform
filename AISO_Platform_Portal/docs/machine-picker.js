"use strict";
/* Benchmark machine wizard (layout after a configurator: preview stage on the left, ONE question at a time on the right).
   Step 1 vendor -> Step 2 machine -> Step 3 what next (Run / published result). Equal-size option cards, progress bars, Back, Next.
   MachinePicker.mount(rootEl). English large, Chinese small beside it. */
window.MachinePicker = (function () {
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TIER = { c: ["Consumer", "消費級"], m: ["Mini-workstation", "迷你工作站"], s: ["Server", "伺服器"] };
  /* online = reachable and can run (David, 2026-11-11: NVIDIA RTX PRO 6000 and AMD AISO1 only; Intel B60 / B70 are returned or about to be shut down: results stay, Run is off) */
  const V = [
    { k: "nvidia", name: "NVIDIA", stack: "CUDA", models: [
      { id: "pro6000", n: "RTX PRO 6000", t: "s", online: true, spec: "8 × RTX PRO 6000 Blackwell · 96 GB / GPU", fw: "vLLM · llama.cpp", run: "benchmark.html#/pick/nvidia/pro6000-tpi" },
      { id: "h200", n: "H200", t: "s" }, { id: "b300", n: "B300", t: "s" }] },
    { k: "amd", name: "AMD", stack: "Vulkan · ROCm", models: [
      { id: "aiso1", n: "AISO1 · AI MAX+ 395", t: "m", online: true, spec: "Ryzen AI Max+ 395 · Radeon iGPU (gfx1151)", fw: "llama.cpp · vLLM · SGLang", result: "stress-test-aiso1.html", run: "benchmark.html#/pick/amd/aiso1-amd" },
      { id: "rog395", n: "ROG AI MAX 395", t: "c" }, { id: "tuf392", n: "TUF AI MAX 392", t: "c" }, { id: "asrock", n: "ASRock", t: "m" }, { id: "mi350x", n: "Instinct MI350X", t: "s" }] },
    { k: "intel", name: "INTEL", stack: "SYCL · XPU", models: [
      { id: "b70", n: "Arc Pro B70", t: "m", online: false, note: "Shutting down 即將關閉", spec: "2 × Arc Pro B70 · 32 GB / GPU", fw: "llama.cpp · vLLM · SGLang", result: "stress-test-b70.html" },
      { id: "b60", n: "Arc Pro B60", t: "m", online: false, note: "Returned 已歸還", spec: "Arc Pro B60 · 24 GB / GPU", fw: "llama.cpp · vLLM · SGLang", result: "stress-test-b60.html" },
      { id: "b390", n: "Arc B390", t: "c" }] }];
  const known = m => m.online !== undefined || !!m.result;
  const onlineN = v => v.models.filter(m => m.online).length, resultN = v => v.models.filter(m => m.result).length;

  function mount(root) {
    const st = { step: 1, vendor: null, machine: null, action: null };
    const vendor = () => V.find(v => v.k === st.vendor), machine = () => vendor() && vendor().models.find(m => m.id === st.machine);
    st.vendor = (V.find(onlineN) || V[0]).k;

    function stage() {
      const m = st.step >= 2 && machine(), v = vendor();
      if (m) return `<p class="mw-kicker">${esc(v.name)} · ${bi(TIER[m.t][0], TIER[m.t][1])}</p><h2 class="mw-big">${esc(m.n)}</h2><p class="mw-spec">${esc(m.spec || "Not connected yet")}</p>
        <div class="mw-chips">${m.online ? `<span class="mw-chip on">${bi("● Online", "可連線")}</span>` : known(m) ? `<span class="mw-chip off">${bi("○ Offline", "離線")}${m.note ? " · " + esc(m.note) : ""}</span>` : `<span class="mw-chip">${bi("Coming soon", "即將推出")}</span>`}${m.fw ? `<span class="mw-chip">${esc(m.fw)}</span>` : ""}${m.result ? `<span class="mw-chip">${bi("Results", "有結果")}</span>` : ""}</div>`;
      return `<p class="mw-kicker">${bi("Vendor", "廠商")}</p><h2 class="mw-big">${esc(v.name)}</h2><p class="mw-spec">${esc(v.stack)}</p>
        <div class="mw-chips"><span class="mw-chip ${onlineN(v) ? "on" : ""}">${bi("Online " + onlineN(v), "可連線")}</span><span class="mw-chip">${bi("Results " + resultN(v), "有結果")}</span></div>`;
    }
    const opt = (id, left, right, sel, off) => `<button type="button" class="mw-opt${sel ? " sel" : ""}${off ? " off" : ""}" data-id="${id}"${off ? ' aria-disabled="true"' : ""}><span class="mw-l">${left}</span><span class="mw-r">${right || ""}</span></button>`;
    function question() {
      const v = vendor();
      if (st.step === 1) return { title: bi("Choose a vendor", "選擇廠商"), body: V.map(x => opt(x.k, `<b>${x.name}</b>`, onlineN(x) ? bi("Online " + onlineN(x), "可連線") : bi("None online", "尚無可連線"), x.k === st.vendor)).join(""), ok: true, next: bi("Next", "下一步") };
      if (st.step === 2) return { title: bi("Choose a machine", "選擇機型"), body: v.models.map(m => opt(m.id, `<b>${esc(m.n)}</b>`, m.online ? bi("● Online", "可連線") : known(m) ? bi("○ Offline", "離線") : bi("Coming soon", "即將推出"), m.id === st.machine, !known(m))).join(""), ok: !!machine(), next: bi("Next", "下一步") };
      const m = machine();
      const runOk = !!(m.online && m.run), resOk = !!m.result;
      if (!st.action) st.action = runOk ? "run" : (resOk ? "result" : null);
      return { title: bi("What would you like to do?", "接下來要做什麼"), body:
        opt("run", `<b>${bi("Run benchmark", "實測")}</b>`, runOk ? bi("Password asked first", "先輸入測試密碼") : bi("Offline", "離線"), st.action === "run", !runOk) +
        opt("result", `<b>${bi("View result", "查看結果")}</b>`, resOk ? "TTFT · TPOT · TPS" : bi("No result yet", "尚無結果"), st.action === "result", !resOk), ok: !!st.action, next: bi("Go", "前往") + " →" };
    }
    function render() {
      const q = question(), bars = [1, 2, 3].map(i => `<span class="${i <= st.step ? "on" : ""}"></span>`).join("");
      root.innerHTML = `<div class="mw"><div class="mw-stage">${stage()}</div><div class="mw-panel"><div class="mw-bars" aria-label="Step ${st.step} of 3">${bars}</div>
        <button type="button" class="mw-back"${st.step === 1 ? " hidden" : ""}>‹ ${bi("Back", "返回")}</button><h3 class="mw-q">${q.title}</h3><div class="mw-opts" role="listbox">${q.body}</div>
        <button type="button" class="mw-next"${q.ok ? "" : " disabled"}>${q.next}</button></div></div>`;
    }
    root.addEventListener("click", e => {
      const o = e.target.closest(".mw-opt"), b = e.target.closest(".mw-back"), n = e.target.closest(".mw-next");
      if (o && o.getAttribute("aria-disabled") !== "true") {
        if (st.step === 1) { st.vendor = o.dataset.id; st.machine = null; st.action = null; }
        else if (st.step === 2) { st.machine = o.dataset.id; st.action = null; }
        else st.action = o.dataset.id;
        render();
      } else if (b) { st.step = Math.max(1, st.step - 1); if (st.step < 3) st.action = null; render(); }
      else if (n && !n.disabled) {
        if (st.step < 3) { st.step++; if (st.step === 2 && !st.machine) { const f = vendor().models.find(known); st.machine = f ? f.id : null; } render(); }
        else { const m = machine(); location.href = st.action === "run" ? m.run : m.result; }
      }
    });
    root.addEventListener("mouseover", e => {            // hover previews the vendor on the left stage without changing the choice
      const o = e.target.closest(".mw-opt");
      if (o && st.step === 1) { const keep = st.vendor; st.vendor = o.dataset.id; root.querySelector(".mw-stage").innerHTML = stage(); st.vendor = keep; }
    });
    root.addEventListener("mouseout", e => { if (st.step === 1 && !e.relatedTarget?.closest?.(".mw-opt")) root.querySelector(".mw-stage").innerHTML = stage(); });
    render();
  }
  return { mount, vendors: V };
})();
