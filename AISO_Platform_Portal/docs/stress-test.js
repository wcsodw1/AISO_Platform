"use strict";
const $s=id=>document.getElementById(id);
const sEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODELS=[["Gemma26","Gemma 4 26B","#4fd1b0"],["Gemma31","Gemma 4 31B","#ff8a4c"],["Laguna","Laguna XS 2.1","#c9ced6"],["Nemotron","Nemotron 3.5","#8f9bff"]];
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false,dec:1},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:1},
 decode_tps:{short:"TPS",zh:"每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
const kn=n=>`${n/1024}K`;
const tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let D,NP=2;

const row=(m,i,np)=>D.b70_runs.find(r=>r.model===m&&r.input===i&&r.np===np);
const present=np=>MODELS.filter(([m])=>D.b70_runs.some(r=>r.model===m&&r.np===np));
const wait='<span class="st-wait">等待 AISO1 正式測試</span>';

function renderSetup(){
 const p=D.profile,r=(k,a,b)=>`<tr><th>${k}</th><td>${a}</td><td>${b}</td></tr>`;
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">以<b>相同模型、相同 llama.cpp 參數</b>，比較 <b>Intel Arc Pro B70</b> 與 <b>AISO1（AMD Ryzen AI MAX+ 395）</b>在長輸入與多並發下的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出。</p></section>
 <section class="v2-pane"><h2>測試方式及參數<span>Method &amp; Parameters</span></h2>
 <div class="table-wrap"><table class="v2-table v2-sc st-spec"><thead><tr><th></th><th>Intel B70</th><th>AISO1 AMD</th></tr></thead><tbody>
 ${r("GPU","2× Intel Arc Pro B70（2×32 GB VRAM）","Ryzen AI MAX+ 395 / Radeon 8060S（共享記憶體）")}
 ${r("llama.cpp Backend","Intel SYCL","AMD Vulkan")}
 ${r("NP 並發數",p.np.join(" / "),p.np.join(" / "))}
 ${r("Input 輸入",`${p.input_tokens.map(tok).join(" / ")} tokens<small class="v2-approx">約等於 4K / 8K / 16K / 32K / 64K</small>`,"同左")}
 ${r("Output 輸出",`${p.output_tokens} tokens`,"同左")}
 ${r("Repeat 重複",`${p.repeat} 次取平均`,"同左")}
 ${r("Context / Request",tok(p.context_per_request),"同左")}
 ${r("Batch / UBatch",`${p.batch} / ${p.ubatch}`,"同左")}
 </tbody></table></div><p class="v2-fn">測試參數參照群聯提供之 benchmark 腳本</p></section>`;
 $s("stNote").textContent=`B70 實測截至 ${D.evidence_until}；AISO1 為 v1.6 已規劃的相同規格，尚未取得正式成績。Prompt 生成方式與 GGUF SHA256 完成核對前，不宣稱公平倍率。`;
}

function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,width){
 const d=METRICS[k],ms=present(NP),inputs=D.profile.input_tokens,n=inputs.length;
 const L=64,R=12,T=34,B=48,H=300,ih=H-T-B,W=Math.max(width,n*104+L+R),gw=(W-L-R)/n,bw=Math.min(34,(gw-12)/ms.length);
 const vals=D.b70_runs.filter(r=>r.np===NP).map(r=>r[k]),top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 inputs.forEach((inp,q)=>{
  const x0=L+gw*q+(gw-bw*ms.length-2*(ms.length-1))/2;
  ms.forEach(([m,name,col],j)=>{const r=row(m,inp,NP);if(!r)return;const v=r[k],x=x0+j*(bw+2),y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${col}"><title>${name} · NP${NP} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-24}" text-anchor="middle" class="xl">${kn(inp)}</text><text x="${L+gw*q+gw/2}" y="${H-8}" text-anchor="middle" class="xl2">${tok(inp)}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
const legend=()=>`<div class="v2-legend2">${present(NP).map(([,n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")}<span class="st-wait">AISO1：等待正式測試</span></div>`;
function caption(k){
 const d=METRICS[k],parts=present(NP).map(([m,n])=>{const a=row(m,4096,NP),b=row(m,65536,NP);return a&&b?`${n} ${num(a[k],d.dec)} → ${num(b[k],d.dec)}`:null}).filter(Boolean);
 return `NP${NP}：Input 由 4K 增至 64K，${d.short} ${d.higher?"由高降至低":"由低升至高"}（${d.unit}）— ${parts.join("；")}`;
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
 const cell=(r,k)=>r?`<td${k==="ttft_s"&&r.ttft_over_180s?' class="st-over"':""}>${num(r[k],METRICS[k].dec)}</td>`:"<td>—</td>";
 const rows=present(NP).flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>{const r=row(m,inp,NP);
  return `<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${cell(r,"ttft_s")}${cell(r,"tpot_ms")}${cell(r,"decode_tps")}<td colspan="3" class="st-pending">${wait}</td><td>—</td></tr>`})).join("");
 $s("stTableSub").textContent=`NP${NP} · B70 為 3 次重複平均；AISO1 取得 v1.6 正式測試後才會填入並計算差異。`;
 $s("stTable").innerHTML=`<thead><tr><th>Model</th><th>Input</th><th class="l">B70 TTFT<small>s</small></th><th class="l">B70 TPOT<small>ms</small></th><th class="l">B70 TPS<small>tok/s</small></th><th colspan="3" class="a">AISO1 AMD<small>TTFT · TPOT · TPS</small></th><th>B70 vs AISO1<small>差異</small></th></tr></thead><tbody>${rows}</tbody>`;
}
function renderParity(){
 const label={SAME_REPO_PENDING_CROSS_MACHINE_SHA:"同 Repo，待兩台 SHA 核對",HISTORIC_SHA_MATCH_BUT_CURRENT_FILES_UNVERIFIED:"歷史 SHA 一致，需重驗本機檔案"};
 $s("stParity").innerHTML=`<thead><tr><th>Model</th><th>GGUF Repo（兩台相同）</th><th>Quant</th><th>B70 SHA256</th><th>狀態</th></tr></thead><tbody>${D.model_parity.map(p=>`<tr><td class="st-model">${sEsc(p.name)}</td><td>${sEsc(p.repo)}</td><td>${sEsc(p.quant)}</td><td class="st-sha">${p.b70_sha256?sEsc(p.b70_sha256.slice(0,12))+"…":"—"}</td><td>${sEsc(label[p.status]||p.status)}</td></tr>`).join("")}</tbody>`;
}

fetch("data/benchmark-b70/AISO_B70_vs_AISO1_20261030.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 D=d;renderSetup();renderTabs();renderMetrics();renderTable();renderParity();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(()=>{$s("stErr").textContent="載入失敗：data/benchmark-b70/AISO_B70_vs_AISO1_20261030.json"});
