"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const STD=[["Input Tokens","4K／8K／16K／32K／64K"],["Output Tokens","1024"],["NP","1／2／5（新標準）"],["Repeat","3"],["Performance Batch／Chunk","4096"],["Capacity Batch／Chunk","1024"],["TTFT","秒（越低越好）"],["TPOT","毫秒／Token（越低越好）"],["TPS","Aggregate Tokens／秒（越高越好）；另列每請求 Normalized = Aggregate ÷ NP"],["E2E 警示","超過 180 秒標記效能警示"],["TP／Cache／Context","每次記錄實際值"]];
const head=`<thead><tr><th>NP</th><th>Input</th><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Aggregate<small>tok/s</small></th><th class="l">TPS Normalized<small>tok/s / 請求</small></th><th>狀態</th></tr></thead>`;
function block(title,pass,total,rows){
 return `<h3 class="st-mh">${esc(title)}<small>${pass}/${total} PASS</small></h3><div class="table-wrap"><table class="v2-table v2-sc"><caption class="sr-only">${esc(title)}</caption>${head}<tbody>${rows.join("")}</tbody></table></div>`;
}
const okRow=(r,span)=>{const warn=r.e2e_s>180;return `<tr><td>${r.np}</td><td>${kn(r.input)}</td><td>${num(r.ttft_s,2)}</td><td>${num(r.tpot_ms,2)}</td><td>${num(r.aggregate_tps,2)}</td><td>${num(r.decode_tps,2)}</td><td>✅${warn?` <span class="st-over">⚠ E2E ${num(r.e2e_s,0)} s 效能警示</span>`:""}</td></tr>`};
const badRow=(np,i,txt)=>`<tr><td>${np}</td><td>${kn(i)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${txt}</td></tr>`;

function renderStd(){$s("stStd").innerHTML=`<thead><tr><th>Parameter</th><th class="l">統一比較目標</th></tr></thead><tbody>${STD.map(([k,v])=>`<tr><td class="st-model">${k}</td><td>${v}</td></tr>`).join("")}</tbody>`}

function renderB60(A){
 const p=A.profile;
 $s("b60Meta").textContent=`${p.machine}｜TP${p.tp}｜Chunk ${tok(p.chunked_prefill)}｜Context ${tok(p.context_length)}｜Max Running ${p.max_running}｜Radix Cache ${p.radix_cache}｜Output ${tok(p.output_tokens)}｜R${p.repeat}`;
 const total=p.np.length*p.input_tokens.length;
 $s("b60Tables").innerHTML=[["Laguna","Laguna FP8"],["Gemma31","Gemma31 W4A16"]].map(([m,t])=>{
  const rows=[];let pass=0;
  p.np.forEach(np=>p.input_tokens.forEach(i=>{const r=A.b60_runs.find(x=>x.model===m&&x.np===np&&x.input===i);
   if(r){pass++;rows.push(okRow(r))}else{const f=A.failures.find(x=>x.model===m&&x.np===np&&x.input===i);rows.push(badRow(np,i,f&&/失敗/.test(f.reason)&&f.input===8192?"❌ 失敗":"⏸️ 未執行"))}}));
  return block(t,pass,total,rows)}).join("")+
  `<p class="v2-fn">Gemma31 NP5／8K：${esc(A.failures[0].reason)}</p>`;
}

function renderB70(B){
 const runs=B.b70_runs.filter(r=>r.model==="Nemotron"),p=B.model_parity.find(x=>x.model==="Nemotron");
 $s("b70Meta").textContent=`2× B70｜llama.cpp｜GGUF ${p.quant.replace("UD-","")}｜Output ${tok(B.profile.output_tokens)}｜Repeat ${B.profile.repeat}｜SHA256 已核對（${p.b70_sha256.slice(0,12)}…）`;
 const rows=runs.sort((a,b)=>a.np-b.np||a.input-b.input).map(r=>okRow(r));
 $s("b70Tables").innerHTML=block("Nemotron 3.5 Lightning 30B-A3B",runs.length,runs.length,rows);
}

function renderAiso1(){
 const r=(f,m,s)=>`<tr><td>${f}</td><td class="st-model">${m}</td><td class="st-pending"><span class="st-wait">${s}</span></td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
 $s("stAiso1").innerHTML=`<thead><tr><th>Framework</th><th>Model</th><th>NP / Input</th><th class="l">TTFT</th><th class="l">TPOT</th><th class="l">TPS</th><th>狀態</th></tr></thead><tbody>${r("llama.cpp","Gemma26","待核")}${r("llama.cpp","Gemma31","待核")}${r("llama.cpp","Nemotron","待核")}${r("llama.cpp","Laguna","待核")}${r("vLLM","Gemma31","歷史部分測試・待核")}</tbody>`;
}

Promise.all(["data/benchmark-b60/AISO_B60_SGLang_20261102.json","data/benchmark-b70/AISO_B70_vs_AISO1_20261030.json"].map(u=>fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(u);return r.json()}))).then(([A,B])=>{
 $s("stNote").textContent=`B60 實測截至 ${A.evidence_until}；B70 Nemotron 3.5 實測截至 2026-10-15。`;
 renderStd();renderB60(A);renderB70(B);renderAiso1();
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
