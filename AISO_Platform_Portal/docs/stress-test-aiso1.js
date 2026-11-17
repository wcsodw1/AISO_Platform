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
let REG,DATA={},FW,MODEL,NP,CMP=false,SELF=new Set(),SELM=new Set();     // CMP: multi-select mode, several frameworks / models are drawn together
const runsOf=fw=>(DATA[fw]&&DATA[fw].runs)||[];
const cellRuns=()=>runsOf(FW).filter(r=>r.model===MODEL&&r.np===NP).sort((a,b)=>a.input-b.input);
const anyData=(fw,m,np)=>runsOf(fw).some(r=>(!m||r.model===m)&&(!np||r.np===np));
const fwLabel=k=>(REG.frameworks.find(f=>f.key===k)||{}).label||k;
const mName=k=>(REG.models.find(m=>m.key===k)||{}).name||k;
const OVERLOAD=[5];   // David 2026-11-13: NP5 does not run on AISO1. Overload 超負載 only where a run was really attempted and gave no numbers (status DEFERRED in the handoff); other NP5 cases were never run = 未測
const isOver=(fw,np)=>fw==="llamacpp"&&OVERLOAD.includes(np)&&!anyData(fw,MODEL,np);
const nps=()=>[...new Set(runsOf(FW).map(r=>r.np))].sort((a,b)=>a-b);
function btn(group,items,cur){const is=k=>cur instanceof Set?cur.has(String(k)):String(k)===String(cur);return items.map(([k,l,has])=>`<button type="button" role="tab" class="${is(k)?"on":""}${has?" has":""}" aria-selected="${is(k)}" data-g="${group}" data-k="${k}"${has?"":" disabled aria-disabled=\"true\" title=\"沒有資料\""}>${esc(l)}</button>`).join("")}
function fix(){
 if(!anyData(FW))FW=(REG.frameworks.find(f=>anyData(f.key))||REG.frameworks[0]).key;
 if(!anyData(FW,MODEL))MODEL=(REG.models.find(m=>anyData(FW,m.key))||REG.models[0]).key;
 if(!anyData(FW,MODEL,NP)&&!isOver(FW,NP))NP=nps().find(n=>anyData(FW,MODEL,n))||NP;
}
function selCombos(){return [...SELF].flatMap(f=>[...SELM].map(m=>({f,m})))}
function renderPick(){
 fix();
 if(CMP){SELF.add(FW);SELM.add(MODEL)}
 $s("cmpMode").innerHTML=btn("mode",[["off","Single 單選",true],["on","Multi 多選比對",true]],CMP?"on":"off");
 $s("cmpFw").innerHTML=btn("fw",REG.frameworks.map(f=>[f.key,f.label,anyData(f.key)]),CMP?SELF:FW);
 $s("cmpModel").innerHTML=btn("model",REG.models.map(m=>[m.key,m.name,CMP?REG.frameworks.some(f=>anyData(f.key,m.key)):anyData(FW,m.key)]),CMP?SELM:MODEL);
 const npHas=n=>CMP?selCombos().some(c=>anyData(c.f,c.m,n)):anyData(FW,MODEL,n)||isOver(FW,n);
 $s("cmpNp").innerHTML=btn("np",[...new Set(REG.frameworks.flatMap(f=>runsOf(f.key).map(r=>r.np)))].sort((a,b)=>a-b).map(n=>[""+n,!CMP&&isOver(FW,n)?"NP"+n+" · 未測":"NP"+n,npHas(n)]),NP);
 document.querySelectorAll("#secPick .cmp-tabs button").forEach(b=>b.onclick=()=>{if(b.disabled)return;const g=b.dataset.g,k=b.dataset.k;
  if(g==="mode"){CMP=k==="on";SELF=new Set([FW]);SELM=new Set([MODEL])}
  else if(g==="fw"){if(CMP){if(SELF.has(k)&&SELF.size>1){SELF.delete(k);if(FW===k)FW=[...SELF][0]}else{SELF.add(k);FW=k}}else FW=k}
  else if(g==="model"){if(CMP){if(SELM.has(k)&&SELM.size>1){SELM.delete(k);if(MODEL===k)MODEL=[...SELM][0]}else{SELM.add(k);MODEL=k}}else MODEL=k}
  else if(g==="np")NP=+k;
  renderAll()});
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
// ---- side by side: same framework + same NP -> every model; same model + same NP -> every framework ----
const MCOL=["#8f9bff","#4fd1b0","#ff8a4c","#e6c35c"],FWCOL={sglang:"#4fd1b0",vllm:"#8f9bff",llamacpp:"#ff8a4c"};
const quantOf=f=>{const q=/Q(\d)/.exec(f||"");return q?"Q"+q[1]:""};
const gbOf=b=>Number.isFinite(b)?(b/1e9).toFixed(1)+" GB":"";
const cmpRows=(fw,mk,np)=>runsOf(fw).filter(r=>r.model===mk&&r.np===np&&Number.isFinite(r.ttft_s));
const specOf=(fw,mk)=>{const c=((DATA[fw]||{}).config||{})[mk]||{},r=runsOf(fw).find(x=>x.model===mk)||{};return [quantOf(c.format||r.format),gbOf(c.bytes)].filter(Boolean).join(" · ")};
const verTag=fw=>{const l=((DATA[fw]||{}).caveat||{}).level;return l==="historical_unverified"?"歷史・未核實":l==="retest_unverified"?"重測・待核實":""};
function cmpBlock(head,series,get,baseline,groups,w,ctx,msg,note){
 return `<div class="bv-model">${head}`+BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups,series,get,baseline,width:w,context:ctx,message:msg,tableNote:note})))+"</div>";
}
const SCOL=["#8f9bff","#4fd1b0","#ff8a4c","#e6c35c","#e07fd0","#7fd0e0","#b0e07f","#e0907f","#a99bff","#5fb88c","#ffb27f","#ffd87f"];
function renderSelected(w){
 const all=selCombos(),cs=all.filter(c=>cmpRows(c.f,c.m,NP).length),series=cs.map((c,i)=>({key:c.f+"|"+c.m,label:`${fwLabel(c.f)} · ${mName(c.m)}${specOf(c.f,c.m)?" · "+specOf(c.f,c.m):""}${verTag(c.f)?"（"+verTag(c.f)+"）":""}`,color:SCOL[i%SCOL.length]}));
 const total=SELF.size*SELM.size,head=`<h3 class="bv-mh">已選 ${SELF.size} 個框架 × ${SELM.size} 個模型 · NP${NP}<span class="zh-i">${cs.length} / ${total} 組有資料；沒有資料的組合不估算${cs.length<total?"（"+esc(all.filter(c=>!cs.includes(c)).map(c=>fwLabel(c.f)+" "+mName(c.m)).join("、"))+"）":""}</span></h3>`;
 $s("stCmpFw").innerHTML="";
 if(cs.length<2){$s("stCmpModels").innerHTML=`<div class="bv-model">${head}<p class="v2-fine st-empty">NP${NP} 只有 ${cs.length} 組有資料，無法並排；換一個並發，或多選幾個框架／模型。</p></div>`;return}
 const rows=cs.flatMap(c=>cmpRows(c.f,c.m,NP)),groups=[...new Set(rows.map(r=>r.input))].sort((a,b)=>a-b).map(i=>({label:kn(i),sub:tok(i),i}));
 $s("stCmpModels").innerHTML=cmpBlock(head,series,(sk,g)=>{const [f,m]=sk.split("|");return cmpRows(f,m,NP).find(r=>r.input===g.i)||null},series[0].key,groups,w,`已選比對 · NP${NP}`,"",`差異 = 其他組合相對 ${esc(series[0].label)}；綠色 + 表示較佳、紅色 − 表示較差；不同框架、不同模型的差異只是現象，不代表同條件優劣；標「未核實」的資料集僅供參考`);
}
function renderCompare(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 if(CMP){renderSelected(w);return}
 const ms=REG.models.filter(m=>cmpRows(FW,m.key,NP).length),mSeries=ms.map((m,i)=>({key:m.key,label:`${m.name}${specOf(FW,m.key)?" · "+specOf(FW,m.key):""}`,color:MCOL[i%MCOL.length]}));
 const groupsOf=rows=>[...new Set(rows.map(r=>r.input))].sort((a,b)=>a-b).map(i=>({label:kn(i),sub:tok(i),i}));
 const hM=`<h3 class="bv-mh">${esc(fwLabel(FW))} · NP${NP}<span class="zh-i">同框架、同並發：模型並排${verTag(FW)?" · 資料集："+verTag(FW):""}</span></h3>`;
 $s("stCmpModels").innerHTML=ms.length>1
  ?cmpBlock(hM,mSeries,(mk,g)=>cmpRows(FW,mk,NP).find(r=>r.input===g.i)||null,null,groupsOf(ms.flatMap(m=>cmpRows(FW,m.key,NP))),w,`${fwLabel(FW)} · NP${NP}`,"各模型數值並排；模型大小與量化不同，比的是同機器、同框架下各模型的表現","各模型數值並排，不計算差異")
  :`<div class="bv-model">${hM}<p class="v2-fine st-empty">${esc(fwLabel(FW))} 在 NP${NP} 只有 ${ms.length?esc(ms.map(m=>m.name).join("、")):"沒有任何模型"} 有資料，無法並排模型；換一個框架或並發試試。</p></div>`;
 const fws=REG.frameworks.filter(f=>DATA[f.key]&&cmpRows(f.key,MODEL,NP).length),lacking=REG.frameworks.filter(f=>!fws.includes(f)).map(f=>f.label);
 const base=(fws.find(f=>f.key==="llamacpp")||fws[0]||{}).key,fSeries=fws.map(f=>({key:f.key,label:`${f.label}${verTag(f.key)?"（"+verTag(f.key)+"）":""}`,color:FWCOL[f.key]||"#aaa"}));
 const hF=`<h3 class="bv-mh">${esc(mName(MODEL))} · NP${NP}<span class="zh-i">同模型、同並發：框架並排${lacking.length?" · "+esc(lacking.join("、"))+" 尚無成績":""}</span></h3>`;
 $s("stCmpFw").innerHTML=fws.length>1
  ?cmpBlock(hF,fSeries,(fk,g)=>cmpRows(fk,MODEL,NP).find(r=>r.input===g.i)||null,base,groupsOf(fws.flatMap(f=>cmpRows(f.key,MODEL,NP))),w,`${mName(MODEL)} · NP${NP}`,"",`差異 = 其他框架相對 ${esc(fwLabel(base))}；綠色 + 表示較佳、紅色 − 表示較差；標「未核實」的資料集僅供參考`)
  :`<div class="bv-model">${hF}<p class="v2-fine st-empty">${esc(mName(MODEL))} 在 NP${NP} 只有 ${fws.length?esc(fwLabel(fws[0].key)):"（無）"} 有 AISO1 資料，無法並排框架。目前兩個框架都有資料的組合只有 Gemma 4 31B · NP2（vLLM 與 llama.cpp）。</p></div>`;
}
function renderAll(){renderPick();renderSetup();renderMetrics();renderCompare();renderTable()}
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
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{renderMetrics();renderCompare()},150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
