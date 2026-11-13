"use strict";
/* Every request that STARTS a benchmark run first asks for the test password (nothing is remembered).
   RunGate.needs(method, url) -> does this request start a run?   RunGate.ticket() -> Promise<one-time ticket> (rejects if cancelled). */
window.RunGate = (function () {
  const needs = (method, url) => {
    if (String(method || "GET").toUpperCase() !== "POST") return false;
    const p = String(url).split("?")[0].replace(/\/$/, ""), pre = "/api/v1/benchmark";
    if (p === "/api/benchmark/start") return true;
    if (!p.startsWith(pre + "/")) return false;
    const rest = p.slice(pre.length);
    return rest === "/jobs" || rest === "/live/start" || (rest.startsWith("/jobs/") && rest.endsWith("/retry-failed"));
  };
  let pending = null;   // one dialog at a time: a second click returns the same dialog instead of opening another
  function ticket() {
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const wrap = document.createElement("div");
      wrap.className = "rg-back";
      wrap.innerHTML = `<form class="rg-box" role="dialog" aria-modal="true" aria-label="Test password"><h3>Run benchmark<small>實測</small></h3><p>請輸入測試密碼才能開始執行<br><span>Enter the test password to start this run.</span></p><input type="password" name="pw" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="測試密碼 Test password" required><p class="rg-err" role="alert"></p><div class="rg-row"><button type="button" class="rg-cancel">取消 Cancel</button><button type="submit" class="rg-go">開始 Run</button></div></form>`;
      document.body.appendChild(wrap);
      const form = wrap.querySelector("form"), input = form.pw, err = form.querySelector(".rg-err"), go = form.querySelector(".rg-go");
      const close = () => { input.value = ""; wrap.remove(); document.removeEventListener("keydown", onKey); };
      const onKey = e => { if (e.key === "Escape") { close(); reject(new Error("Cancelled: the test password was not entered.")); } };
      document.addEventListener("keydown", onKey);
      form.querySelector(".rg-cancel").onclick = () => { close(); reject(new Error("Cancelled: the test password was not entered.")); };
      form.onsubmit = async e => {
        e.preventDefault(); go.disabled = true; err.textContent = "";
        try {
          const r = await fetch("/api/run-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: input.value }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { err.textContent = d.error || `HTTP ${r.status}`; input.select(); go.disabled = false; return; }
          close(); resolve(d.ticket);
        } catch (x) { err.textContent = String(x.message || x); go.disabled = false; }
      };
      input.focus();
    });
    pending.then(() => { pending = null; }, () => { pending = null; });
    return pending;
  }
  return { needs, ticket };
})();
