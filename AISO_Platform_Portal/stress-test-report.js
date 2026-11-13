"use strict";
/* Stress Test report: same-parameter B60 vs B70 vs AISO1. Tables are built from data/benchmark-registry.json,
   so new/updated datasets flow in; the prose below the title is static and must be re-read after a data change. */
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const IN=[4096,8192,16384];
const KS=[["ttft_s","TTFT","s",false],["tpot_ms","TPOT","ms/token",false],["norm","TPS Normalized","tok/s/請求",true],["aggregate_tps","TPS Aggregate","tok/s",true]];
const MN={Gemma26:"Gemma 4 26B",Gemma31:"Gemma 4 31B",Laguna:"Laguna XS 2.1",Nemotron:"Nemotron 3.5"};
let REG,D={};
const get=(m,fw,model,np,i)=>{const d=D[m+"|"+fw];return d?d.runs.find(r=>r.model===model&&r.np===np&&r.input===i):null};
const val=(r,k)=>!r?null:k==="norm"?r.aggregate_tps/r.np:r[k];
const f=(v,k)=>v==null?"—":(k==="ttft_s"&&v<10?v.toFixed(2):v.toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1}));
const cav=(m,fw)=>{const d=D[m+"|"+fw];return d&&d.caveat?d.caveat:null};
const MET={ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true},aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token",unit:"tok/s",higher:true}};
function metrics(fw,model,np){   // line charts (same shared block as the compare page): x = Input, one line per machine
 const ms=REG.machines.filter(m=>IN.some(i=>get(m.key,fw,model,np,i)));
 if(!ms.length)return '<p class="v2-fine st-empty">沒有資料。</p>';
 const base=(ms.find(m=>m.key==="aiso1")||ms[0]).key,w=Math.max(320,((document.getElementById("rpA")||document.body).clientWidth||860)-100);
 const notes=[];
 return BV.blocks(Object.entries(MET).map(([k,d])=>({k,def:d,groups:IN.map(i=>({label:i/1024+"K",sub:i.toLocaleString("en-US"),i})),series:ms.map(m=>({key:m.key,label:m.label,color:m.color})),
  get:(mk,g)=>{const r=get(mk,fw,model,np,g.i);if(!r)return null;const v={ttft_s:r.ttft_s,tpot_ms:r.tpot_ms,aggregate_tps:r.aggregate_tps,norm_tps:r.aggregate_tps/r.np,ttft_over_180s:r.ttft_over_180s};return Number.isFinite(v[k])?v:null},
  baseline:ms.length>1?base:null,width:w,context:`${np===1?"NP1":"NP"+np}`,message:"",tableNote:ms.length>1?`差異以 ${(ms.find(m=>m.key===base)||{}).label} 為基準`:"只有一台機器"})));
}
function cfg(fw,model){
 const keys=[["來源 Repo","repo"],["格式／量化","format"],["後端","backend"],["TP／切分","tp"],["Max Context","max_context"],["Batch／Chunk","batch"],["Max Seqs／Slots","max_seqs"],["Memory Fraction","mem_fraction"],["Cache","cache"],["Run","run_id"],["測試日期","date"]];
 const ms=REG.machines.filter(m=>{const d=D[m.key+"|"+fw];return d&&d.runs.some(r=>r.model===model)});
 const c=(m,k)=>{const v=((D[m.key+"|"+fw].config||{})[model]||{})[k];return v==null||v===""?'<td class="cmp-unv">未核實</td>':`<td>${esc(v)}</td>`};
 return `<div class="table-wrap"><table class="v2-table v2-sc rp-c"><thead><tr><th>項目</th>${ms.map(m=>`<th class="l">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>${keys.map(([l,k])=>`<tr><td class="st-model">${l}</td>${ms.map(m=>c(m,k)).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function render(){
 $s("rpA").innerHTML=metrics("vllm","Gemma31",2)+`<div class="hv-sub hv-fold hv-closed"><div class="hv-head">Test configuration<small class="zhs">測試設定差異</small></div><div>`+cfg("vllm","Gemma31")+`</div></div>`;
 $s("rpB").innerHTML=metrics("sglang","Gemma31",2)+`<div class="hv-sub hv-fold hv-closed"><div class="hv-head">Test configuration<small class="zhs">測試設定差異</small></div><div>`+cfg("sglang","Gemma31")+`</div></div>`;
 $s("rpC").innerHTML=["Gemma26","Gemma31","Laguna","Nemotron"].map(m=>{const c=((D["b60|llamacpp"].config||{})[m]||{}).format||"";return `<h3 class="rp-h3">${esc(MN[m])} <small>${esc(c)}</small></h3>${metrics("llamacpp",m,2)}`}).join("")+`<h3 class="rp-h3">Test configuration<small class="zhs">測試設定差異 · Gemma 4 31B</small></h3>`+cfg("llamacpp","Gemma31");
 const last=Object.values(D).map(d=>d.evidence_until).sort().pop();
 $s("rpFoot").textContent=`資料更新至 ${last}；表格由 data/benchmark-registry.json 登錄的資料集即時產生，上方結論文字為 2026-11-09 的人工整理。`;
}
fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry "+r.status);return r.json()}).then(reg=>{REG=reg;
 return Promise.all(reg.datasets.map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{D[x.machine+"|"+x.framework]={runs:d[x.runs_key]||[],config:d.config_by_model||{},caveat:d.comparability||null,evidence_until:d.evidence_until}})))
}).then(render).catch(e=>{$s("rpErr").textContent="載入失敗："+e.message});
