"use strict";
/* Hover-to-expand panels. Markup: <section class="hv-fold hv-closed"><header>…</header> …body… </section>   (head = first <header> or .hv-head)
   Mouse: moving the pointer onto the panel opens it, leaving closes it (short delay).
   Click on the head: closed -> open and PIN; open only because of the hover -> PIN (stays open, never closes); pinned -> close. Enter/Space does the same. Fires "hvopen" when it opens. */
(function(){
 const bind=el=>{
  if(el.__hv)return;el.__hv=1;
  const head=el.querySelector(":scope > header, :scope > .hv-head");if(!head)return;
  head.setAttribute("tabindex","0");head.setAttribute("role","button");
  let pinned=false,t;
  const open=()=>{clearTimeout(t);if(el.classList.contains("hv-closed")){el.classList.remove("hv-closed");el.dispatchEvent(new CustomEvent("hvopen",{bubbles:true}))}};
  const close=()=>{if(!pinned)el.classList.add("hv-closed")};
  const sync=()=>{el.classList.toggle("hv-pinned",pinned);head.setAttribute("aria-expanded",String(!el.classList.contains("hv-closed")))};
  el.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse"){open();sync()}});
  el.addEventListener("pointerleave",e=>{if(e.pointerType==="mouse"){clearTimeout(t);t=setTimeout(()=>{close();sync()},350)}});
  const toggle=()=>{
   if(el.classList.contains("hv-closed")){pinned=true;open()}          // closed: open and pin
   else if(!pinned){pinned=true}                                        // open by hover: pin it, do not close
   else{pinned=false;el.classList.add("hv-closed")}                     // pinned: close
   sync()};
  head.addEventListener("click",e=>{if(e.target.closest("button,a,.st-tabs"))return;toggle()});
  head.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle()}});
  sync();
 };
 window.HoverFold={bind,init:(root)=>(root||document).querySelectorAll(".hv-fold").forEach(bind)};
 document.addEventListener("DOMContentLoaded",()=>HoverFold.init());
})();
