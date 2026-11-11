"use strict";
/* Debug / caveat notes: red "verdict" notices are moved out of the page into a ⚠ button at the bottom-right corner (hover or click opens the list). */
(function(){
 const SEL="main .v2-verdict";
 const wrap=document.createElement("div");wrap.className="dn-fly";
 wrap.innerHTML=`<div class="dn-panel" id="dnPanel" role="dialog" aria-label="Debug notes"><header><b>Debug notes<span class="bz">除錯與注意事項</span></b><button type="button" class="dn-x" aria-label="Close">✕</button></header><div class="dn-list"></div></div>
  <button type="button" class="dn-btn" aria-expanded="false" aria-controls="dnPanel" aria-label="Debug notes"><span aria-hidden="true">⚠</span><i class="dn-count">0</i></button>`;
 document.body.appendChild(wrap);
 const list=wrap.querySelector(".dn-list"),btn=wrap.querySelector(".dn-btn"),cnt=wrap.querySelector(".dn-count");
 let pinned=false,timer=null;
 const set=o=>{wrap.classList.toggle("open",o);btn.setAttribute("aria-expanded",String(o))};
 const sync=()=>{document.querySelectorAll(SEL).forEach(n=>{if(!list.contains(n)){n.classList.add("dn-item");list.appendChild(n)}});const k=list.children.length;if(cnt.textContent!==String(k))cnt.textContent=k;if(wrap.hidden!==!k)wrap.hidden=!k};
 sync();new MutationObserver(muts=>{if(muts.some(m=>!wrap.contains(m.target)))sync()}).observe(document.body,{childList:true,subtree:true});
 wrap.addEventListener("mouseenter",()=>{clearTimeout(timer);set(true)});
 wrap.addEventListener("mouseleave",()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!pinned)set(false)},350)});
 btn.addEventListener("click",()=>{pinned=!pinned||!wrap.classList.contains("open");set(pinned||wrap.classList.contains("open"));if(!pinned)set(false)});
 wrap.querySelector(".dn-x").onclick=()=>{pinned=false;set(false)};
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){pinned=false;set(false)}});
})();
