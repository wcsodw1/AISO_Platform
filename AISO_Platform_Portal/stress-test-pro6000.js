"use strict";
/* PRO6000 single-machine page. Data: data/benchmark-pro6000 (registry key "single_machines").
   Each condition carries three modes: Without aiDAPTIV (baseline), Cold (Run1) and Warm (Run2/Run3 average). Not comparable with the other machines. */
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 normalized_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token",unit:"tok/s",higher:true}};
const SERIES=[{key:"without",label:"Without aiDAPTIV",sum:"Without",color:"#8f9bff"},{key:"cold",label:"Cold (Run1)",sum:"Cold",color:"#ff8a4c"},{key:"warm",label:"Warm (Run2/3 avg)",sum:"Warm",color:"#4fd1b0"}];
const INPUTS=[1024,2048,4096,8192,16384],kn=n=>n/1024+"K";
let DS,MODEL,OUT,NP;
const runs=()=>DS.pro6000_runs;
const models=()=>[...new Set(runs().map(r=>r.model))];
const outs=m=>[...new Set(runs().filter(r=>r.model===m).map(r=>r.output))].sort((a,b)=>a-b);
const nps=(m,o)=>[...new Set(runs().filter(r=>r.model===m&&r.output===o).map(r=>r.np))].sort((a,b)=>a-b);
const cell=(i)=>runs().find(r=>r.model===MODEL&&r.output===OUT&&r.np===NP&&r.input===i);
function pick(list,cur){return list.includes(cur)?cur:list[0]}
function card(group,items,cur){return items.map(([k,l])=>`<button type="button" role="tab" class="has${String(k)===String(cur)?" on":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join("")}
function controls(){
 MODEL=pick(models(),MODEL);OUT=pick(outs(MODEL),OUT);NP=pick(nps(MODEL,OUT),NP);
 $s("pModel").innerHTML=card("model",models().map(m=>[m,m]),MODEL);
 $s("pOut").innerHTML=card("out",outs(MODEL).map(o=>[o,"Output "+(o/1024)+"K"]),OUT);
 $s("pNp").innerHTML=card("np",nps(MODEL,OUT).map(n=>[n,"NP"+n]),NP);
 document.querySelectorAll("#secPick .cmp-tabs button").forEach(b=>b.onclick=()=>{const g=b.dataset.g;if(g==="model")MODEL=b.dataset.k;if(g==="out")OUT=+b.dataset.k;if(g==="np")NP=+b.dataset.k;render()});
}
function metrics(){
 const w=Math.max(320,($s("pMetrics").clientWidth||860)-100);
 $s("pMetrics").innerHTML=BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups:INPUTS.map(i=>({label:kn(i),sub:i.toLocaleString("en-US"),i})),series:SERIES,
  get:(mk,g)=>{const r=cell(g.i);if(!r)return null;const key=k==="ttft_s"?"ttft_ms":k,v=r[key]&&r[key][mk];if(!Number.isFinite(v))return null;return {[k]:k==="ttft_s"?v/1000:v}},
  baseline:"without",width:w,context:`${MODEL} · Output ${OUT/1024}K · NP${NP}`,message:"",tableNote:"差異以 Without aiDAPTIV 為基準；綠色 + 表示較佳、紅色 − 表示較差"})));
}
function notes(){
 const p=DS.profile;
 $s("pNotes").innerHTML=`<dl class="v2-params">
  <div><dt>Machine<small class="zhs">機器</small></dt><dd>${esc(p.machine)}</dd></div>
  <div><dt>GPUs<small class="zhs">GPU</small></dt><dd>${p.gpu_count_system} in system · ${p.gpus_used} used<small class="zhs">系統 ${p.gpu_count_system} 張，啟用 ${p.gpus_used} 張</small></dd></div>
  <div><dt>Framework<small class="zhs">框架</small></dt><dd>${esc(p.framework)} · runtime unverified<small class="zhs">版本未核實</small></dd></div>
  <div><dt>Modes<small class="zhs">模式</small></dt><dd>Without aiDAPTIV · Cold (Run1) · Warm (Run2/Run3 avg)</dd></div>
  <div><dt>Source<small class="zhs">來源</small></dt><dd>${esc(DS.source_file)}</dd></div></dl>
  <p class="v2-fine">${esc(DS.comparability.text)}</p>`;
}
const num=(v,d=1)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
function params(){
 const p=DS.profile,r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 $s("pParams").innerHTML=[r("Machine <small class=\"zhs\">機器</small>",esc(p.machine)),r("Framework <small class=\"zhs\">框架</small>","vLLM · runtime unverified"),r("Model <small class=\"zhs\">模型</small>",esc(MODEL)),
  r("Input <small class=\"zhs\">輸入</small>",INPUTS.map(kn).join(" / ")),r("Output <small class=\"zhs\">輸出</small>",(OUT).toLocaleString("en-US")+" tokens"),r("NP <small class=\"zhs\">並發</small>",String(NP)),
  r("GPUs <small class=\"zhs\">GPU</small>",`${p.gpus_used} used of ${p.gpu_count_system}`),r("Modes <small class=\"zhs\">模式</small>","Without aiDAPTIV · Cold (Run1) · Warm (Run2/3 avg)"),r("Source <small class=\"zhs\">來源</small>",esc(DS.source_file))].join("");
}
function table(){
 const f=(o,k,mk,d)=>{const v=o&&o[k]&&o[k][mk];return `<td>${num(k==="ttft_ms"?v/1000:v,d)}</td>`};
 const rows=INPUTS.map(i=>{const r=cell(i);if(!r)return `<tr class="st-ovrow"><td>${kn(i)}</td><td colspan="12"><span class="st-wait">未測 Not tested</span></td></tr>`;
  return `<tr><td>${kn(i)}</td>${SERIES.map(s=>f(r,"ttft_ms",s.key,2)).join("")}${SERIES.map(s=>f(r,"tpot_ms",s.key,1)).join("")}${SERIES.map(s=>f(r,"normalized_tps",s.key,1)).join("")}${SERIES.map(s=>f(r,"aggregate_tps",s.key,1)).join("")}</tr>`}).join("");
 const grp=(t,u)=>`<th class="l" colspan="3">${t}<small>${u}</small></th>`;
 $s("pTableSub").textContent=`${MODEL} · Output ${OUT/1024}K · NP${NP} · Without / Cold / Warm 並排；「—」= 該欄沒有資料。`;
 $s("pTable").innerHTML=`<thead><tr><th rowspan="2">Input</th>${grp("TTFT","s")}${grp("TPOT","ms")}${grp("TPS Norm","tok/s/請求")}${grp("Aggregate","tok/s")}</tr><tr>${[0,1,2,3].map(()=>SERIES.map(s=>`<th>${esc(s.sum)}</th>`).join("")).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
function cover(){
 const rows=models().flatMap(m=>outs(m).map(o=>{const n=nps(m,o);return `<tr><td>${esc(m)}</td><td>Output ${o/1024}K</td><td>NP${n.join(" / NP")} · ${runs().filter(r=>r.model===m&&r.output===o).length} 組</td></tr>`})).join("");
 $s("pCover").innerHTML=`<thead><tr><th>Model</th><th>Output</th><th class="l">PRO6000 已有資料</th></tr></thead><tbody>${rows}</tbody>`;
}
function repeats(){
 const el=$s("pRepeat");if(!el||typeof RC==="undefined")return;
 el.innerHTML=RC.html({width:el.clientWidth,machines:[{key:"without",label:"Without aiDAPTIV",color:SERIES[0].color}],runsFor:()=>runs().filter(r=>r.model===MODEL&&r.output===OUT&&r.np===NP&&r.repeats&&r.repeats.without).map(r=>({np:r.np,input:r.input,repeats:{ttft_s:r.repeats.without.ttft_s}})),metric:"ttft_s",inputs:INPUTS,np:NP,title:`${MODEL} · Output ${OUT/1024}K · NP${NP}`});
 RC.bind(el);
}
function render(){controls();params();metrics();table();cover();repeats();notes()}
document.addEventListener("hvopen",()=>repeats());
fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>r.json()).then(reg=>{
 const e=(reg.single_machines||[]).find(x=>x.machine==="pro6000");if(!e)throw new Error("registry: pro6000 missing");
 window.__pfile=e.file;return fetch(e.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(e.file+" "+r.status);return r.json()})
}).then(d=>{DS=d;$s("pDl").href=window.__pfile||"#";render();$s("pFoot").textContent=`資料更新至 ${DS.evidence_until}；由 data/benchmark-registry.json 登錄的 PRO6000 資料集自動帶入。`}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
