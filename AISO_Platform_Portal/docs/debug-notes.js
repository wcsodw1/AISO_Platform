"use strict";
/* Debugging: every red caveat/verdict notice is moved out of the page into ONE "Debugging" panel (⚠ at the bottom-right),
   sorted into three groups: Runner · Manifest · Others. */
(function(){
 const SEL="main .v2-verdict";
 const GROUPS=[["runner","Runner","執行檔"],["manifest","Manifest","參數清單"],["others","Others","其他"]];
 const classify=n=>{const t=n.textContent||"";
  if(/runner|腳本|script|checkpoint|resume/i.test(t))return "runner";
  if(/manifest|repo|sha|batch|context|\bTP\b|參數|核實|校驗|版本/i.test(t))return "manifest";
  return "others"};
 const wrap=document.createElement("div");wrap.className="dn-fly";wrap.hidden=true;
 wrap.innerHTML=`<div class="dn-panel" id="dnPanel" role="dialog" aria-label="Debugging"><header><b>Debugging<span class="bz">除錯</span></b><button type="button" class="dn-x" aria-label="Close">✕</button></header>
  <div class="dn-tabs" role="tablist">${GROUPS.map(([k,en,zh],i)=>`<button type="button" role="tab" data-g="${k}" class="${i?"":"on"}">${en}<span class="bz">${zh}</span><i class="dn-n">0</i></button>`).join("")}</div>
  ${GROUPS.map(([k],i)=>`<div class="dn-list" data-g="${k}"${i?" hidden":""}></div>`).join("")}</div>
  <button type="button" class="dn-btn" aria-expanded="false" aria-controls="dnPanel" aria-label="Debugging"><span aria-hidden="true">⚠</span><i class="dn-count">0</i></button>`;
 document.body.appendChild(wrap);
 const btn=wrap.querySelector(".dn-btn"),cnt=wrap.querySelector(".dn-count");
 const lists=Object.fromEntries(GROUPS.map(([k])=>[k,wrap.querySelector(`.dn-list[data-g="${k}"]`)]));
 const show=g=>{wrap.querySelectorAll(".dn-tabs button").forEach(b=>b.classList.toggle("on",b.dataset.g===g));GROUPS.forEach(([k])=>lists[k].hidden=k!==g)};
 wrap.querySelector(".dn-tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-g]");if(b)show(b.dataset.g)});
 let pinned=false,timer=null;
 const set=o=>{wrap.classList.toggle("open",o);btn.setAttribute("aria-expanded",String(o))};
 const total=()=>GROUPS.reduce((a,[k])=>a+lists[k].children.length,0);
 const sync=()=>{document.querySelectorAll(SEL).forEach(n=>{if(!wrap.contains(n))n.classList.add("dn-item")});document.querySelectorAll(".dn-item").forEach(n=>{const g=classify(n);if(n.parentElement!==lists[g])lists[g].appendChild(n)});
  GROUPS.forEach(([k])=>{const i=wrap.querySelector(`.dn-tabs [data-g="${k}"] .dn-n`),v=String(lists[k].children.length);if(i.textContent!==v)i.textContent=v});
  const k=total();if(cnt.textContent!==String(k))cnt.textContent=k;if(wrap.hidden!==!k)wrap.hidden=!k;
  const first=GROUPS.find(([g])=>lists[g].children.length);if(first&&!wrap.dataset.picked){wrap.dataset.picked="1";show(first[0])}};
 sync();new MutationObserver(muts=>{if(muts.some(m=>!wrap.contains(m.target)||m.target.closest&&m.target.closest(".dn-item")))sync()}).observe(document.body,{childList:true,subtree:true});
 wrap.addEventListener("mouseenter",()=>{clearTimeout(timer);set(true)});
 wrap.addEventListener("mouseleave",()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!pinned)set(false)},350)});
 btn.addEventListener("click",()=>{pinned=!(pinned&&wrap.classList.contains("open"));set(pinned)});
 wrap.querySelector(".dn-x").onclick=()=>{pinned=false;set(false)};
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){pinned=false;set(false)}});
})();
