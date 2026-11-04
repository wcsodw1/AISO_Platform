"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true}};
const FWCOL={sglang:"#4fd1b0",vllm:"#8f9bff",llamacpp:"#ff8a4c"};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const val=(k,v)=>k==="ttft_s"&&v<10?num(v,2):num(v,1);
let REG,DATA={},D,MODELS=[],NP=1,FW="sglang";
const FWS=()=>REG.frameworks;
const fwLabel=k=>FWS().find(f=>f.key===k).label;
const row=(m,i,np,fw=FW)=>(DATA[fw]?DATA[fw].b60_runs:[]).find(r=>r.model===m&&r.input===i&&r.np===np);
const failed=(m,i,np)=>(D.failures||[]).some(f=>f.model===m&&f.np===np&&f.input===i);
const present=np=>MODELS.filter(m=>D.b60_runs.some(r=>r.model===m.key&&r.np===np));
const hasRuns=fw=>DATA[fw]&&DATA[fw].b60_runs.length>0;

const VERDICT={
 sglang:d=>`${d.b60_runs.length}/${d.b60_runs.length} PASS（歷史結果，非 V4）：Gemma 4 31B NP5 的 8K / 16K 由重跑補齊<span class="zh-i">原始 Full 測試 NP5 / 8K 失敗（保留紀錄）；Laguna 9/9、Gemma 4 31B 9/9；Gemma 4 26B、Nemotron 無法啟動</span>`,
 vllm:d=>`${d.b60_runs.length}/${d.b60_runs.length} PASS（歷史結果，非 V4）：Gemma 4 31B 與 Laguna XS 2.1 各 9/9<span class="zh-i">Gemma 4 26B、Nemotron 待測；TTFT ≥ 180 秒的情境以紅字標示（${d.b60_runs.filter(r=>r.ttft_over_180s).map(r=>`${r.model==="Gemma31"?"Gemma31":r.model} NP${r.np}/${kn(r.input)}`).join("、")}），仍為 Technical PASS</span>`,
 llamacpp:()=>`尚無完整測試結果<span class="zh-i">環境建置／Debug 中：GGUF 檔案已找到，來源與執行設定尚待核驗</span>`};

function renderSetup(){
 const p=D.profile,r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`,fw=fwLabel(FW);
 const names=MODELS.map(m=>m.name).join(" / ")||"四個模型";
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">量測 <b>Intel B60（96 GB，48 GB × 2）</b> 在 <b>${fw}</b> 框架下，各模型的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出（Normalized 與 Aggregate）；B60 與 B70、AISO1、不同框架分開呈現，不混合硬體、框架或量化格式。</p></section>
 <section class="v2-pane"><h2>測試方式<span>Method</span></h2><p class="v2-goal">每個情境各跑 <b>${p.repeat} 次取平均</b>；TPS Normalized = Aggregate ÷ NP（每請求），Aggregate = 總輸出 token ÷ 同批 E2E 時間（含首字等待）。</p></section>`;
 const par=D.model_parity.length?D.model_parity.map(m=>`${m.name}<small>${m.repo!=="UNVERIFIED"?esc(m.repo)+" · "+esc(m.format):"來源／量化待核"}</small>`).join(""):"尚無已核實的模型來源";
 const knob=FW==="vllm"?r("Max Num Seqs / Prefill / Memory / Prefix Cache",`${p.max_num_seqs} / ${tok(p.prefill_tokens)} / ${p.memory_fraction} / ${p.prefix_cache}`):FW==="sglang"?r("Chunked Prefill / Max Running / Memory / Radix Cache",`${tok(p.chunked_prefill)} / ${p.max_running} / ${p.memory_fraction} / ${p.radix_cache}`):"";
 $s("stParams").innerHTML=`${r("Machine 機器",`Intel B60 · ${p.vram_total_gb} GB<small>${p.vram_layout.replace(" x "," × ")}（2 張）· 4 GPU devices · TP ${p.tp}</small>`)}${r("Framework 框架",`${p.framework}<small>${p.runtime==="UNVERIFIED"?"Runtime 映像待核":esc(p.runtime)}</small>`)}${r("Model 模型",par)}${r("Context 上限",`${tok(p.context_length)} tokens`)}${r("Input 輸入",`${p.input_tokens.map(tok).join(" / ")} tokens<small>約等於 4K / 8K / 16K</small>`)}${r("Output 輸出",`${tok(p.output_tokens)} tokens`)}${r("NP 並發",p.np.join(" / "))}${r("Repeat 重複",`${p.repeat} 次取平均`)}${knob}`;
 const nr=(D.not_run||[]).map(x=>`${(REG.models.find(m=>m.key===x.model)||{name:x.model}).name}：${x.reason}`).join("；");
 $s("stNote").textContent=[`B60 ${fw} 實測截至 ${D.evidence_until}。`,nr?"未有成績："+nr+"。":"",...(D.protocol_notes||[])].filter(Boolean).join(" ");
 $s("stVerdict").innerHTML=VERDICT[FW](D);
 $s("stFw").innerHTML=FWS().map(f=>`<button type="button" role="tab" class="${f.key===FW?"on":""}" aria-selected="${f.key===FW}" data-fw="${f.key}">${f.label}</button>`).join("");
 $s("stFw").querySelectorAll("button").forEach(b=>b.onclick=()=>setFw(b.dataset.fw));
}
function setFw(k){
 FW=k;D=DATA[k];MODELS=REG.models.filter(m=>D.b60_runs.some(r=>r.model===m.key));
 NP=D.profile.np.includes(NP)?NP:D.profile.np[0];
 renderSetup();$s("secMetrics").hidden=!hasRuns(k);
 if(hasRuns(k)){renderTabs();renderMetrics()}
 renderFull();renderRetry();renderFw();
 $s("stDataTitle").textContent=`B60 ${fwLabel(FW)} 已驗證實測 ${D.b60_runs.length} 筆`+(D.b60_runs.some(r=>r.retry)?`（含 ${D.b60_runs.filter(r=>r.retry).length} 筆重跑）`:"");
 $s("stDl").href=REG.datasets.find(x=>x.machine==="b60"&&x.framework===k).file;
}
function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function bars(k,groups,series,width,H){
 // groups: [{label,sub}] ; series: [{key,label,color,get:(g)=>row|null}]
 const d=METRICS[k],n=groups.length,L=64,R=12,T=34,B=48,ih=H-T-B,W=Math.max(width,n*130+L+R),gw=(W-L-R)/n,bw=Math.min(44,(gw-12)/series.length);
 const vals=groups.flatMap(g=>series.map(s=>s.get(g)).filter(Boolean).map(r=>r[k])),top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let s="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 s+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 groups.forEach((g,q)=>{
  const x0=L+gw*q+(gw-bw*series.length-2*(series.length-1))/2;
  series.forEach((se,j)=>{const r=se.get(g),x=x0+j*(bw+2);
   if(!r){s+=`<text class="bl up2" x="${x+bw/2}" y="${y(0)-6}" text-anchor="middle">${se.miss&&se.miss(g)||"—"}</text>`;return}
   const v=r[k],y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
   s+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${se.color}"><title>${esc(se.label)} · ${esc(g.label)}: ${val(k,v)} ${d.unit}</title></rect><text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${v>=100?num(v,0):val(k,v)}</text>`});
  s+=`<text x="${L+gw*q+gw/2}" y="${H-24}" text-anchor="middle" class="xl">${esc(g.label)}</text><text x="${L+gw*q+gw/2}" y="${H-8}" text-anchor="middle" class="xl2">${esc(g.sub||"")}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${s}</svg></div>`;
}
const legend=items=>`<div class="v2-legend2">${items.map(([n,c])=>`<span><i style="background:${c}"></i>${esc(n)}</span>`).join("")}</div>`;
function chart(k,width){
 const groups=D.profile.input_tokens.map(i=>({label:kn(i),sub:tok(i),i})),
  series=present(NP).map(m=>({label:m.name,color:m.color,get:g=>row(m.key,g.i,NP),miss:g=>failed(m.key,g.i,NP)?"失敗":"—"}));
 return bars(k,groups,series,width,300).replace('aria-label="','aria-label="NP'+NP+' ');
}
function caption(k){
 const d=METRICS[k],parts=present(NP).map(m=>{const a=row(m.key,4096,NP),b=row(m.key,16384,NP);return a&&b?`${m.name} ${val(k,a[k])} → ${val(k,b[k])}`:null}).filter(Boolean);
 return `NP${NP}：Input 由 4K 增至 16K（${d.unit}）— ${parts.join("；")||"無完整資料"}`;
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3><p class="v2-fine st-cap">${caption(k)}</p>${legend(present(NP).map(m=>[m.name,m.color]))}${chart(k,w)}</article>`).join("");
}
function renderTabs(){
 $s("stTabs").innerHTML=D.profile.np.map(n=>`<button type="button" role="tab" class="${n===NP?"on":""}" aria-selected="${n===NP}" data-np="${n}">NP${n}</button>`).join("");
 $s("stTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{NP=+b.dataset.np;renderTabs();renderMetrics();renderFw()});
}
// ---- B60 完整測試總表：四個模型 × (NP × Input) × 四個指標 ----
function renderFull(){
 const p=D.profile,cases=p.np.flatMap(np=>p.input_tokens.map(i=>[np,i]));
 const cell=(r,k,m,np,i)=>r?`<td${k==="ttft_s"&&r.ttft_over_180s?' class="st-over"':""}>${val(k,r[k])}</td>`:`<td class="st-pending">${failed(m,i,np)?'<span class="st-over">失敗</span>':"—"}</td>`;
 const body=REG.models.map(m=>{
  const rs=D.b60_runs.filter(r=>r.model===m.key);
  if(!rs.length){const nr=(D.not_run||[]).find(x=>x.model===m.key);
   return `<tr><td class="st-model">${esc(m.name)}</td><td colspan="7" class="st-pending"><span class="st-wait">${esc(nr?nr.reason:"待測")}</span></td></tr>`}
  return cases.map(([np,i],q)=>{const r=row(m.key,i,np);
   return `<tr>${q===0?`<td rowspan="${cases.length}" class="st-model">${esc(m.name)}<small>${esc(rs[0].format||"")}</small></td>`:""}<td>NP${np}</td><td>${kn(i)}</td>${cell(r,"ttft_s",m.key,np,i)}${cell(r,"tpot_ms",m.key,np,i)}${cell(r,"decode_tps",m.key,np,i)}<td>${r?num(r.aggregate_tps,1)+(r.retry?" †":"")+(r.consistency_note?" ‡":""):"—"}</td><td>${r?(r.retry?"† 重跑":"Full"):"—"}</td></tr>`}).join("")}).join("");
 const n=D.b60_runs.length,tot=REG.models.length*cases.length;
 $s("stFullSub").textContent=`${fwLabel(FW)} · 已完成 ${n} / ${tot} 個情境（${new Set(D.b60_runs.map(r=>r.model)).size} / ${REG.models.length} 個模型）· 每情境 ${p.repeat} 次平均`;
 $s("stFull").innerHTML=`<thead><tr><th>Model</th><th>NP</th><th>Input</th><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS (Normalized)<small>tok/s / 請求</small></th><th class="l">TPS (Aggregate)<small>tok/s</small></th><th>來源</th></tr></thead><tbody>${body}</tbody>`;
}
function renderRetry(){
 $s("secRetry").hidden=!D.retry;if(!D.retry)return;
 const f=D.failures[0],r=D.retry;
 $s("stRetry").innerHTML=`<b>原始 Full</b>（${esc(f.run_id)}）：Gemma 4 31B NP${f.np} / ${kn(f.input)} — ${esc(f.status)}。${esc(f.reason)}<br><b>重跑</b>（${esc(r.run_id)}）：僅重跑 NP5 的 8K / 16K，exit code ${r.exit_code}，failed models ${r.failed_models}，兩個情境均 PASS。${esc(r.note)}<br>原始失敗紀錄保留，不被重跑覆蓋；原始 R1 的 3.33 TPS 仍不可當作有效成績。`;
}
// ---- 同參數、不同框架比對（同機器、同模型、同 NP / Input）----
const withData=()=>FWS().filter(f=>hasRuns(f.key));
const fwModels=()=>REG.models.filter(m=>withData().length>1&&withData().every(f=>DATA[f.key].b60_runs.some(r=>r.model===m.key&&r.np===NP)));
function renderFw(){
 const ms=fwModels(),el=$s("stFwCmp"),fws=withData();
 if(!ms.length){el.innerHTML=`<p class="v2-fine">NP${NP} 尚無兩個框架皆有的成績。</p>`;$s("stFwTable").innerHTML="";return}
 const w=Math.max(320,(el.clientWidth||860)-100),leg=legend(fws.map(f=>[f.label,FWCOL[f.key]]));
 const groups=D.profile.input_tokens.map(i=>({label:kn(i),sub:tok(i),i}));
 el.innerHTML=ms.map(m=>`<h3 class="st-fwm">${esc(m.name)}<small>NP${NP} · 同機器 B60 · 同 Input／Output／Repeat</small></h3>`+Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3>${leg}${bars(k,groups,fws.map(f=>({label:f.label,color:FWCOL[f.key],get:g=>row(m.key,g.i,NP,f.key)})),w,280)}</article>`).join("")).join("");
 const [a,b]=fws,cell=(r,k)=>r?val(k,r[k]):"—";
 const rows=ms.flatMap(m=>D.profile.input_tokens.map((inp,i)=>{const x=row(m.key,inp,NP,a.key),y=row(m.key,inp,NP,b.key);
  return `<tr>${i===0?`<td rowspan="${D.profile.input_tokens.length}" class="st-model">${esc(m.name)}</td>`:""}<td>${kn(inp)}</td>`+["ttft_s","tpot_ms","decode_tps"].map(k=>`<td>${cell(x,k)}</td><td>${cell(y,k)}</td><td>${x&&y?(y[k]/x[k]).toFixed(2)+"×":"—"}</td>`).join("")+"</tr>"})).join("");
 $s("stFwTable").innerHTML=`<thead><tr><th>Model</th><th>Input</th>${["TTFT s","TPOT ms","TPS (Norm.)"].map(t=>`<th class="l">${a.label} ${t}</th><th class="l">${b.label} ${t}</th><th>${b.label} ÷ ${a.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry");return r.json()})]).then(([reg])=>{
 REG=reg;
 return Promise.all(reg.datasets.filter(x=>x.machine==="b60").map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{DATA[x.framework]=d})));
}).then(()=>{
 setFw("sglang");
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{if(hasRuns(FW))renderMetrics();renderFw()},150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
