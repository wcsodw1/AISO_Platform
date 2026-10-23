/* Site-wide cursor glow: the area under the mouse lights up. Mouse only; off for touch and reduced motion. */
(function(){
  if(typeof window==="undefined"||!window.matchMedia)return;
  if(window.matchMedia("(hover: none)").matches||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const glow=document.createElement("div");
  glow.className="cursor-glow";glow.setAttribute("aria-hidden","true");
  let x=0,y=0,queued=false;
  const paint=()=>{queued=false;glow.style.transform=`translate3d(${x}px,${y}px,0)`};
  document.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch")return;
    x=event.clientX;y=event.clientY;glow.classList.add("on");
    if(!queued){queued=true;requestAnimationFrame(paint)}
  },{passive:true});
  document.addEventListener("pointerleave",()=>glow.classList.remove("on"));
  document.documentElement.addEventListener("mouseleave",()=>glow.classList.remove("on"));
  const mount=()=>document.body.appendChild(glow);
  if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount);
})();
