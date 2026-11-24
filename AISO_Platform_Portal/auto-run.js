"use strict";
/* Entering the Benchmark hub while a test is running goes straight to the test area (David 2026-11-24):
   - aiDAPTIV 3.05 run (live dataset, fresh within 10 min) -> PRO6000 Run page, aiDAPTIV zone selected
   - a test started from the platform (executor /active) -> that machine's Run page
   Runs at most once per 10 minutes per browser tab session, so "返回 Benchmark" from the Run page can still show the hub. ?stay=1 turns it off. */
(function () {
  if (/[?&]stay=1/.test(location.search)) return;
  let last = 0; try { last = +sessionStorage.getItem("aiso-auto-run") || 0; } catch (e) {}
  if (Date.now() - last < 600000) return;
  const HUB = { pro6000: "nvidia/pro6000-tpi", aiso1: "amd/aiso1-amd", gb10: "nvidia/gb10" };
  const go = (id, sel) => {
    try { sessionStorage.setItem("aiso-auto-run", String(Date.now())); if (sel) sessionStorage.setItem("aiso-aid-go", JSON.stringify({ sel, t: Date.now() })); } catch (e) {}
    location.replace("benchmark.html#/pick/" + HUB[id]);
  };
  const fresh = u => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(u || ""); return m && Date.now() - new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() < 600000; };
  const aid = () => fetch("data/benchmark-pro6000/AISO_PRO6000_aiDAPTIV305_GPTOSS20B_live.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || d.live !== true || !fresh(d.updated)) return false;
    go("pro6000", /aiDAPTIV/.test((d.progress && d.progress.current) || "") ? "A4" : "A3"); return true;
  }).catch(() => false);
  fetch("/api/benchmark/executor/active", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
    const id = d && d.machine ? String(d.machine).replace(/_.*$/, "") : "";
    if (HUB[id]) { go(id, ""); return true; }
    return false;
  }).catch(() => false).then(done => { if (!done) aid(); });
})();
