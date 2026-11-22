/* Benchmark shortcut (David 2026-11-22): pressing "Benchmark" / "Benchmarking" while one of our machines is running a test goes straight to that machine's Run page.
   Local page only (the website never contacts a machine). The status is asked in the background (read-only, at most once a minute) so the click itself is instant. */
(function () {
  if (!/^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) || /[?&]web=1\b/.test(location.search)) return;
  const KEY = "aiso-bench-busy";
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const write = v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode: no shortcut */ } };
  const ask = () => fetch("/api/benchmark/executor/active", { cache: "no-store" }).then(r => r.json()).then(d => { const v = { t: Date.now(), to: (d && d.to) || "", machine: (d && d.machine) || "" }; write(v); return v; });
  const poll = () => ask().catch(() => {});      // answered from the server's cache: instant
  poll(); setInterval(poll, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });      // a background tab does not run its timer: ask again when it comes back
  let passing = false;
  const sameRunPage = c => location.pathname.endsWith("/" + c.to.split("#")[0]) && location.hash === "#" + c.to.split("#")[1];      // already on that Run page: the link works as before
  const jump = c => {
    try { sessionStorage.setItem("aiso-jump", JSON.stringify({ machine: c.machine, t: Date.now() })); } catch (x) { /* no storage: lands on the machine page */ }      // the Run page opens the engine that is running, on its Run step (the Run log)
    location.href = c.to; if (location.pathname.endsWith("/benchmark.html")) location.reload();
  };
  document.addEventListener("click", e => {
    if (passing) return;
    const a = e.target.closest('.site-nav a[href^="benchmark-hub"], .site-nav .nav-menu > a[href*="benchmark"]'); if (!a) return;
    const c = read();
    if (c && Date.now() - c.t < 30000) { if (c.to && !sameRunPage(c)) { e.preventDefault(); e.stopImmediatePropagation(); jump(c); } return; }
    // the answer is old (background tab) or missing: ask once now (instant, from the server's cache), then jump or let the click do what it always did
    e.preventDefault(); e.stopImmediatePropagation();
    ask().catch(() => ({ to: "" })).then(v => { if (v.to && !sameRunPage(v)) jump(v); else { passing = true; a.click(); passing = false; } });
  }, true);
})();
/* Research nav dropdown: In progress 進行中 / Done 已完成, read from data/rd-list.json (same source as research.html). */
(function(){
 var nav=document.querySelector(".site-nav");if(!nav)return;
 var el=nav.querySelector("#researchLink")||nav.querySelector('a[href="research.html"]');if(!el||el.closest(".nav-menu"))return;
 var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
 var wrap=document.createElement("div");wrap.className="nav-menu";
 el.parentNode.insertBefore(wrap,el);wrap.appendChild(el);
 var caret=document.createElement("span");caret.className="caret";caret.setAttribute("aria-hidden","true");el.appendChild(caret);
 var dd=document.createElement("div");dd.className="nav-dropdown nav-research";dd.setAttribute("role","menu");dd.setAttribute("aria-label","Research menu");wrap.appendChild(dd);
 var all='<a role="menuitem" class="nd-all" href="research.html">All research<small>全部研究</small></a><a role="menuitem" class="nd-mb" href="sizing.html">Memory Budget<small>記憶體預算</small></a>';
 dd.innerHTML=all;
 fetch("data/rd-list.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
  var DAY=864e5,W0=new Date((d.weeks_from||"2026-11-09")+"T00:00:00"),NOW=Math.floor((Date.now()-W0)/DAY/7),wk=function(v){return Math.floor((new Date(v+"T00:00:00")-W0)/DAY/7)};
  var done=(d.results||[]).slice().sort(function(a,b){return String(b.done).localeCompare(String(a.done))});
  var isDone=function(x){return done.some(function(r){return r.task.toLowerCase().indexOf(x.task.toLowerCase())===0})};
  var prog=[],wait=[];
  (d.items||[]).forEach(function(x){if(isDone(x))return;if(x.status==="progress"||(x.start&&wk(x.start)<=NOW&&wk(x.end)>=NOW))prog.push(x);else wait.push(x)});
  function item(x,sub){return '<a role="menuitem" href="'+esc(x.href||"research.html#rdTodo")+'">'+esc(x.task)+(sub?'<small>'+esc(sub)+'</small>':"")+'</a>'}
  function grp(en,zh,list,sub){return '<div class="nd-g" tabindex="0" role="menuitem" aria-haspopup="true"><span class="nd-gt">'+en+'<small>'+zh+'</small></span><span class="nd-n">'+list.length+'</span><span class="nd-arrow" aria-hidden="true"></span><div class="nd-fly" role="menu">'+(list.length?list.map(function(x){return item(x,sub(x))}).join(""):'<p class="nd-none">None right now · 目前沒有</p>')+'</div></div>'}
  dd.innerHTML=all+grp("Finished","已完成",done,function(x){return x.zh||""})+grp("On process","進行中",prog,function(x){return x.owner||""})+grp("Wait select","待選擇",wait,function(x){return x.owner||""});
  /* open to the right; flip to the left when there is no room */
  dd.querySelectorAll(".nd-g").forEach(function(g){var f=g.querySelector(".nd-fly"),chk=function(){g.classList.remove("flip");var r=g.getBoundingClientRect();if(r.right+f.offsetWidth>innerWidth-8)g.classList.add("flip")};g.addEventListener("mouseenter",chk);g.addEventListener("focus",chk)});
 }).catch(function(){});
})();

/* Phone / tablet: there is no hover. First tap on Home / Benchmark / Research opens its menu (a panel under the header, full width), a second tap follows the link;
   inside the Research menu a tap on Finished / On process / Wait select opens that list under it (an accordion, nothing opens to the side). Tap outside closes. */
(function () {
  const mq = window.matchMedia("(max-width:700px)");
  const closeAll = () => document.querySelectorAll(".site-nav .nav-menu.open").forEach(m => { m.classList.remove("open"); const b = m.firstElementChild; if (b && b.setAttribute) b.setAttribute("aria-expanded", "false"); });
  function place(m) { const h = document.querySelector(".site-header, .topbar"), dd = m.querySelector(".nav-dropdown"); if (h && dd) dd.style.top = Math.round(h.getBoundingClientRect().bottom + 6) + "px"; }
  document.addEventListener("click", e => {
    if (!mq.matches) return;
    const g = e.target.closest(".nav-research .nd-g");
    if (g) { g.classList.toggle("nd-open"); return; }
    const t = e.target.closest(".site-nav .nav-menu > a, .site-nav .nav-menu > button");
    if (t) {
      const m = t.parentElement;
      if (m.classList.contains("open")) { closeAll(); return; }      // second tap: the link / button works as before
      e.preventDefault(); e.stopImmediatePropagation();
      closeAll(); m.classList.add("open"); place(m); t.setAttribute("aria-expanded", "true");
      return;
    }
    if (!e.target.closest(".nav-dropdown")) closeAll();
  }, true);
  window.addEventListener("scroll", () => { const m = document.querySelector(".site-nav .nav-menu.open"); if (m) place(m); }, { passive: true });
})();
