/* Input token tab > right-side drawer "Matching machines 相對應機台配置". Does not touch the page itself: a slide-in panel opened from an edge tab.
   Rule: every user keeps >= 20 tok/s (minimum 15), all users generating at the same time (100 %, most conservative).
   Measured numbers: Ryzen AI MAX+ 395, llama-server NP1, output 300, per-user end-to-end tok/s (Consumer/AMD/ASUS-ROG-AI-MAX395/Benchmark_Result/Public/benchmark_summary.csv). */
(function () {
  "use strict";
  const tab = document.getElementById("tabTokens"); if (!tab) return;
  const OK = 20, MIN = 15, USERS = [1, 5, 10, 30, 50, 100];
  const MACHINE = { id: "aimax395", en: "AI MAX+ 395", zh: "Consumer 消費級", np: 1, models: [
    { name: "Gemma 4 26B A4B · Q4_K_M", tps: { 1: 31.4, 2: 25.0, 4: 19.9, 8: 11.5, 16: 5.1, 32: 1.6 } },
    { name: "GPT-OSS 20B · Q4_K_M", tps: { 1: 60.8, 2: 57.6, 4: 45.3, 8: 30.4, 16: 16.0, 32: 6.7 } } ] };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${esc(en)}<small class="zhs">${esc(zh)}</small>`;
  const nav = document.querySelector(".bh-menu"); if (!nav) return;
  const grp = document.createElement("div"), btn = document.createElement("button"), pan = document.createElement("aside");
  grp.className = "bh-grp itm-grp"; grp.hidden = true; btn.type = "button"; btn.className = "itm-go";
  btn.innerHTML = `<b><span class="itm-ar">→</span> Select Tool<small class="zhs">選購機器</small></b><small>Input → machines</small>`; grp.append(btn); nav.append(grp);
  pan.className = "itm-pan"; pan.setAttribute("aria-hidden", "true"); pan.hidden = true;
  document.body.append(pan);
  const cur = () => {
    const r = tab.querySelector(".itc-rec"); if (!r) return null;
    const main = parseInt((r.querySelector("b") || {}).textContent, 10), alt = ((r.querySelector(".itc-alt") || {}).textContent || "").match(/\d+(?=K)/g) || [];
    const lv = [alt[0], main, alt[1]].map(Number).filter(Boolean), big = tab.querySelector(".mw-big");
    return { main, lv: lv.length === 3 ? lv : [main], name: big ? big.textContent.trim() : "" };
  };
  const status = v => v == null ? ["—", bi("No data", "無資料"), "n"] : v >= OK ? [v.toFixed(1), bi("Good", "建議"), "g"] : v >= MIN ? [v.toFixed(1), bi("Borderline", "勉強"), "b"] : [v.toFixed(1), bi("Too slow", "未達"), "x"];
  function render() {
    const c = cur(); if (!c) { pan.innerHTML = `<p class="itm-note">${bi("Pick a category first", "先選一個類別")}</p>`; return; }
    const head = `<header><h2>${bi("Matching machines", "相對應機台配置")}</h2><button class="itm-x" type="button" aria-label="Close">×</button></header>
      <p class="itm-sub" title="${esc("Every user keeps at least 20 tok/s (minimum 15), all users generating at the same time (100 %, most conservative). Measured per-user end-to-end speed. / 每位使用者至少 20 tok/s（最低 15），所有人同時生成（100 %，最保守）。數字為實測的單人端到端速度。")}">${bi("≥ 20 tok/s per user", "每人 ≥ 20 tok/s")} <span class="itm-min">${bi("min 15", "最低 15")}</span></p>
      <p class="itm-cat"><b>${esc(c.name)}</b> <span>${bi("Input", "輸入")} ${c.lv.map(x => x + "K").join(" · ")}</span></p>`;
    const rows = USERS.map(n => {
      if (n !== 1) return `<section class="itm-u"><h3>${n} <small class="zhs">${n === 1 ? "人" : "人"}</small></h3><p class="itm-pend" title="${esc("To be measured later: PRO6000, GPT-OSS 20B at Q4 and at full precision. / 之後用 PRO6000 跑 GPT-OSS 20B（Q4 與全精度）補上。")}">${bi("To be added", "待補上")}</p></section>`;
      const ml = MACHINE.models.map(m => `<div class="itm-m"><span class="itm-mn">${esc(m.name)}</span>${c.lv.map(L => { const [v, lab, cls] = status(m.tps[L]); return `<span class="itm-c itm-${cls}${L === c.main ? " itm-main" : ""}" title="${L}K input"><em>${L}K</em><b>${v}</b><i>${lab}</i></span>`; }).join("")}</div>`).join("");
      return `<section class="itm-u itm-has"><h3>1 <small class="zhs">人</small></h3><p class="itm-mach"><b>${esc(MACHINE.en)}</b> <span>${esc(MACHINE.zh)} · NP ${MACHINE.np}</span></p>${ml}</section>`;
    }).join("");
    pan.innerHTML = head + `<div class="itm-body">${rows}</div>`;
  }
  const open = on => { if (on) render(); pan.hidden = false; requestAnimationFrame(() => { pan.classList.toggle("on", on); btn.classList.toggle("on", on); pan.setAttribute("aria-hidden", String(!on)); }); if (!on) setTimeout(() => { if (!pan.classList.contains("on")) pan.hidden = true; }, 260); };
  btn.addEventListener("click", () => open(!pan.classList.contains("on")));
  pan.addEventListener("click", e => { if (e.target.closest(".itm-x")) open(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") open(false); });
  const sync = () => { const vis = !tab.hidden; grp.hidden = !vis; if (!vis) open(false); else if (pan.classList.contains("on")) render(); };
  new MutationObserver(sync).observe(tab, { attributes: true, attributeFilter: ["hidden"] });
  tab.addEventListener("click", () => setTimeout(() => { if (pan.classList.contains("on")) render(); }, 60));
  sync();
})();
