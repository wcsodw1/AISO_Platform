"use strict";
const $s=id=>document.getElementById(id);
const MODELS=[["Laguna","Laguna XS 2.1"],["Gemma31","Gemma 4 31B"]];
const MACH=[["b60","Intel B60 · SGLang","#4fd1b0"],["b70","Intel B70 · llama.cpp","#ff8a4c"]];
const INPUTS=[4096,8192,16384],NP=2;
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false,dec:1},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:1},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let A,B;
const get=(mach,m,i)=>(mach==="b60"?A.b60_runs:B.b70_runs).find(r=>r.model===m&&r.input===i&&r.np===NP);

function renderCmp(){
 const a=A.profile,b=B.profile,r=(k,x,y)=>`<tr><td class="st-model">${k}</td><td>${x}</td><td>${y}</td><td class="st-pending"><span class="st-wait">等待 AISO1 正式測試</span></td></tr>`;
 $s("stCmp").innerHTML=`<thead><tr><th>項目</th><th class="l">Intel B60</th><th class="l">Intel B70</th><th class="a">AISO1 AMD</th></tr></thead><tbody>
 ${r("Framework 框架","SGLang XPU（TP 2）","llama.cpp（Intel SYCL）")}
 ${r("Model 格式","safetensors：Laguna FP8 / Gemma31 W4A16","GGUF Q4")}
 ${r("Context 上限",`${tok(a.context_length)} tokens`,`${tok(b.context_per_request)} tokens / request`)}
 ${r("Input 輸入",a.input_tokens.map(tok).join(" / "),b.input_tokens.map(tok).join(" / "))}
 ${r("Output 輸出",tok(a.output_tokens),tok(b.output_tokens))}
 ${r("NP 並發",a.np.join(" / "),b.np.join(" / "))}
 ${r("Repeat 重複",`${a.repeat} 次取平均`,`${b.repeat} 次取平均`)}
 ${r("Batch / UBatch",`Chunked Prefill ${tok(a.chunked_prefill)}`,`${tok(b.batch)} / ${b.ubatch}`)}</tbody>`;
}
function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,width){
 const d=METRICS[k],groups=MODELS.flatMap(([m,n])=>INPUTS.map(i=>[m,n,i])),n=groups.length;
 const L=64,R=12,T=34,B_=62,H=320,ih=H-T-B_,W=Math.max(width,n*80+L+R),gw=(W-L-R)/n,bw=Math.min(30,(gw-12)/2);
 const vals=groups.flatMap(([m,,i])=>MACH.map(([x])=>get(x,m,i)).filter(Boolean).map(r=>r[k])),top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 groups.forEach(([m,name,inp],q)=>{
  const x0=L+gw*q+(gw-bw*2-2)/2;
  MACH.forEach(([x,mn,col],j)=>{const r=get(x,m,inp);if(!r)return;const v=r[k],xx=x0+j*(bw+2),y1=y(v);
   g+=`<rect x="${xx}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${col}"><title>${name} · ${mn} · NP${NP} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl up2" x="${xx+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-38}" text-anchor="middle" class="xl">${kn(inp)}</text>`;
  if(q%INPUTS.length===1)g+=`<text x="${L+gw*q+gw/2}" y="${H-14}" text-anchor="middle" class="xl2">${name}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
const legend=()=>`<div class="v2-legend2">${MACH.map(([,n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")}<span class="st-wait">AISO1：等待正式測試</span></div>`;
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3>${legend()}${chart(k,w)}</article>`).join("");
}
function renderTable(){
 const c=(r,k)=>r?`<td>${num(r[k],METRICS[k].dec)}</td>`:"<td>—</td>";
 const rows=MODELS.flatMap(([m,n])=>INPUTS.map((inp,i)=>{const a=get("b60",m,inp),b=get("b70",m,inp);
  return `<tr>${i===0?`<td rowspan="${INPUTS.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${c(a,"ttft_s")}${c(a,"tpot_ms")}${c(a,"decode_tps")}${c(b,"ttft_s")}${c(b,"tpot_ms")}${c(b,"decode_tps")}<td colspan="3" class="st-pending"><span class="st-wait">等待 AISO1 正式測試</span></td></tr>`})).join("");
 $s("stTable").innerHTML=`<thead><tr><th rowspan="2">Model</th><th rowspan="2">Input</th><th colspan="3" class="l">B60 · SGLang · NP2</th><th colspan="3" class="l">B70 · llama.cpp · NP2</th><th colspan="3" class="a">AISO1 AMD</th></tr><tr><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS<small>tok/s</small></th><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS<small>tok/s</small></th><th class="a">TTFT</th><th class="a">TPOT</th><th class="a">TPS</th></tr></thead><tbody>${rows}</tbody>`;
}
Promise.all(["data/benchmark-b60/AISO_B60_SGLang_20261102.json","data/benchmark-b70/AISO_B70_vs_AISO1_20261030.json"].map(u=>fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(u);return r.json()}))).then(([a,b])=>{
 A=a;B=b;renderCmp();renderMetrics();renderTable();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
