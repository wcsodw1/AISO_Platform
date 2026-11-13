"use strict";
/* AISO1 single-machine page. Registry-driven: every AISO1 dataset in data/benchmark-registry.json (framework x model x NP). Nothing is hard-coded to one run. */
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const COLOR="#8f9bff",MACHINE="aiso1";
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token（含首字等待）",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=1)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let REG,DATA={},FW,MODEL,NP;
const runsOf=fw=>(DATA[fw]&&DATA[fw].runs)||[];
const cellRuns=()=>runsOf(FW).filter(r=>r.model===MODEL&&r.np===NP).sort((a,b)=>a.input-b.input);
const anyData=(fw,m,np)=>runsOf(fw).some(r=>(!m||r.model===m)&&(!np||r.np===np));
const fwLabel=k=>(REG.frameworks.find(f=>f.key===k)||{}).label||k;
const mName=k=>(REG.models.find(m=>m.key===k)||{}).name||k;
const OVERLOAD=[5];   // David 2026-11-13: NP5 does not run on AISO1. Overload 超負載 only where a run was really attempted and gave no numbers (status DEFERRED in the handoff); other NP5 cases were never run = 未測
const isOver=(fw,np)=>fw==="llamacpp"&&OVERLOAD.includes(np)&&!anyData(fw,MODEL,np);
const nps=()=>[...new Set(runsOf(FW).map(r=>r.np))].sort((a,b)=>a-b);
function btn(group,items,cur){return items.map(([k,l,has])=>`<button type="button" role="tab" class="${String(k)===String(cur)?"on":""}${has?" has":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}"${has?"":" disabled aria-disabled=\"true\" title=\"沒有資料\""}>${esc(l)}</button>`).join("")}
function fix(){
 if(!anyData(FW))FW=(REG.frameworks.find(f=>anyData(f.key))||REG.frameworks[0]).key;
 if(!anyData(FW,MODEL))MODEL=(REG.models.find(m=>anyData(FW,m.key))||REG.models[0]).key;
 if(!anyData(FW,MODEL,NP)&&!isOver(FW,NP))NP=nps().find(n=>anyData(FW,MODEL,n))||NP;
}
function renderPick(){
 fix();
 $s("cmpFw").innerHTML=btn("fw",REG.frameworks.map(f=>[f.key,f.label,anyData(f.key)]),FW);
 $s("cmpModel").innerHTML=btn("model",REG.models.map(m=>[m.key,m.name,anyData(FW,m.key)]),MODEL);
 $s("cmpNp").innerHTML=btn("np",[...new Set(REG.frameworks.flatMap(f=>runsOf(f.key).map(r=>r.np)))].sort((a,b)=>a-b).map(n=>[""+n,isOver(FW,n)?"NP"+n+" · 未測":"NP"+n,anyData(FW,MODEL,n)||isOver(FW,n)]),NP);
 document.querySelectorAll("#secPick .cmp-tabs button").forEach(b=>b.onclick=()=>{if(b.disabled)return;const g=b.dataset.g;if(g==="fw")FW=b.dataset.k;if(g==="model")MODEL=b.dataset.k;if(g==="np")NP=+b.dataset.k;renderAll()});
}
function renderSetup(){
 const d=DATA[FW],p=d.profile,r=(k,v)=>v==null||v===""||v==="UNVERIFIED"?"":`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`,runs=cellRuns(),c=(d.config||{})[MODEL]||{};
 const lc=FW==="llamacpp",hist=!!(d.caveat&&d.caveat.level==="historical_unverified");
 $s("stSetup").innerHTML="";
 const ins=[...new Set(runs.map(x=>x.input))].map(kn).join(" / ");
 const gpu=p.gpu_evidence;
 $s("stParams").innerHTML=[r("Machine 機器","AISO1 · Radeon 8060S 統一記憶體"),r("Framework",fwLabel(FW)),r("Model 模型",`${mName(MODEL)}${runs[0]&&runs[0].format?" · "+runs[0].format:""}`),r("Input 輸入",ins),r("Output 輸出",p.output_tokens?tok(p.output_tokens)+" tokens":"1,024 tokens"),r("NP 並發",NP),r("Repeat 重複","3 次取平均"),
  r(lc?"Batch size":"Batch / token budget",p.batch||c.batch),lc&&r("Ubatch",p.ubatch),r("Context / slot",p.per_slot_context||c.max_context),r("Slots",p.slots||c.max_seqs),lc&&r("總 Context",p.total_kv_by_np?p.total_kv_by_np[NP]:(p.per_slot_context?p.per_slot_context*NP:"")),
  r("KV cache",p.kv_cache_type),r("Prefix cache",p.prefix_cache),r("Flash Attention",p.flash_attention),r("Split",p.split||c.tp),r("Unified KV",p.unified_kv),r("Continuous batching",p.cont_batching),r("Context shift",p.context_shift),r("GPU layers",p.gpu_layers),r("Runtime",p.runtime),r("GPU 型號佐證",gpu)].filter(Boolean).join("")||'<div><dt>參數</dt><dd>未核實</dd></div>';
 const cv=d.caveat;
 $s("stNote").textContent=cv?cv.text:"";
 $s("secVerdict").hidden=!cv;
 const pend=(d.not_run||[]);
 $s("stPend").innerHTML=pend.length&&lc?`<p class="v2-fn">尚未完成（保留狀態，不填數值）：${esc(pend.map(x=>`${x.model} ${x.conditions} 組（${x.reason}）`).join("、"))}。NP5：已測但跑不動、沒有數值的標「Overload 超負載」；沒跑過的標「未測」。</p>`:"";
}
function renderMetrics(){
 const runs=cellRuns();
 if(!runs.length&&isOver(FW,NP)){$s("stMetrics").innerHTML='<p class="v2-fine st-empty"><b class="st-wait">未測 Not tested</b>　AISO1 在 NP'+NP+' 沒有執行過，沒有數值（不估算）。</p>';return}
 if(!runs.length){$s("stMetrics").innerHTML='<p class="v2-fine st-empty">此框架、模型、NP 沒有 AISO1 資料。</p>';return}
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100),groups=[...new Set(runs.map(r=>r.input))].map(i=>({label:kn(i),sub:tok(i),i})),cv=DATA[FW].caveat;
 $s("stMetrics").innerHTML=BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups,series:[{key:"aiso1",label:"AISO1 AMD",color:COLOR}],get:(mk,g)=>{const x=runs.find(r=>r.input===g.i);return x&&Number.isFinite(x[k])?x:null},baseline:null,width:w,context:`${fwLabel(FW)} · ${mName(MODEL)} · NP${NP}`,message:cv&&cv.level==="historical_unverified"?"歷史診斷・未核實；單機數值，不與其他機器計算差異":"單機數值；跨機比對請見 Stress Test 比對頁",tableNote:"單機數值"})));
}
function renderTable(){
 const runs=cellRuns(),c=(v,d=1)=>`<td>${num(v,d)}</td>`,over=r=>r.ttft_over_180s?' class="st-over"':"";
 const rows=runs.map(r=>`<tr><td>${kn(r.input)}</td><td${over(r)}>${num(r.ttft_s,r.ttft_s<10?2:1)}</td>${c(r.tpot_ms)}${c(r.norm_tps)}${c(r.aggregate_tps)}${c(r.decode_only_tps!=null?r.decode_only_tps:r.decode_tps)}<td>${r.successful?r.successful+" requests":(r.status||"PASS")}</td></tr>`).join("");
 const ovIn=isOver(FW,NP)?[4096,8192,16384]:[],ovRows=ovIn.map(i=>`<tr class="st-ovrow"><td>${kn(i)}</td><td colspan="5"><span class="st-wait">未測 Not tested</span></td><td>沒有執行過，無數值</td></tr>`).join("");
 const part=(DATA[FW].partial||[]).filter(r=>(!r.model||r.model===MODEL)&&(!r.np||r.np===NP)).map(r=>{
  const none=!Number.isFinite(r.aggregate_tps)&&!Number.isFinite(r.ttft_s);
  if(none&&r.status==="DEFERRED")return `<tr class="st-ovrow"><td>${kn(r.input)}</td><td colspan="5"><b class="st-over">Overload 超負載</b></td><td>已測（有效 ${r.valid_repeats||0}/3 次），跑不動、無數值</td></tr>`;
  return `<tr class="st-part"><td>${kn(r.input)}</td><td>${num(r.ttft_s)}</td>${c(r.tpot_ms)}<td>—</td>${c(r.aggregate_tps)}<td>—</td><td>部分結果，不計入${r.note?"（"+esc(r.note)+"）":""}</td></tr>`}).join("");
 $s("stTableSub").textContent=`${fwLabel(FW)} · ${mName(MODEL)} · NP${NP} · 每個指標為 3 次重複平均；「—」= 該欄沒有資料。TTFT ≥ 180 秒以紅字標示。`;
 $s("stTable").innerHTML=`<thead><tr><th>Input</th><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th><th class="l">Decode<small>tok/s</small></th><th>狀態</th></tr></thead><tbody>${rows}${part}${ovRows}</tbody>`;
}
function renderCover(){
 const rows=REG.frameworks.flatMap(f=>REG.models.map(m=>{const rs=runsOf(f.key).filter(r=>r.model===m.key);const n=[...new Set(rs.map(r=>r.np))].sort((a,b)=>a-b);return `<tr><td>${esc(f.label)}</td><td>${esc(m.name)}</td><td>${rs.length?`NP${n.join(" / NP")} · ${rs.length} 組`:'<span class="st-wait">無資料</span>'}</td></tr>`})).join("");
 $s("stCover").innerHTML=`<thead><tr><th>Framework</th><th>Model</th><th class="l">AISO1 已有資料</th></tr></thead><tbody>${rows}</tbody>`;
}
function renderAll(){renderPick();renderSetup();renderMetrics();renderTable()}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>r.json())]).then(([reg])=>{
 REG=reg;
 return Promise.all(reg.datasets.filter(x=>x.machine===MACHINE).map(x=>fetch("data/"+x.file.replace(/^data\//,""),{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file);return r.json()}).then(d=>{
  DATA[x.framework]={profile:d.profile||{},runs:(d[x.runs_key]||[]).map(r=>({...r,norm_tps:r.aggregate_tps/r.np})),caveat:d.comparability||null,config:d.config_by_model||{},partial:d.partial_runs||[],not_run:d.not_run||[],evidence_until:d.evidence_until,file:x.file}})));
}).then(()=>{
 const combos=[...REG.frameworks].sort((a,b)=>(b.key==="llamacpp")-(a.key==="llamacpp")).flatMap(f=>REG.models.flatMap(m=>[...new Set(runsOf(f.key).filter(r=>r.model===m.key).map(r=>r.np))].sort((a,b)=>a-b).map(n=>[f.key,m.key,n])));
 [FW,MODEL,NP]=combos[0]||[REG.frameworks[0].key,REG.models[0].key,1];
 renderAll();renderCover();
 const last=Object.values(DATA).map(d=>d.evidence_until).sort().pop();
 $s("stFoot").textContent=`資料更新至 ${last}；由 data/benchmark-registry.json 登錄的 AISO1 資料集自動帶入。`;
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
