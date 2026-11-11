"use strict";
/* AISO1 "Test data" layer: latest llama.cpp B1024 results, kept separate from the historical vLLM diagnostic below. */
(function(){
 const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const f=v=>Number.isFinite(v)?v.toFixed(v>=100?0:1):"—",INS=[4096,8192,16384],NPS=[1,2,4,5],MODELS=[["Gemma26","Gemma 4 26B"],["Gemma31","Gemma 4 31B"],["Laguna","Laguna XS 2.1"],["Nemotron","Nemotron 3.5 30B"]];
 fetch("data/benchmark-aiso1/AISO_AISO1_llamacpp_B1024_20261111.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
  const runs=d.aiso1_runs,get=(m,n,i)=>runs.find(r=>r.model===m&&r.np===n&&r.input===i);
  $("b1Sub").textContent=`${runs.length} / 48 條件已有 Aggregate TPS · 資料更新至 ${d.evidence_until} · Batch 1024 / Ubatch 512 / Context 18432 / KV f16 · 只有 Aggregate，TTFT／TPOT 尚缺`;
  const head=`<thead><tr><th>Model</th><th>NP</th>${INS.map(i=>`<th class="l">${i/1024}K<small>Aggregate · Norm tok/s</small></th>`).join("")}</tr></thead>`;
  const body=MODELS.map(([m,name])=>{
   const has=runs.some(r=>r.model===m);
   if(!has)return `<tr><td class="st-model">${esc(name)}</td><td colspan="${INS.length+1}" class="st-wait">待測（Runner 執行中）</td></tr>`;
   return NPS.map((n,k)=>`<tr>${k===0?`<td class="st-model" rowspan="${NPS.length}">${esc(name)}</td>`:""}<td>NP${n}</td>${INS.map(i=>{const r=get(m,n,i);return r?`<td${r.consistency_note?' class="st-over" title="'+esc(r.consistency_note)+'"':""}>${f(r.aggregate_tps)}<small> · ${f(r.aggregate_tps/n)}</small></td>`:"<td>—</td>"}).join("")}</tr>`).join("");
  }).join("");
  $("b1Table").innerHTML=head+`<tbody>${body}</tbody>`;
  $("b1Note").textContent=(d.comparability&&d.comparability.text)||"";
 }).catch(()=>{$("b1Sub").textContent="測試資料載入失敗"});
})();
