"use strict";
/* New-version bar (same idea as David's gallery, David 2026-11-18): when a page is changed while it is open, a bar appears at the top - "New version · Refresh".
   Every 20 s (and when the tab comes back / the window gets focus) the page's own HTML is fetched with no-store and its versioned files (?v=...) are compared
   with the ones this page was loaded with. A file the open page does not have = a newer version. × hides the bar for that version only. */
(function () {
  const ref = /(?:src|href)="([^"]+?[?&]v=[^"]+)"/g;
  const loaded = new Set([...document.querySelectorAll("script[src],link[href]")].map(e => e.getAttribute("src") || e.getAttribute("href")).filter(x => /[?&]v=/.test(x || "")));
  if (!loaded.size) return;
  let bar = null, barKey = "", dismissed = "", busy = false;
  /* David 2026-11-18 「有更新直接…」: when a new version is found the page refreshes by itself. It does NOT refresh (the bar shows instead) when that could lose work:
     something was typed or chosen in a form on this page, a field has the cursor, the PDF is being made, or the page has a live terminal / running test.
     A page that already auto-refreshed for the same version in the last 2 minutes falls back to the bar (no reload loop). */
  let dirty = false;
  ["input", "change"].forEach(t => document.addEventListener(t, e => { if (e.isTrusted) dirty = true; }, true));
  function safe() {
    const a = document.activeElement;
    if (dirty) return false;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    if (document.querySelector(".sp-pdf[disabled], #aisoTermRun, body.rw-exec, [data-no-autoreload]")) return false;
    return true;
  }
  function autoReload(key) {
    let last = null; try { last = JSON.parse(sessionStorage.getItem("aiso.upd") || "null"); } catch (e) {}
    if (last && last.key === key && Date.now() - last.t < 120000) return false;
    try { sessionStorage.setItem("aiso.upd", JSON.stringify({ key, t: Date.now() })); } catch (e) {}
    const n = document.createElement("div"); n.className = "upd-bar"; n.setAttribute("role", "status");
    n.innerHTML = '<span>Updating<small>更新中</small></span>'; document.body.appendChild(n);
    setTimeout(() => location.reload(), 600);
    return true;
  }
  function show(key) {
    if (bar && barKey === key) return;
    if (bar) bar.remove();
    barKey = key;
    bar = document.createElement("div");
    bar.className = "upd-bar"; bar.setAttribute("role", "status");
    bar.innerHTML = `<span>New version<small>有新版本</small></span><button type="button" data-r>Refresh<small>重新整理</small></button><button type="button" data-x aria-label="Later 稍後">×</button>`;
    bar.querySelector("[data-r]").addEventListener("click", () => location.reload());
    bar.querySelector("[data-x]").addEventListener("click", () => { dismissed = key; bar.remove(); bar = null; });
    document.body.appendChild(bar);
  }
  async function check() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const html = await (await fetch(location.pathname + "?_=" + Date.now(), { cache: "no-store" })).text();
      const now = [...html.matchAll(ref)].map(m => m[1].replace(/&amp;/g, "&"));
      const fresh = now.filter(x => !loaded.has(x));
      const key = fresh.sort().join("|");
      if (fresh.length && key !== dismissed) { if (!(safe() && autoReload(key))) show(key); }
    } catch (e) { /* offline or the server is restarting: try again next time */ }
    busy = false;
  }
  setInterval(check, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.addEventListener("focus", check);
  setTimeout(check, 5000);
  window.UpdateCheck = { check, safe };
})();
