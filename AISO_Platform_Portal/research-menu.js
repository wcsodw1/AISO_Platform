/* Research nav dropdown: In progress 進行中 / Done 已完成, read from data/rd-list.json (same source as research.html). */
(function(){
 var nav=document.querySelector(".site-nav");if(!nav)return;
 var el=nav.querySelector("#researchLink")||nav.querySelector('a[href="research.html"]');if(!el||el.closest(".nav-menu"))return;
 var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
 var wrap=document.createElement("div");wrap.className="nav-menu";
 el.parentNode.insertBefore(wrap,el);wrap.appendChild(el);
 var caret=document.createElement("span");caret.className="caret";caret.setAttribute("aria-hidden","true");el.appendChild(caret);
 var dd=document.createElement("div");dd.className="nav-dropdown nav-research";dd.setAttribute("role","menu");dd.setAttribute("aria-label","Research menu");wrap.appendChild(dd);
 var all='<a role="menuitem" class="nd-all" href="research.html">All research<small>全部研究項目</small></a>';
 dd.innerHTML=all;
 fetch("data/rd-list.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
  var DAY=864e5,W0=new Date((d.weeks_from||"2026-11-09")+"T00:00:00"),NOW=Math.floor((Date.now()-W0)/DAY/7),wk=function(v){return Math.floor((new Date(v+"T00:00:00")-W0)/DAY/7)};
  var done=(d.results||[]).slice().sort(function(a,b){return String(b.done).localeCompare(String(a.done))});
  var isDone=function(x){return done.some(function(r){return r.task.toLowerCase().indexOf(x.task.toLowerCase())===0})};
  var prog=(d.items||[]).filter(function(x){return !isDone(x)&&(x.status==="progress"||(x.start&&wk(x.start)<=NOW&&wk(x.end)>=NOW))});
  var MAX=4,more=prog.length-MAX;
  function item(x,sub){return '<a role="menuitem" href="'+esc(x.href||"research.html")+'">'+esc(x.task)+'<small>'+esc(sub)+'</small></a>'}
  var h='<p class="nd-h">In progress<span>進行中 · '+prog.length+'</span></p>'+(prog.length?prog.slice(0,MAX).map(function(x){return item(x,x.owner||"—")}).join("")+(more>0?'<a role="menuitem" class="nd-more" href="research.html#rdTodo">+'+more+' more<small>還有 '+more+' 項</small></a>':""):'<p class="nd-none">None right now · 目前沒有</p>');
  h+='<p class="nd-h">Done<span>已完成 · '+done.length+'</span></p>'+done.map(function(x){return item(x,x.zh||"")}).join("");
  dd.innerHTML=h+all;
 }).catch(function(){});
})();
