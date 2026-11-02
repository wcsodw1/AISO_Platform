"use strict";
const $s=id=>document.getElementById(id);
const NAMES={Gemma26:"Gemma 4 26B",Gemma31:"Gemma 4 31B",Laguna:"Laguna XS 2.1",Nemotron:"Nemotron 3.5"};
const MACH=[["b60","Intel B60 · SGLang","#4fd1b0"],["b70","Intel B70 · llama.cpp","#ff8a4c"]];
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false,dec:1},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:1},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const wait='<span class="st-wait">等待 AISO1 正式測試</span>';
let A,B,SC=[];
const runs=mach=>mach==="b60"?A.b60_runs:B.b70_runs;
const get=(mach,m,np,i)=>runs(mach).find(r=>r.model===m&&r.np===np&&r.input===i);

// scenarios where B60 and B70 ran identical NP / Input for the same model
function scenarios(){
 return Object.keys(NAMES).flatMap(m=>A.profile.np.flatMap(np=>A.profile.input_tokens.map(i=>[m,np,i]))).filter(([m,np,i])=>get("b60",m,np,i)&&get("b70",m,np,i));
}
function renderCmp(){
 const a=A.profile,b=B.profile,same='<span class="st-same-t">相同</span>',diff='<span class="st-over">不同</span>',
  r=(k,x,y,f)=>`<tr><td class="st-model">${k}</td><td>${x}</td><td>${y}</td><td class="st-pending"><span class="st-wait">待核</span></td><td>${f}</td></tr>`;
 const npI=a.np.filter(n=>b.np.includes(n)),inI=a.input_tokens.filter(n=>b.input_tokens.includes(n));
 $s("stCmp").innerHTML=`<thead><tr><th>項目</th><th class="l">Intel B60</th><th class="l">Intel B70</th><th class="a">AISO1 AMD</th><th>比對用</th></tr></thead><tbody>
 ${r("NP 並發",a.np.join(" / "),b.np.join(" / "),`重疊 NP${npI.join(" / ")} ${same}`)}
 ${r("Input 輸入",a.input_tokens.map(kn).join(" / "),b.input_tokens.map(kn).join(" / "),`重疊 ${inI.map(kn).join(" / ")} ${same}`)}
 ${r("Output 輸出",tok(a.output_tokens),tok(b.output_tokens),same)}
 ${r("Repeat 重複",`${a.repeat} 次取平均`,`${b.repeat} 次取平均`,same)}
 ${r("Framework 框架","SGLang XPU（4× B60，TP2）","llama.cpp（Intel SYCL）",diff)}
 ${r("模型格式","safetensors：Laguna FP8 / Gemma31 W4A16","GGUF Q4",diff)}
 ${r("Context 上限",`${tok(a.context_length)} tokens`,`${tok(b.context_per_request)} tokens / request`,diff)}
 ${r("Batch","Chunked Prefill "+tok(a.chunked_prefill),`${tok(b.batch)} / UBatch ${b.ubatch}`,diff)}</tbody>`;
 $s("stCmpFn").textContent="NP、Input、Output、Repeat 相同的情境才進入比對；框架、模型格式、Context、Batch 不同，數字僅反映各自設定下的表現，不代表單純的硬體差異。";
}
function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,width){
 const d=METRICS[k],n=SC.length,L=64,R=12,T=34,B_=62,H=320,ih=H-T-B_,W=Math.max(width,n*84+L+R),gw=(W-L-R)/n,bw=Math.min(30,(gw-12)/2);
 const top=Math.max(...SC.flatMap(([m,np,i])=>MACH.map(([x])=>get(x,m,np,i)[k]))),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 SC.forEach(([m,np,inp],q)=>{
  const x0=L+gw*q+(gw-bw*2-2)/2;
  MACH.forEach(([x,mn,col],j)=>{const v=get(x,m,np,inp)[k],xx=x0+j*(bw+2),y1=y(v);
   g+=`<rect x="${xx}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${col}"><title>${NAMES[m]} · ${mn} · NP${np} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl up2" x="${xx+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-38}" text-anchor="middle" class="xl">${kn(inp)}</text><text x="${L+gw*q+gw/2}" y="${H-22}" text-anchor="middle" class="xl2">NP${np}</text><text x="${L+gw*q+gw/2}" y="${H-6}" text-anchor="middle" class="xl2">${NAMES[m]}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
const legend=()=>`<div class="v2-legend2">${MACH.map(([,n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")}<span class="st-wait">AISO1：等待正式測試</span></div>`;
function renderMetrics(){
 if(!SC.length){$s("stMetrics").innerHTML='<p class="v2-fine">目前沒有參數相同的情境。</p>';return}
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3>${legend()}${chart(k,w)}</article>`).join("");
}
function renderTable(){
 const c=(r,k,d)=>`<td>${num(r[k],d)}</td>`;
 const rows=SC.map(([m,np,i])=>{const a=get("b60",m,np,i),b=get("b70",m,np,i);
  return `<tr><td class="st-model">${NAMES[m]}</td><td>NP${np}</td><td>${kn(i)}</td>${c(a,"ttft_s",1)}${c(a,"tpot_ms",1)}${c(a,"decode_tps",1)}${c(a,"aggregate_tps",1)}${c(b,"ttft_s",1)}${c(b,"tpot_ms",1)}${c(b,"decode_tps",1)}${c(b,"aggregate_tps",1)}<td colspan="3" class="st-pending">${wait}</td></tr>`}).join("");
 const sub=(x)=>`<th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th>`;
 $s("stTable").innerHTML=`<thead><tr><th rowspan="2">Model</th><th rowspan="2">NP</th><th rowspan="2">Input</th><th colspan="4" class="l">Intel B60 · SGLang</th><th colspan="4" class="l">Intel B70 · llama.cpp</th><th colspan="3" class="a">AISO1 AMD</th></tr><tr>${sub()}${sub()}<th class="a">TTFT</th><th class="a">TPOT</th><th class="a">TPS</th></tr></thead><tbody>${rows||'<tr><td colspan="14">目前沒有參數相同的情境。</td></tr>'}</tbody>`;
}
function renderCover(){
 const desc=(mach,m)=>{const rs=runs(mach).filter(r=>r.model===m);if(!rs.length)return '<span class="st-wait">無資料</span>';
  const nps=[...new Set(rs.map(r=>r.np))].sort((a,b)=>a-b),ins=rs.map(r=>r.input);return `NP${nps.join("/")} · ${kn(Math.min(...ins))}–${kn(Math.max(...ins))} · ${rs.length} 筆`};
 const cmp=m=>{const n=SC.filter(s=>s[0]===m).length;return n?`${n} 個情境可比對`:"—"};
 $s("stCover").innerHTML=`<thead><tr><th>Model</th><th class="l">B60</th><th class="l">B70</th><th class="a">AISO1</th><th>可比對</th></tr></thead><tbody>${Object.keys(NAMES).map(m=>`<tr><td class="st-model">${NAMES[m]}</td><td>${desc("b60",m)}</td><td>${desc("b70",m)}</td><td class="st-pending"><span class="st-wait">待核</span></td><td>${cmp(m)}</td></tr>`).join("")}</tbody>`;
}
Promise.all(["data/benchmark-b60/AISO_B60_SGLang_20261102.json","data/benchmark-b70/AISO_B70_vs_AISO1_20261030.json"].map(u=>fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(u);return r.json()}))).then(([a,b])=>{
 A=a;B=b;SC=scenarios();
 $s("stNote").textContent=`B60 實測截至 ${A.evidence_until}；B70 實測截至 ${B.evidence_until}。目前 ${SC.length} 個情境兩台都有跑且參數相同。`;
 renderCmp();renderMetrics();renderTable();renderCover();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
