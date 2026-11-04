"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 decode_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
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
 const par=D.model_parity.length?D.model_parity.map(m=>`${esc(m.name)}<small>${m.repo!=="UNVERIFIED"?esc(m.repo)+" · "+esc(m.format):"來源／量化待核"}</small>`).join(""):"尚無已核實的模型來源";
 const knob=FW==="vllm"?r("Max Num Seqs / Prefill / Memory / Prefix Cache",`${p.max_num_seqs} / ${tok(p.prefill_tokens)} / ${p.memory_fraction} / ${p.prefix_cache}`):FW==="sglang"?r("Chunked Prefill / Max Running / Memory / Radix Cache",`${tok(p.chunked_prefill)} / ${p.max_running} / ${p.memory_fraction} / ${p.radix_cache}`):"";
 const params=`<dl class="v2-params">${r("Machine 機器",`Intel B60 · ${p.vram_total_gb} GB<small>${p.vram_layout.replace(" x "," × ")}（2 張）· 4 GPU devices · TP ${p.tp}</small>`)}${r("Framework 框架",`${esc(p.framework)}<small>${p.runtime==="UNVERIFIED"?"Runtime 映像待核":esc(p.runtime)}</small>`)}${r("Model 模型",par)}${r("Context 上限",`${tok(p.context_length)} tokens`)}${r("Input 輸入",`${p.input_tokens.map(tok).join(" / ")} tokens<small class="v2-approx">約等於 4K / 8K / 16K</small>`)}${r("Output 輸出",`${tok(p.output_tokens)} tokens`)}${r("NP 並發",p.np.join(" / "))}${r("Repeat 重複",`${p.repeat} 次取平均`)}${knob}</dl>`;
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">量測 <b>Intel B60（96 GB，48 GB × 2）</b> 在 <b>SGLang、vLLM、llama.cpp</b> 三種推論框架下，四個模型的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出（Normalized 與 Aggregate）；B60 與 B70、AISO1、不同框架分開呈現，不混合硬體、框架或量化格式。</p></section>
 <section class="v2-pane"><h2>測試基準及固定參數<span>Baseline &amp; Fixed Parameters</span></h2>
 <p class="v2-goal">每個情境各跑 <b>${p.repeat} 次取平均</b>；以下參數在所有模型、所有框架下<b>固定不變</b>。<b>TPS Normalized</b> = Aggregate ÷ NP（每請求），<b>TPS Aggregate</b> = 總輸出 token ÷ 同批 E2E 時間（含首字等待）。<br><b>比對基準 Baseline</b>：「同參數框架比對」以 <b>SGLang</b> 為基準，圖上綠色 + ／紅色 − 為 vLLM 相對 SGLang 的差異（TTFT、TPOT 為減少比例，TPS 為增加比例；差距超過 100% 時以「快／慢 ×倍」表示）。</p>
 ${params}<p class="v2-fn">下方參數為目前選取的框架（${fw}）；本頁只呈現 B60 自己的數據，與 B70、AISO1 同框架、同模型的並排比對請見「B60 vs B70 vs AISO1」。</p></section>`;
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
 renderFull();renderFw();
 $s("stDataTitle").textContent=`B60 ${fwLabel(FW)} 已驗證實測 ${D.b60_runs.length} 筆`+(D.b60_runs.some(r=>r.retry)?`（含 ${D.b60_runs.filter(r=>r.retry).length} 筆重跑）`:"");
 $s("stDl").href=REG.datasets.find(x=>x.machine==="b60"&&x.framework===k).file;
}
const grp=()=>D.profile.input_tokens.map(i=>({label:kn(i),sub:tok(i),i}));
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100),ms=present(NP);
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>{
  const parts=ms.map(m=>{const a=row(m.key,4096,NP),b=row(m.key,16384,NP);return a&&b?`${m.name} ${val(k,a[k])} → ${val(k,b[k])}`:null}).filter(Boolean);
  return BV.block({k,def:d,groups:grp(),series:ms.map(m=>({key:m.key,label:m.name,color:m.color})),get:(mk,g)=>row(mk,g.i,NP),baseline:null,width:w,
   context:`NP${NP}`,message:`NP${NP}：Input 由 4K 增至 16K（${d.unit}）— ${parts.join("；")||"無完整資料"}`,tableNote:"不同模型之間只作並排參考，不計算差異"})}).join("");
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
// ---- 同參數、不同框架比對（同機器、同模型、同 NP / Input；以第一個框架為基準）----
const withData=()=>FWS().filter(f=>hasRuns(f.key));
const fwModels=()=>REG.models.filter(m=>withData().length>1&&withData().every(f=>DATA[f.key].b60_runs.some(r=>r.model===m.key&&r.np===NP)));
function renderFw(){
 const ms=fwModels(),el=$s("stFwCmp"),fws=withData();
 if(!ms.length){el.innerHTML=`<p class="v2-fine">NP${NP} 尚無兩個框架皆有的成績。</p>`;return}
 const w=Math.max(320,(el.clientWidth||860)-100),base=fws[0].key;
 el.innerHTML=ms.map(m=>`<div class="bv-model"><h3 class="bv-mh">${esc(m.name)}<span class="zh-i">NP${NP} · 同機器 B60 · 同 Input／Output／Repeat · 以 ${esc(fws[0].label)} 為基準</span></h3>`+Object.entries(METRICS).map(([k,d])=>BV.block({k,def:d,groups:grp(),series:fws.map(f=>({key:f.key,label:f.label,color:FWCOL[f.key]})),get:(fk,g)=>row(m.key,g.i,NP,fk),baseline:base,width:w,context:`${m.name} · NP${NP}`,tableNote:`四項指標之一 · 差異 = ${fws[1].label} 相對 ${fws[0].label}；綠色 + 表示較佳、紅色 − 表示較差`})).join("")+"</div>").join("");
}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry");return r.json()})]).then(([reg])=>{
 REG=reg;
 return Promise.all(reg.datasets.filter(x=>x.machine==="b60").map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{DATA[x.framework]=d})));
}).then(()=>{
 setFw("sglang");
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{if(hasRuns(FW))renderMetrics();renderFw()},150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
