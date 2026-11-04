"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const val=(k,v)=>k==="ttft_s"&&v<10?num(v,2):num(v,1);
let REG,DATA={},FW,MODEL,NP;   // DATA[machine][framework] = dataset
const runsOf=(mach,fw)=>{const ds=DATA[mach]&&DATA[mach][fw];return ds?ds.runs:[]};
const get=(mach,fw,m,np,i)=>runsOf(mach,fw).find(r=>r.model===m&&r.np===np&&r.input===i);
const fwLabel=k=>REG.frameworks.find(f=>f.key===k).label;
const modelName=k=>REG.models.find(m=>m.key===k).name;
const cellRuns=(mach)=>runsOf(mach,FW).filter(r=>r.model===MODEL&&r.np===NP);
const inputsNow=()=>{const s=new Set(REG.machines.flatMap(m=>cellRuns(m.key).map(r=>r.input)));return s.size?[...s].sort((a,b)=>a-b):[4096,8192,16384]};
const npsAll=()=>[...new Set(REG.machines.flatMap(m=>REG.frameworks.flatMap(f=>runsOf(m.key,f.key).map(r=>r.np))))].sort((a,b)=>a-b);

const grpNow=()=>inputsNow().map(i=>({label:kn(i),sub:tok(i),i}));
function btn(group,items,cur){return items.map(([k,l,has])=>`<button type="button" role="tab" class="${String(k)===String(cur)?"on":""}${has?" has":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join("")}
const anyData=(fw,m,np)=>REG.machines.some(x=>runsOf(x.key,fw).some(r=>(!m||r.model===m)&&(!np||r.np===np)));
function renderControls(){
 $s("cmpFw").innerHTML=btn("fw",REG.frameworks.map(f=>[f.key,f.label,anyData(f.key)]),FW);
 $s("cmpModel").innerHTML=btn("model",REG.models.map(m=>[m.key,m.name,anyData(FW,m.key)]),MODEL);
 $s("cmpNp").innerHTML=btn("np",npsAll().map(n=>["" +n,"NP"+n,anyData(FW,MODEL,n)]),NP);
 document.querySelectorAll("#secPick button").forEach(b=>b.onclick=()=>{const g=b.dataset.g;if(g==="fw")FW=b.dataset.k;if(g==="model")MODEL=b.dataset.k;if(g==="np")NP=+b.dataset.k;renderAll()});
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100),have=REG.machines.filter(m=>cellRuns(m.key).length),base=have.length?have[0].key:null;
 $s("stNote").textContent=`目前選擇：${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP}`;
 const av=`<p class="v2-fine cmp-av">${availability()}</p>`;
 if(!have.length){$s("stMetrics").innerHTML=av+'<p class="v2-fine st-empty">此框架、模型、NP 三台機器都還沒有資料。</p>';return}
 $s("stMetrics").innerHTML=av+Object.entries(METRICS).map(([k,d])=>BV.block({k,def:d,groups:grpNow(),series:REG.machines.map(m=>({key:m.key,label:m.label,color:m.color})),get:(mk,g)=>get(mk,FW,MODEL,NP,g.i),
  baseline:have.length>1?base:null,width:w,context:`${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP}`,
  message:have.length>1?"":`目前只有 ${have[0].label} 有「${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP}」的資料，另外的機器登錄後會自動並排並計算差異`,
  tableNote:have.length>1?`差異以 ${have[0].label} 為基準；綠色 + 表示較佳、紅色 − 表示較差`:"尚無第二台機器可比較"})).join("");
}
function renderTable(){
 const ins=inputsNow(),c=(r,k)=>`<td>${r?(k==="aggregate_tps"?num(r[k],1):val(k,r[k])):"—"}</td>`;
 const sub=`<th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th>`;
 const rows=ins.map(i=>`<tr><td>${kn(i)}</td>${REG.machines.map(m=>{const r=get(m.key,FW,MODEL,NP,i);return ["ttft_s","tpot_ms","norm_tps","aggregate_tps"].map(k=>c(r,k)).join("")}).join("")}</tr>`).join("");
 $s("stTable").innerHTML=`<thead><tr><th rowspan="2">Input</th>${REG.machines.map(m=>`<th colspan="4" class="l">${esc(m.label)}</th>`).join("")}</tr><tr>${REG.machines.map(()=>sub).join("")}</tr></thead><tbody>${rows}</tbody>`;
 $s("stTableSub").textContent=`${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP} · 3 次重複平均；「—」= 該機器此組合沒有資料。`;
}
function renderCover(){
 const desc=(mach,fw,m)=>{const rs=runsOf(mach,fw).filter(r=>r.model===m);if(!rs.length)return '<span class="st-wait">無資料</span>';
  const nps=[...new Set(rs.map(r=>r.np))].sort((a,b)=>a-b),ins=rs.map(r=>r.input);return `NP${nps.join("/")} · ${kn(Math.min(...ins))}–${kn(Math.max(...ins))} · ${rs.length} 筆`};
 const rows=REG.frameworks.flatMap(f=>REG.models.map((m,i)=>`<tr>${i===0?`<td rowspan="${REG.models.length}" class="st-model">${esc(f.label)}</td>`:""}<td>${esc(m.name)}</td>${REG.machines.map(x=>`<td>${desc(x.key,f.key,m.key)}</td>`).join("")}</tr>`)).join("");
 $s("stCover").innerHTML=`<thead><tr><th>Framework</th><th>Model</th>${REG.machines.map(m=>`<th class="l">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
function renderSetup(){
 const b60=DATA.b60&&(DATA.b60.sglang||DATA.b60.vllm),b70=DATA.b70&&DATA.b70.llamacpp,a=b60.profile,b=b70.profile;
 const r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`,order=REG.machines.map(m=>m.label).join(" → ");
 const fwHas=m=>REG.frameworks.filter(f=>runsOf(m,f.key).length).map(f=>f.label).join(" / ")||"尚無成績";
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">在<b>同一推論框架、同一模型</b>下，並排比較 <b>Intel B60、Intel B70、AISO1</b> 的 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出；不同框架（例如 SGLang 與 llama.cpp）不放在同一張圖，沒有資料的機器留空，不用推估值填入。</p></section>
 <section class="v2-pane"><h2>測試基準及固定參數<span>Baseline &amp; Fixed Parameters</span></h2>
 <p class="v2-goal"><b>比對基準 Baseline</b>：該組合中「有資料的第一台機器」（順序 ${order}）；圖上綠色 + ／紅色 − 為其他機器相對基準的差異（TTFT、TPOT 為減少比例，TPS 為增加比例；差距超過 100% 時以「快／慢 ×倍」表示）。<b>TPS</b> 以每請求 Normalized（Aggregate ÷ NP）比較，Aggregate 另列於完整數值。</p>
 <dl class="v2-params">${r("Output 輸出（固定）",`${tok(a.output_tokens)} tokens`)}${r("Repeat 重複（固定）",`${a.repeat} 次取平均`)}${r("TPS 定義（固定）","Aggregate = NP × Output ÷ E2E（含首字等待）<small>Normalized = Aggregate ÷ NP</small>")}${r("NP 並發",`B60：${a.np.join(" / ")}<small>B70：${b.np.join(" / ")} · AISO1：待核</small>`)}${r("Input 輸入",`B60：${a.input_tokens.map(kn).join(" / ")}<small>B70：${b.input_tokens.map(kn).join(" / ")} · AISO1：待核</small>`)}${r("硬體配備",`B60：${a.vram_total_gb} GB（${a.vram_layout.replace(" x "," × ")}）· TP${a.tp}<small>B70：${b.vram_total_gb} GB（${b.vram_layout.replace(" x "," × ")}）</small>`)}${r("Context 上限",`B60：${tok(a.context_length)}<small>B70：${tok(b.context_per_request)} tokens / request</small>`)}${r("已有成績的框架",`B60：${fwHas("b60")}<small>B70：${fwHas("b70")} · AISO1：${fwHas("aiso1")}</small>`)}</dl>
 <p class="v2-fn">只有 NP 與 Input 完全相同的長條才有可比性；模型格式與量化需相同才能直接比較，各機器頁標示 Repo 與量化，未核實者標為待核。</p></section>`;
}
function renderAll(){renderControls();renderMetrics();renderTable()}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry "+r.status);return r.json()})]).then(([reg])=>{
 REG=reg;
 return Promise.all(reg.datasets.map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{
  const runs=(d[x.runs_key]||[]).map(r=>({...r,norm_tps:r.aggregate_tps/r.np}));
  (DATA[x.machine]=DATA[x.machine]||{})[x.framework]={profile:d.profile,runs,evidence_until:d.evidence_until};
 })));
}).then(()=>{
 // default: a combination that at least two machines share, else the first one with any data
 const combos=REG.frameworks.flatMap(f=>REG.models.flatMap(m=>npsAll().map(n=>[f.key,m.key,n])));
 const cnt=([f,m,n])=>REG.machines.filter(x=>runsOf(x.key,f).some(r=>r.model===m&&r.np===n)).length;
 const best=combos.find(c=>cnt(c)>=2)||combos.find(c=>cnt(c)>=1)||combos[0];
 [FW,MODEL,NP]=best;
 renderSetup();renderCover();renderAll();
 const last=Object.values(DATA).flatMap(o=>Object.values(o)).map(d=>d.evidence_until).sort().pop();
 $s("stFoot").textContent=`資料更新至 ${last}；新增資料集只需在 data/benchmark-registry.json 登錄，本頁自動帶入。`;
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
