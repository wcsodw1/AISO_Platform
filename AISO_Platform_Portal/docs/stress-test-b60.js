"use strict";
const $s=id=>document.getElementById(id);
const ALL_MODELS=[["Gemma26","Gemma 4 26B","#4fd1b0"],["Gemma31","Gemma 4 31B","#ff8a4c"],["Laguna","Laguna XS 2.1","#c9ced6"],["Nemotron","Nemotron 3.5","#8f9bff"]];
const FRAMEWORKS=[{key:"sglang",label:"SGLang",file:"data/benchmark-b60/AISO_B60_SGLang_20261102.json"},{key:"vllm",label:"vLLM",file:"data/benchmark-b60/AISO_B60_vLLM_20261103.json"}];
const DATA={};
const FWCOL={sglang:"#4fd1b0",vllm:"#8f9bff"};
let MODELS=[];
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false,dec:1},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:1},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
const kn=n=>`${n/1024}K`;
const tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let D,NP=1,FW="sglang";
const row=(m,i,np)=>D.b60_runs.find(r=>r.model===m&&r.input===i&&r.np===np);
const failed=(m,i,np)=>(D.failures||[]).some(f=>f.model===m&&f.np===np&&f.input===i);
const present=np=>MODELS.filter(([m])=>D.b60_runs.some(r=>r.model===m&&r.np===np));

function renderSetup(){
 const p=D.profile,r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`,fw=FRAMEWORKS.find(f=>f.key===FW).label;
 const names=MODELS.map(([,n])=>n).join(" / ");
 const par=D.model_parity.map(m=>`${m.name}<small>${m.repo!=="UNVERIFIED"?m.repo+" · "+m.format:"來源／量化待核"}</small>`).join("");
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">量測 <b>Intel B60（96 GB，48 GB × 2）</b> 在 <b>${fw}</b> 框架下，${names} 的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出；B60 與 B70、AISO1、不同框架分開呈現，不混合硬體、框架或量化格式。</p></section>
 <section class="v2-pane"><h2>測試方式<span>Method</span></h2><p class="v2-goal">每個情境各跑 <b>${p.repeat} 次取平均</b>；TPS 以<b>每請求（Normalized）</b>呈現，多並發的總吞吐（Aggregate）另列。</p></section>`;
 const knob=FW==="vllm"?r("Max Num Seqs / Prefill / Memory / Prefix Cache",`${p.max_num_seqs} / ${tok(p.prefill_tokens)} / ${p.memory_fraction} / ${p.prefix_cache}`):r("Chunked Prefill / Max Running / Radix Cache",`${tok(p.chunked_prefill)} / ${p.max_running} / ${p.radix_cache}`);
 $s("stParams").innerHTML=`${r("Machine 機器",`Intel B60 · ${p.vram_total_gb} GB<small>${p.vram_layout.replace(" x "," × ")}（2 張）· 4 GPU devices · TP ${p.tp}</small>`)}${r("Framework 框架",`${p.framework}<small>${p.runtime==="UNVERIFIED"?"Runtime 映像待核":p.runtime}</small>`)}${r("Model 模型",par)}${r("Context 上限",`${tok(p.context_length)} tokens`)}${r("Input 輸入",`${p.input_tokens.map(tok).join(" / ")} tokens<small>約等於 4K / 8K / 16K</small>`)}${r("Output 輸出",`${tok(p.output_tokens)} tokens`)}${r("NP 並發",p.np.join(" / "))}${r("Repeat 重複",`${p.repeat} 次取平均`)}${knob}`;
 const nr=(D.not_run||[]).map(x=>`${(ALL_MODELS.find(m=>m[0]===x.model)||[,x.model])[1]}：${x.reason}`).join("；");
 $s("stNote").textContent=`B60 ${fw} 實測截至 ${D.evidence_until}。${nr?"未有成績："+nr+"。":""}${p.memory_fraction==="UNVERIFIED"?"memory fraction 未驗證，不標示。":""}`;
 $s("stVerdict").innerHTML=VERDICT[FW](D);
 $s("stFw").innerHTML=FRAMEWORKS.map(f=>`<button type="button" role="tab" class="${f.key===FW?"on":""}" aria-selected="${f.key===FW}" data-fw="${f.key}">${f.label}</button>`).join("");
 $s("stFw").querySelectorAll("button").forEach(b=>b.onclick=()=>setFw(b.dataset.fw));
}
const VERDICT={
 sglang:()=>'18/18 PASS：Gemma 4 31B NP5 的 8K / 16K 由重跑補齊<span class="zh-i">原始 Full 測試 NP5 / 8K 失敗（保留紀錄）；重跑後 Laguna 9/9、Gemma 4 31B 9/9 PASS</span>',
 vllm:d=>`9/9 PASS：Gemma 4 31B（vLLM，72/72 requests）<span class="zh-i">其餘三個模型待測；TTFT ≥ 180 秒的情境以紅字標示（${d.b60_runs.filter(r=>r.ttft_over_180s).map(r=>`NP${r.np}/${kn(r.input)}`).join("、")}），仍為 Technical PASS</span>`};
function setFw(k){
 FW=k;D=DATA[k];MODELS=ALL_MODELS.filter(([m])=>D.b60_runs.some(r=>r.model===m));
 NP=D.profile.np.includes(NP)?NP:D.profile.np[0];
 renderSetup();renderTabs();renderMetrics();renderTable();renderAgg();renderRetry();renderFw();
 $s("stDataTitle").textContent=`B60 ${FRAMEWORKS.find(f=>f.key===FW).label} 已驗證實測 ${D.b60_runs.length} 筆`+(D.b60_runs.some(r=>r.retry)?`（含 ${D.b60_runs.filter(r=>r.retry).length} 筆重跑）`:"");
 $s("stDl").href=FRAMEWORKS.find(f=>f.key===FW).file;
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
   const v=r[k],y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${col}"><title>${name} · NP${NP} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
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
 $s("stTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{NP=+b.dataset.np;renderTabs();renderMetrics();renderTable();renderFw()});
}
function renderTable(){
 const cell=(r,k,m,i)=>r?`<td${k==="ttft_s"&&r.ttft_over_180s?' class="st-over"':""}>${num(r[k],METRICS[k].dec)}</td>`:`<td class="st-pending">${failed(m,i,NP)?'<span class="st-over">失敗</span>':'<span class="st-wait">未執行</span>'}</td>`;
 const rows=MODELS.flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>{const r=row(m,inp,NP);
  return `<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${cell(r,"ttft_s",m,inp)}${cell(r,"tpot_ms",m,inp)}${cell(r,"decode_tps",m,inp)}<td>${r?(r.retry?"† 重跑":"Full"):"—"}${r&&r.consistency_note?" ‡":""}</td></tr>`})).join("");
 $s("stTableSub").textContent=`NP${NP} · 3 次重複平均 · TPS 為每請求（Normalized）。`;
 $s("stTable").innerHTML=`<thead><tr><th>Model</th><th>Input</th><th class="l">B60 TTFT<small>s</small></th><th class="l">B60 TPOT<small>ms</small></th><th class="l">B60 TPS (Normalized)<small>tok/s / 請求</small></th><th>來源</th></tr></thead><tbody>${rows}</tbody>`;
}
function renderAgg(){
 const nps=D.profile.np,cell=(m,i,np)=>{const r=row(m,i,np);return r?`<td>${num(r.aggregate_tps,1)}${r.retry?" †":""}</td>`:`<td class="st-pending">${failed(m,i,np)?'<span class="st-over">失敗</span>':'<span class="st-wait">未執行</span>'}</td>`};
 const rows=MODELS.flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>`<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>${nps.map(np=>cell(m,inp,np)).join("")}</tr>`)).join("");
 $s("stAgg").innerHTML=`<thead><tr><th>Model</th><th>Input</th>${nps.map(n=>`<th class="l">NP${n} Aggregate<small>tok/s</small></th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
function renderRetry(){
 $s("secRetry").hidden=!D.retry;if(!D.retry)return;
 const f=D.failures[0],r=D.retry;
 $s("stRetry").innerHTML=`<b>原始 Full</b>（${f.run_id}）：Gemma 4 31B NP${f.np} / ${kn(f.input)} — ${f.status}。${f.reason}<br><b>重跑</b>（${r.run_id}）：僅重跑 NP5 的 8K / 16K，exit code ${r.exit_code}，failed models ${r.failed_models}，兩個情境均 PASS。${r.note}<br>原始失敗紀錄保留，不被重跑覆蓋；原始 R1 的 3.33 TPS 仍不可當作有效成績。`;
}

// ---- 同參數、不同框架比對（同機器、同模型、同 NP / Input）----
const frow=(k,m,i,np)=>(DATA[k]?DATA[k].b60_runs:[]).find(r=>r.model===m&&r.input===i&&r.np===np);
const fwModels=()=>ALL_MODELS.filter(([m])=>FRAMEWORKS.every(f=>DATA[f.key]&&DATA[f.key].b60_runs.some(r=>r.model===m&&r.np===NP)));
function fwChart(k,m,width){
 const d=METRICS[k],inputs=D.profile.input_tokens,n=inputs.length,ser=FRAMEWORKS;
 const L=64,R=12,T=34,B=48,H=280,ih=H-T-B,W=Math.max(width,n*130+L+R),gw=(W-L-R)/n,bw=Math.min(44,(gw-12)/ser.length);
 const vals=ser.flatMap(f=>inputs.map(i=>frow(f.key,m,i,NP)).filter(Boolean).map(r=>r[k])),top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 inputs.forEach((inp,q)=>{
  const x0=L+gw*q+(gw-bw*ser.length-2*(ser.length-1))/2;
  ser.forEach((f,j)=>{const r=frow(f.key,m,inp,NP),x=x0+j*(bw+2);
   if(!r){g+=`<text class="bl up2" x="${x+bw/2}" y="${y(0)-6}" text-anchor="middle">—</text>`;return}
   const v=r[k],y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${FWCOL[f.key]}"><title>${f.label} · NP${NP} · ${tok(inp)}: ${num(v,d.dec)} ${d.unit}</title></rect><text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${num(v,v>=100?0:d.dec)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-24}" text-anchor="middle" class="xl">${kn(inp)}</text><text x="${L+gw*q+gw/2}" y="${H-8}" text-anchor="middle" class="xl2">${tok(inp)}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short} SGLang vs vLLM">${g}</svg></div>`;
}
function renderFw(){
 const ms=fwModels(),el=$s("stFwCmp");
 if(!ms.length){el.innerHTML='<p class="v2-fine">NP'+NP+' 尚無兩個框架皆有的成績。</p>';$s("stFwTable").innerHTML="";return}
 const w=Math.max(320,(el.clientWidth||860)-100),legend=`<div class="v2-legend2">${FRAMEWORKS.map(f=>`<span><i style="background:${FWCOL[f.key]}"></i>${f.label}</span>`).join("")}</div>`;
 el.innerHTML=ms.map(([m,n])=>`<h3 class="st-fwm">${n}<small>NP${NP} · 同機器 B60 · 同 Input／Output／Repeat</small></h3>`+Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3>${legend}${fwChart(k,m,w)}</article>`).join("")).join("");
 const [a,b]=FRAMEWORKS,ratio=(x,y)=>x&&y?`${(y/x).toFixed(2)}×`:"—";
 const cell=(r,k)=>r?num(r[k],METRICS[k].dec):"—";
 const rows=ms.flatMap(([m,n])=>D.profile.input_tokens.map((inp,i)=>{const x=frow(a.key,m,inp,NP),y2=frow(b.key,m,inp,NP);
  return `<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${n}</td>`:""}<td>${kn(inp)}</td>`+["ttft_s","tpot_ms","decode_tps"].map(k=>`<td>${cell(x,k)}</td><td>${cell(y2,k)}</td><td>${x&&y2?ratio(x[k],y2[k]):"—"}</td>`).join("")+"</tr>"})).join("");
 $s("stFwTable").innerHTML=`<thead><tr><th>Model</th><th>Input</th>${["TTFT s","TPOT ms","TPS (Norm.)"].map(t=>`<th class="l">${a.label} ${t}</th><th class="l">${b.label} ${t}</th><th>${b.label} ÷ ${a.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
Promise.all(FRAMEWORKS.map(f=>fetch(f.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(f.file+" "+r.status);return r.json()}).then(d=>{DATA[f.key]=d}))).then(()=>{
 setFw("sglang");
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
