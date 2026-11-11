"use strict";
/* Benchmark terminal component.
   Tabs:  Completed run (replay of a finished benchmark, works on the public site)  |  Runner  |  Manifest  |  Live shell
   Live shell is an interactive PTY on THIS computer (launcher backend, see benchmark/terminal.py): it only works on localhost,
   only when AISO_TERMINAL_PASSWORD is set, and always asks for that second password. On the public site it stays locked. */
window.AisoTerm=(function(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ANSI=/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\r(?!\n)/g;
 const api=(path,opt={})=>fetch("api/terminal/"+path,{cache:"no-store",credentials:"same-origin",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}}).then(async r=>{let b={};try{b=await r.json()}catch(e){}if(!r.ok)throw Object.assign(new Error(b.error||("HTTP "+r.status)),{status:r.status});return b});
 const KIND={cmd:"tm-cmd",ok:"tm-ok",warn:"tm-warn",dim:"tm-dim",err:"tm-err",out:"tm-out"};
 const line=(l)=>`<div class="${KIND[l.k]||"tm-out"}">${l.k==="cmd"?'<span class="tm-prompt">$ </span>':""}${esc(l.t)}</div>`;

 function mount(root,opt){
  let machine=opt.machine;
  root.classList.add("tm-root","tm-locked");   // stage 1: only the unlock form is visible
  const pick=opt.machines?`<label class="tm-pick">Example run<span class="bz">範例</span><select>${opt.machines.map(([k,l])=>`<option value="${k}"${k===machine?" selected":""}>${esc(l)}</option>`).join("")}</select></label>`:"";
  root.innerHTML=pick+`<div class="tm-tabs" role="tablist">
    <button type="button" role="tab" class="on" data-t="live">Live shell<span class="bz">即時終端</span></button>
    <button type="button" role="tab" data-t="run">Past run<span class="bz">歷史紀錄</span></button>
    <button type="button" role="tab" data-t="runner">Runner<span class="bz">執行檔</span></button>
    <button type="button" role="tab" data-t="manifest">Manifest<span class="bz">參數清單</span></button></div>
   <div class="tm-panel" data-p="live"></div><div class="tm-panel" data-p="run" hidden></div><div class="tm-panel" data-p="runner" hidden></div><div class="tm-panel" data-p="manifest" hidden></div>`;
  const P=k=>root.querySelector(`.tm-panel[data-p="${k}"]`);
  let D=null,liveInit=true;
  root.querySelector(".tm-tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-t]");if(!b)return;
   root.querySelectorAll(".tm-tabs button").forEach(x=>x.classList.toggle("on",x===b));
   root.querySelectorAll(".tm-panel").forEach(p=>p.hidden=p.dataset.p!==b.dataset.t);
   if(b.dataset.t==="live"&&!liveInit){liveInit=true;initLive(P("live"))}});

  /* ---- replay ---- */
  function renderRun(){
   const d=D,st=d.completed?`<span class="tm-badge ok">✓ ${esc(d.summary)}</span>`:`<span class="tm-badge warn">… ${esc(d.summary)}</span>`;
   P("run").innerHTML=`<div class="tm-bar"><b>${esc(d.title)}</b>${st}<span class="tm-sp"></span><button type="button" class="tm-btn" data-a="replay">▶ Replay<span class="bz">重播</span></button></div>
    <pre class="tm-screen" tabindex="0" aria-label="terminal output"></pre><p class="tm-note">${esc(d.source)}</p>`;
   const scr=P("run").querySelector(".tm-screen");
   const showAll=()=>{scr.innerHTML=d.transcript.map(line).join("");scr.scrollTop=scr.scrollHeight};
   showAll();
   let timer=null;
   P("run").querySelector('[data-a="replay"]').onclick=()=>{
    clearInterval(timer);scr.innerHTML="";let i=0;
    timer=setInterval(()=>{const n=d.transcript[i++];if(!n){clearInterval(timer);return}scr.insertAdjacentHTML("beforeend",line(n));scr.scrollTop=scr.scrollHeight},n40(d))};
  }
  const n40=d=>Math.max(8,Math.min(60,Math.round(6000/Math.max(1,d.transcript.length))));
  function renderRunner(){
   const r=D.runner;
   P("runner").innerHTML=`<dl class="tm-kv"><div><dt>Runner file<span class="bz">執行檔</span></dt><dd>${esc(r.file)}</dd></div><div><dt>Where<span class="bz">位置</span></dt><dd>${esc(r.where)}</dd></div>
    ${r.sha256?`<div><dt>SHA256</dt><dd class="tm-mono">${esc(r.sha256)}</dd></div>`:""}${r.note?`<div><dt>Note<span class="bz">備註</span></dt><dd>${esc(r.note)}</dd></div>`:""}</dl>
    <div class="tm-bar"><b>Command<span class="bz">指令</span></b><span class="tm-sp"></span><button type="button" class="tm-btn" data-a="copy">Copy<span class="bz">複製</span></button></div>
    <pre class="tm-screen tm-cmdbox">${esc(r.command)}</pre>`;
   P("runner").querySelector('[data-a="copy"]').onclick=e=>{const b=e.currentTarget;(navigator.clipboard?navigator.clipboard.writeText(r.command):Promise.reject()).then(()=>{b.firstChild.textContent="Copied ✓";setTimeout(()=>b.firstChild.textContent="Copy",1500)}).catch(()=>{})};
  }
  function renderManifest(){
   const m=D.manifest;
   P("manifest").innerHTML=m?`<pre class="tm-screen tm-json">${esc(JSON.stringify(m,null,2))}</pre>`:`<p class="tm-empty">Manifest not provided yet<span class="bz">尚未提供</span>${D.manifest_note?`<br><small>${esc(D.manifest_note)}</small>`:""}</p>`;
  }

  /* ---- live shell ---- */
  async function initLive(el){
   el.innerHTML=`<p class="tm-empty">Checking local backend…</p>`;
   let st;
   try{st=await api("status")}catch(e){el.innerHTML=`<p class="tm-empty">Local only<span class="bz">僅限本機</span><br><small>The live shell runs on the computer that hosts the launcher (localhost) and is not available on the public site. 公開網站不提供即時終端。</small></p>`;return}
   if(!st.enabled){el.innerHTML=`<p class="tm-empty">Terminal disabled<span class="bz">未啟用</span><br><small>${esc(st.message)}<br>設定環境變數 AISO_TERMINAL_PASSWORD 後重新啟動 launcher。</small></p>`;return}
   const targets=st.targets||[];
   el.innerHTML=`<form class="tm-login"><label>Terminal password<span class="bz">終端密碼（第二層）</span><input type="password" autocomplete="off" required></label>${targets.length?`<label>Connect to<span class="bz">連線目標</span><select class="tm-target"><option value="">This computer · 本機</option>${targets.map(x=>`<option value="${esc(x)}"${D&&D.target===x?" selected":""}>${esc(x)} (ssh)</option>`).join("")}</select></label>`:""}<button type="submit" class="tm-btn pri">Unlock<span class="bz">解鎖</span></button><p class="tm-note tm-msg" aria-live="polite">This opens a real shell on this computer. 這會在本機開啟真實的 shell。</p></form>`;
   el.querySelector("form").onsubmit=async ev=>{ev.preventDefault();const f=ev.currentTarget,msg=f.querySelector(".tm-msg");
    try{const r=await api("login",{method:"POST",body:JSON.stringify({password:f.querySelector("input").value})});f.querySelector("input").value="";root.classList.remove("tm-locked");startShell(el,r.token,f.querySelector(".tm-target")?f.querySelector(".tm-target").value:"")}catch(e){msg.textContent=e.message;msg.classList.add("bad")}};
  }
  async function startShell(el,token,target){
   const H={"X-Terminal-Token":token};
   el.innerHTML=`<div class="tm-bar"><b>Live shell<span class="bz">即時終端</span></b><span class="tm-badge warn" data-s>connecting…</span><span class="tm-sp"></span>
     <button type="button" class="tm-btn" data-a="probe">Check machines<span class="bz">檢查可連線</span></button><button type="button" class="tm-btn" data-a="int">Ctrl+C</button><button type="button" class="tm-btn" data-a="clear">Clear<span class="bz">清除</span></button><button type="button" class="tm-btn" data-a="close">Close<span class="bz">關閉</span></button></div>
    <pre class="tm-screen tm-live" tabindex="0"></pre>
    ${(D&&D.presets&&D.presets.length)?`<div class="tm-presets"><b>Benchmark<span class="bz">一鍵帶入</span></b>${D.presets.map((p,i)=>`<button type="button" class="tm-btn${p.run?" run":""}" data-preset="${i}">${esc(p.label)}</button>`).join("")}<small>Fills the input only; press Send to run. 只帶入指令，按 Send 才會執行。</small></div>`:""}
    <form class="tm-input"><span class="tm-prompt">$</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="command"><button type="submit" class="tm-btn pri">Send<span class="bz">送出</span></button></form>
    <p class="tm-note">Runs in the repository folder with a minimal environment (no AISO_* secrets). Idle shells are closed after 15 minutes. 閒置 15 分鐘會自動關閉。</p>`;
   const scr=el.querySelector(".tm-live"),inp=el.querySelector(".tm-input input"),badge=el.querySelector("[data-s]");
   let sid=null,since=0,stop=false,hist=[],hi=0;
   const setState=(t,ok)=>{badge.textContent=t;badge.className="tm-badge "+(ok?"ok":"warn")};
   try{const o=await api("open",{method:"POST",body:JSON.stringify({target:target||null}),headers:H});sid=o.sid;setState("connected "+(target?"ssh "+target:o.cwd.split("/").slice(-2).join("/")),true)}catch(e){setState(e.message,false);return}
   async function poll(){
    if(stop||!root.isConnected)return;
    try{const r=await api(`read?sid=${sid}&since=${since}`,{headers:H});since=r.next;
     if(r.data){const atEnd=scr.scrollTop+scr.clientHeight>=scr.scrollHeight-8;scr.textContent+=r.data.replace(ANSI,"");inp.type=/(password|passphrase)[^\n]*:\s*$/i.test(scr.textContent.slice(-200))?"password":"text";if(atEnd)scr.scrollTop=scr.scrollHeight}
     if(!r.alive){setState("shell ended",false);stop=true;return}}
    catch(e){setState(e.message,false);stop=true;return}
    setTimeout(poll,350);
   }
   poll();
   const send=d=>api("write",{method:"POST",body:JSON.stringify({sid,data:d}),headers:H}).catch(e=>setState(e.message,false));
   el.querySelector(".tm-input").onsubmit=ev=>{ev.preventDefault();const v=inp.value;if(v.trim())hist.push(v);hi=hist.length;inp.value="";send(v+"\n")};
   inp.addEventListener("keydown",e=>{if(e.key==="ArrowUp"&&hist.length){hi=Math.max(0,hi-1);inp.value=hist[hi];e.preventDefault()}else if(e.key==="ArrowDown"){hi=Math.min(hist.length,hi+1);inp.value=hist[hi]||"";e.preventDefault()}else if(e.key==="c"&&e.ctrlKey){send("\x03");e.preventDefault()}});
   el.querySelector('[data-a="probe"]').onclick=async()=>{try{const r=await api("probe",{method:"POST",body:"{}",headers:H});scr.textContent+=`\n[reachability] ${r.reachable}/${r.total} machines answer on SSH:\n`+r.targets.map(x=>`  ${x.reachable?"✓":"✗"} ${x.name}  ${x.user||""}@${x.host||"?"}:${x.port||""}`).join("\n")+"\n";scr.scrollTop=scr.scrollHeight}catch(e){setState(e.message,false)}};
   el.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>{const p=D.presets[+b.dataset.preset];inp.value=p.command;inp.focus()});
   el.querySelector('[data-a="int"]').onclick=()=>send("\x03");
   el.querySelector('[data-a="clear"]').onclick=()=>{scr.textContent=""};
   el.querySelector('[data-a="close"]').onclick=async()=>{stop=true;try{await api("close",{method:"POST",body:JSON.stringify({sid}),headers:H})}catch(e){}liveInit=false;el.innerHTML=`<p class="tm-empty">Shell closed<span class="bz">已關閉</span></p>`};
   inp.focus();
  }

  const load=()=>fetch(`data/terminal/${machine}.json`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{D=d;renderRun();renderRunner();renderManifest()})
   .catch(()=>{P("run").innerHTML=`<p class="tm-empty">Terminal data not available<span class="bz">尚無終端資料</span></p>`});
  const sel=root.querySelector(".tm-pick select");if(sel)sel.onchange=()=>{machine=sel.value;load()};
  load().then(()=>initLive(P('live')));
 }

 /* Corner flyout: the terminal sits behind a tab at the top-right; hover (or click to pin) opens it like an envelope, from the corner toward the bottom-left. */
 function flyout(root){
  if(root.dataset.fly)return;root.dataset.fly="1";
  const sec=root.closest("section");if(sec&&sec.id==="secTerminal")sec.style.display="none";
  const wrap=document.createElement("div");wrap.className="tm-fly";
  wrap.innerHTML=`<button type="button" class="tm-fly-tab" aria-expanded="false" aria-controls="tmFlyPanel"><span aria-hidden="true">&gt;_</span> Terminal<span class="bz">終端機</span></button>
   <div class="tm-fly-panel" id="tmFlyPanel" role="dialog" aria-label="Terminal"><button type="button" class="tm-fly-x" aria-label="Close">✕</button></div>`;
  wrap.querySelector(".tm-fly-panel").appendChild(root);
  document.body.appendChild(wrap);
  const tab=wrap.querySelector(".tm-fly-tab");let pinned=false,timer=null;
  const set=o=>{wrap.classList.toggle("open",o);tab.setAttribute("aria-expanded",String(o))};
  const open=()=>{clearTimeout(timer);set(true)};
  const close=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!pinned&&!wrap.contains(document.activeElement))set(false)},350)};
  wrap.addEventListener("mouseenter",open);wrap.addEventListener("mouseleave",close);
  tab.addEventListener("click",()=>{pinned=!pinned||!wrap.classList.contains("open");pinned?open():set(false);wrap.classList.toggle("pinned",pinned)});
  wrap.querySelector(".tm-fly-panel").addEventListener("pointerdown",()=>{pinned=true;wrap.classList.add("pinned")});
  wrap.querySelector(".tm-fly-x").onclick=()=>{pinned=false;wrap.classList.remove("pinned");set(false)};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){pinned=false;wrap.classList.remove("pinned");set(false)}});
 }
 const _mount=mount;
 return {mount:(root,opt)=>{_mount(root,opt);if(!opt||opt.flyout!==false)flyout(root)}};
})();
