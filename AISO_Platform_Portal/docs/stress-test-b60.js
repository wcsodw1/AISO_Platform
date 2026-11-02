"use strict";
const $s=id=>document.getElementById(id);
const MODELS=[["Laguna","Laguna XS 2.1","#c9ced6"],["Gemma31","Gemma 4 31B","#ff8a4c"]];
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false,dec:1},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:1},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
const kn=n=>`${n/1024}K`;
const tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let D,NP=1;
const row=(m,i,np)=>D.b60_runs.find(r=>r.model===m&&r.input===i&&r.np===np);
const failed=(m,i,np)=>D.failures.some(f=>f.model===m&&f.np===np&&f.input===i);
const present=np=>MODELS.filter(([m])=>D.b60_runs.some(r=>r.model===m&&r.np===np));

function renderSetup(){
 const p=D.profile,r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">量測 <b>4× Intel B60</b> 在 <b>SGLang XPU</b> 框架下，Laguna XS 2.1 與 Gemma 4 31B 的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出；B60 與 B70、AISO1 分開呈現，不混合硬體、框架或量化格式。</p></section>
 <section class="v2-pane"><h2>測試方式<span>Method</span></h2><p class="v2-goal">每個情境各跑 <b>${p.repeat} 次取平均</b>；TPS 以<b>每請求（Normalized）</b>呈現，多並發的總吞吐（Aggregate）另列。</p></section>`;
 $s("stParams").innerHTML=`${r("Machine 機器","4× Intel B60<small>TP = ${p.tp}</small>")}${r("Framework 框架",p.framework)}${r("Model 模型","Laguna XS 2.1<small>safetensors FP8</small>Gemma 4 31B<small>safetensors W4A16</small>")}${r("Context 上限",`${tok(p.context_length)} tokens`)}${r("Input 輸入",`${p.input_tokens.map(tok).join(" / ")} tokens<small>約等於 4K / 8K / 16K</small>`)}${r("Output 輸出",`${tok(p.output_tokens)} tokens`)}${r("NP 並發",p.np.join(" / "))}${r("Repeat 重複",`${p.repeat} 次取平均`)}${r("Chunked Prefill / Max Running / Radix Cache",`${tok(p.chunked_prefill)} / ${p.max_running} / ${p.radix_cache}`)}`;
 $s("stNote").textContent=`B60 實測截至 ${D.evidence_until}。Gemma 4 31B NP5 / 8K：R1 的 5/5 requests 雖成功，但其中一個 request 的 E2E 超過 1500 秒；R2 發生 Level Zero UR_RESULT_ERROR_OUT_OF_RESOURCES，整組正式測試失敗，R1 的 3.33 TPS 不可當作有效成績。`;
}
function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,width){
 const d=METRICS[k],ms=present(NP),inputs=D.profile.input_tokens,n=inputs.length;
 const L=64,R=12,T=34,B=48,H=300,ih=H-T-B,W=Math.max(width,n*130+L+R),gw=(W-L-R)/n,bw=Math.min(44,(gw-12)/ms.length);
 const vals=D.b60_runs.filter(r=>r.np===NP).map(r=>r[k]),top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 inputs.forEach((inp,q)=>{
  const x0=L+gw*q+(gw-bw*ms.length-2*(ms.length-1))/2;
  ms.forEach(([m,name,col],j)=>{const r=row(m,inp,NP),x=x0+j*(bw+2);
   if(!r){g+=`<text class="bl up2" x="${x+bw/2}" y="${y(0)-6}" text-anchor="middle">${failed(m,inp,NP)?"失敗":"—"}</text>`;return}
   const v=r[k],y1=y(v);
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${col}"><title>${name} · NP${NP} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl up2" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-24}" text-anchor="middle" class="xl">${kn(inp)}</text><text x="${L+gw*q+gw/2}" y="${H-8}" text-anchor="middle" class="xl2">${tok(inp)}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
const legend=()=>`<div class="v2-legend2">${present(NP).map(([,n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>`;
function caption(k){
 const d=METRICS[k],parts=present(NP).map(([m,n])=>{const a=row(m,4096,NP),b=row(m,16384,NP);return a&&b?`${n} ${num(a[k],d.dec)} → ${num(b[k],d.dec)}`:null}).filter(Boolean);
 return `NP${NP}：Input 由 4K 增至 16K（${d.unit}）— ${parts.join("；")||"無完整資料"}`;
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3><p class="v2-fine st-cap">${caption(k)}</p>${legend()}${chart(k,w)}</article>`).join("");
}
function renderTabs(){
 $s("stTabs").innerHTML=D.profile.np.map(n=>`<button type="button" role="tab" class="${n===NP?"on":""}" aria-selected="${n===NP}" data-np="${n}">NP${n}</button>`).join("");
 $s("stTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{NP=+b.dataset.np;renderTabs();renderMetrics();renderTable()});
}
function renderTable(){
 const cell=(r,k,m,i)=>r?`<td>${num(r[k],METRICS[k].dec)}</td>`:`<td class="st-pending">${failed(m,i,NP)?'<span class="st-over">失敗</span>':'<span class="st-wait">未執行</span>'}</td>`;
 const rows=MODELS.flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>{const r=row(m,inp,NP);
  return `<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${cell(r,"ttft_s",m,inp)}${cell(r,"tpot_ms",m,inp)}${cell(r,"decode_tps",m,inp)}</tr>`})).join("");
 $s("stTableSub").textContent=`NP${NP} · 3 次重複平均 · TPS 為每請求（Normalized）。`;
 $s("stTable").innerHTML=`<thead><tr><th>Model</th><th>Input</th><th class="l">B60 TTFT<small>s</small></th><th class="l">B60 TPOT<small>ms</small></th><th class="l">B60 TPS (Normalized)<small>tok/s / 請求</small></th></tr></thead><tbody>${rows}</tbody>`;
}
function renderAgg(){
 const nps=D.profile.np,cell=(m,i,np)=>{const r=row(m,i,np);return r?`<td>${num(r.aggregate_tps,1)}</td>`:`<td class="st-pending">${failed(m,i,np)?'<span class="st-over">失敗</span>':'<span class="st-wait">未執行</span>'}</td>`};
 const rows=MODELS.flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>`<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${nps.map(np=>cell(m,inp,np)).join("")}</tr>`)).join("");
 $s("stAgg").innerHTML=`<thead><tr><th>Model</th><th>Input</th>${nps.map(n=>`<th class="l">NP${n} Aggregate<small>tok/s</small></th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
fetch("data/benchmark-b60/AISO_B60_SGLang_20261102.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 D=d;renderSetup();renderTabs();renderMetrics();renderTable();renderAgg();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(()=>{$s("stErr").textContent="載入失敗：data/benchmark-b60/AISO_B60_SGLang_20261102.json"});
