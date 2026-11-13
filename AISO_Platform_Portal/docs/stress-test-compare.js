"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token（含首字等待）",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const val=(k,v)=>k==="ttft_s"&&v<10?num(v,2):num(v,1);
const PAIRS={"b60-b70":["b60","b70"],"aiso1-b60":["b60","aiso1"],"aiso1-b70":["b70","aiso1"]};
const PAIR_TITLE={"b60-b70":"B60 vs B70","aiso1-b60":"AISO1 vs B60","aiso1-b70":"AISO1 vs B70"};
const PAIR=(()=>{const q=new URLSearchParams(location.search).get("pair"),b=document.body.dataset.pair;return PAIRS[q||b]?(q||b):null})();
let REG,DATA={},FW,MODEL,NP,OTHER=false;   // main comparison = llama.cpp; OTHER = the remaining frameworks (different parameters)   // DATA[machine][framework] = dataset
const MAXI=16384;   // compare page: 4K / 8K / 16K only (B70-only 32K / 64K stay on the B70 page)
const runsOf=(mach,fw)=>{const ds=DATA[mach]&&DATA[mach][fw];return ds?ds.runs.filter(r=>r.input<=MAXI):[]};
const get=(mach,fw,m,np,i)=>runsOf(mach,fw).find(r=>r.model===m&&r.np===np&&r.input===i);
const fwLabel=k=>REG.frameworks.find(f=>f.key===k).label;
const modelName=k=>REG.models.find(m=>m.key===k).name;
/* quantisation class (Q4 / Q8) taken from each dataset's recorded format; exact format kept in the tooltip */
const quantOf=(fw,mk)=>{for(const m of REG.machines){const d=DATA[m.key]&&DATA[m.key][fw];if(!d)continue;const f=(d.config[mk]&&d.config[mk].format)||(d.runs.find(r=>r.model===mk&&r.format)||{}).format;if(f){const t=/FP8|Q8|INT8/i.test(f)?"Q8":/Q4|W4|INT4|FP4/i.test(f)?"Q4":null;return{tag:t,exact:f}}}return null};
const mlabel=(fw,mk)=>{const q=quantOf(fw,mk);return modelName(mk)+(q&&q.tag?` · ${q.tag}`:"")};
const mtitle=(fw,mk)=>{const q=quantOf(fw,mk);return q?`${modelName(mk)} · ${q.exact}`:modelName(mk)};
const cellRuns=(mach)=>runsOf(mach,FW).filter(r=>r.model===MODEL&&r.np===NP);
const inputsNow=()=>{const s=new Set(REG.machines.flatMap(m=>cellRuns(m.key).map(r=>r.input)));return s.size?[...s].sort((a,b)=>a-b):[4096,8192,16384]};
const npsAll=()=>[...new Set(REG.machines.flatMap(m=>REG.frameworks.flatMap(f=>runsOf(m.key,f.key).map(r=>r.np))))].sort((a,b)=>a-b);

const grpNow=()=>inputsNow().map(i=>({label:kn(i),sub:tok(i),i}));
const cav=(mach,fw)=>{const ds=DATA[mach]&&DATA[mach][fw];return ds&&ds.caveat?ds.caveat:null};
const availability=()=>REG.machines.map(m=>{const n=cellRuns(m.key).length,c=n?cav(m.key,FW):null;return n?`<span><i style="background:${m.color}"></i>${esc(m.label)}（${n} 筆）${cellRuns(m.key).every(r=>!Number.isFinite(r.ttft_s)&&!Number.isFinite(r.tpot_ms))?'<b class="cmp-badge bad" title="這台機器此組合只記錄了 Aggregate TPS，沒有 TTFT / TPOT 原始資料，所以 TTFT / TPOT 圖沒有它的線">只有 TPS・無 TTFT/TPOT</b>':""}</span>`:`<span class="st-wait"><i style="background:${m.color};opacity:.35"></i>${esc(m.label)}：此組合無資料</span>`}).join("");
function btn(group,items,cur){return items.map(([k,l,has])=>`<button type="button" role="tab" class="${String(k)===String(cur)?"on":""}${has?" has":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}"${has?"":" disabled aria-disabled=\"true\" title=\"沒有資料\""}>${esc(l)}</button>`).join("")}
const anyData=(fw,m,np)=>REG.machines.some(x=>runsOf(x.key,fw).some(r=>(!m||r.model===m)&&(!np||r.np===np)));
const FULL_IN=[4096,8192,16384];
let TWO=false;   // (unused toggle kept false)   // false: only combinations ALL machines have; true: combinations at least TWO machines have (right-hand "Two machines" option)
const needM=()=>TWO?2:REG.machines.length;
const fullData=(fw,m,np)=>REG.models.some(mod=>(!m||mod.key===m)&&npsAll().some(n=>(!np||n===np)&&REG.machines.filter(x=>FULL_IN.every(i=>get(x.key,fw,mod.key,n,i))).length>=needM()));
function fixPick(){   // keep FW / model / NP on a combination that has data
 if(!fullData(FW))FW=(REG.frameworks.find(f=>fullData(f.key))||REG.frameworks[0]).key;
 OTHER=FW!=="llamacpp";
 if(!fullData(FW,MODEL))MODEL=(REG.models.find(m=>fullData(FW,m.key))||REG.models[0]).key;
 if(!fullData(FW,MODEL,NP))NP=npsAll().find(n=>fullData(FW,MODEL,n))||NP;
}
let MODE2=false;   // false = three-machine comparison (default); true = pick a two-machine pair
function renderControls(){
 fixPick();
 const md=$s("cmpMode");
 if(md){const three=REG.machines.length>2;
  md.innerHTML=three?`<button type="button" role="tab" class="has${MODE2?"":" on"}" aria-selected="${!MODE2}" data-g="mode" data-k="3"><span>Three machines<small class="zhs">三機比對</small></span><small>B60 · B70 · AISO1</small></button><button type="button" role="tab" class="has${MODE2?" on":""}" aria-selected="${MODE2}" data-g="mode" data-k="2"><span>Two machines<small class="zhs">兩機比對</small></span><small>AISO1 v.s B70 · AISO1 v.s B60 · B60 v.s B70</small></button>`:"";
  $s("cmpPairs").innerHTML=three&&MODE2?[["aiso1-b70","AISO1 v.s B70"],["aiso1-b60","AISO1 v.s B60"],["b60-b70","B60 v.s B70"]].map(([k,t])=>`<a class="cmp-two has" href="stress-test-pair.html?pair=${k}"><span>${t}</span><small>Open<span class="zhs">開啟</span> →</small></a>`).join(""):"";
  document.querySelectorAll("#secPick .cmp-pick:not(.cmp-modepick)").forEach(e=>e.hidden=three&&MODE2);
  md.querySelectorAll("button").forEach(b=>b.onclick=()=>{MODE2=b.dataset.k==="2";renderControls()})}
 const sh=m=>m.label.replace(/^Intel /,"").replace(/ AMD$/,""),sub=f=>{const have=REG.machines.filter(m=>runsOf(m.key,f.key).length),miss=REG.machines.filter(m=>!runsOf(m.key,f.key).length);return have.map(sh).join(" · ")+(miss.length?` · 缺 ${miss.map(sh).join("、")}`:"")};
 $s("cmpFw").innerHTML=REG.frameworks.filter(f=>fullData(f.key)).sort((x,y)=>(y.key==="llamacpp")-(x.key==="llamacpp")).map(f=>`<button type="button" role="tab" class="has${f.key===FW?" on":""}" aria-selected="${f.key===FW}" data-g="fw" data-k="${f.key}"><span>${esc(f.label)}</span><small>${esc(sub(f))}</small></button>`).join("");
 $s("cmpModel").innerHTML=btn("model",REG.models.filter(m=>fullData(FW,m.key)).map(m=>[m.key,mlabel(FW,m.key),true]),MODEL);
 $s("cmpNp").innerHTML=btn("np",npsAll().filter(n=>fullData(FW,MODEL,n)).map(n=>["" +n,"NP"+n,true]),NP);
 document.querySelectorAll("#secPick .cmp-tabs:not(#cmpMode) button").forEach(b=>b.onclick=()=>{if(b.disabled)return;const g=b.dataset.g;if(g==="fw")FW=b.dataset.k;if(g==="model")MODEL=b.dataset.k;if(g==="np")NP=+b.dataset.k;renderAll()});
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100),have=REG.machines.filter(m=>cellRuns(m.key).length),base=(have.find(m=>m.key==="aiso1")||have[0]||{}).key||null,baseLabel=(REG.machines.find(m=>m.key===base)||{}).label;   // AISO1 is always the reference when it has data
 const nom=have.filter(m=>cellRuns(m.key).every(r=>!Number.isFinite(r.ttft_s)||!Number.isFinite(r.tpot_ms))).map(m=>m.label);
 const av=`<p class="v2-fine cmp-av">${availability()}</p>`+(nom.length?`<p class="v2-fine cmp-pending">${esc(nom.join("、"))}：TTFT／TPOT 待原始 summary.csv，目前只有 TPS（Aggregate／Normalized）；圖中以「—」表示。</p>`:"");
 if(!have.length){$s("stMetrics").innerHTML=av+'<p class="v2-fine st-empty">此框架、模型、NP 三台機器都還沒有資料。</p>';return}
 $s("stMetrics").innerHTML=av+BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups:grpNow(),series:REG.machines.map(m=>({key:m.key,label:m.label,color:m.color})),get:(mk,g)=>{const r=get(mk,FW,MODEL,NP,g.i);return r&&Number.isFinite(r[k])?r:null},
  baseline:have.length>1?base:null,summaryNote:(k==="tpot_ms"&&FW==="llamacpp")?["TPOT basis differs: B70 server-side · B60 / AISO1 client-side stream. Values are real; the gap is not all GPU.","TPOT 計時口徑不同：B70 伺服器端；B60、AISO1 客戶端串流。數值為實測，差距不全是 GPU 效能。"]:null,width:w,context:`${fwLabel(FW)} · ${mlabel(FW,MODEL)} · NP${NP}`,
  message:have.length>1?"":`目前只有 ${have[0].label} 有「${fwLabel(FW)} · ${mlabel(FW,MODEL)} · NP${NP}」的資料，另外的機器登錄後會自動並排並計算差異`,
  tableNote:have.length>1?`差異以 ${baseLabel} 為基準；綠色 + 表示較佳、紅色 − 表示較差`:"尚無第二台機器可比較"})));
}
function renderTable(){
 const ins=inputsNow(),c=(r,k)=>`<td>${r?(k==="aggregate_tps"?num(r[k],1):val(k,r[k])):"—"}</td>`;
 const sub=`<th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th>`;
 const rows=ins.map(i=>`<tr><td>${kn(i)}</td>${REG.machines.map(m=>{const r=get(m.key,FW,MODEL,NP,i);return ["ttft_s","tpot_ms","norm_tps","aggregate_tps"].map(k=>c(r,k)).join("")}).join("")}</tr>`).join("");
 $s("stTable").innerHTML=`<thead><tr><th rowspan="2">Input</th>${REG.machines.map(m=>`<th colspan="4" class="l">${esc(m.label)}</th>`).join("")}</tr><tr>${REG.machines.map(()=>sub).join("")}</tr></thead><tbody>${rows}</tbody>`;
 $s("stTableSub").textContent=`${fwLabel(FW)} · ${mlabel(FW,MODEL)} · NP${NP} · 3 次重複平均；「—」= 該機器此組合沒有資料。`;
}
function renderCover(){
 const desc=(mach,fw,m)=>{const rs=runsOf(mach,fw).filter(r=>r.model===m),pt=((DATA[mach]&&DATA[mach][fw]&&DATA[mach][fw].partial)||[]).filter(r=>r.model===m).length;if(!rs.length)return '<span class="st-wait">無資料</span>';
  const nps=[...new Set(rs.map(r=>r.np))].sort((a,b)=>a-b),ins=rs.map(r=>r.input);return `NP${nps.join("/")} · ${kn(Math.min(...ins))}–${kn(Math.max(...ins))} · ${rs.length} 筆${pt?`<small class="cmp-part">另有 ${pt} 筆部分結果（不計入）</small>`:""}`};
 const rows=REG.frameworks.flatMap(f=>REG.models.map((m,i)=>`<tr>${i===0?`<td rowspan="${REG.models.length}" class="st-model">${esc(f.label)}</td>`:""}<td title="${esc(mtitle(f.key,m.key))}">${esc(mlabel(f.key,m.key))}</td>${REG.machines.map(x=>`<td>${desc(x.key,f.key,m.key)}</td>`).join("")}</tr>`)).join("");
 $s("stCover").innerHTML=`<thead><tr><th>Framework</th><th>Model</th>${REG.machines.map(m=>`<th class="l">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
const bi=(en,zh)=>zh?`${en}<small class="zhs">${zh}</small>`:en;
const lab=l=>{const [en,zh]=String(l).split("|");return bi(esc(en),esc(zh||""))};      // "English|中文" -> English large, Chinese small beside it
const dispVal=v=>v==="未記錄"?bi("Not recorded","未記錄"):(v==="UNVERIFIED"||v==="未核實"?bi("Unverified","未核實"):esc(v));
function paramTable(){
 const L={llamacpp:{batch:"Batch size (--batch-size)|批次",ubatch:"Ubatch (--ubatch-size)|微批次",per_slot_context:"Context / slot|每槽上下文",slots:"Parallel slots|槽數",split:"Split mode|切分模式"},
  vllm:{batch:"Max batched tokens (≠ llama.cpp batch)|最大批次 token",per_slot_context:"Max model len|模型長度",slots:"Max sequences|序列數",split:"Tensor parallel|張量並行"},
  sglang:{batch:"Chunked prefill (≠ llama.cpp batch)|分塊預填",per_slot_context:"Context / model len|上下文長度",slots:"Max running requests|最大並行請求",split:"Tensor parallel|張量並行"}}[FW]||{};
 const lc=FW==="llamacpp";
 const rows=[[L.batch||"Batch|批次","batch"],lc&&[L.ubatch,"ubatch"],[L.per_slot_context||"Context|上下文","per_slot_context"],[L.slots||"Slots|槽數","slots"],lc&&["Total context (NP"+NP+")|總 Context","total_kv"],["KV cache type|KV cache 型別","kv_cache_type"],["Prefix cache|前綴快取","prefix_cache"],lc&&["Flash Attention|","flash_attention"],[L.split||"Split|切分","split"],lc&&["Unified KV|","unified_kv"],lc&&["Continuous batching|連續批次","cont_batching"],lc&&["Context shift|","context_shift"],lc&&["GPU layers (-ngl)|","gpu_layers"],["GPU memory utilization|GPU 記憶體使用率","memory_fraction"],FW==="vllm"&&["Chunked prefill|","chunked_prefill"],["Attention backend|","attention_backend"],["Page size|","page_size"],["GPUs used|使用 GPU 數","gpus_used"],["GPU evidence|型號佐證","gpu_evidence"],["Runtime|版本","runtime"]].filter(Boolean);
 const ALT={batch:"batch",per_slot_context:"max_context",slots:"max_seqs",split:"tp"};
 const prof=m=>{const d=DATA[m.key]&&DATA[m.key][FW];if(!d)return null;const c=(d.config&&d.config[MODEL])||{},p={...d.profile};if(p.per_slot_context&&p.total_kv===undefined)p.total_kv=(p.total_kv_by_np&&p.total_kv_by_np[NP])||p.per_slot_context*NP;if(p.gpus_used==null){const g=typeof p.tp==='number'?p.tp:p.gpu_count;if(g!=null)p.gpus_used=g}Object.entries(ALT).forEach(([k,a])=>{if((p[k]===undefined||p[k]===null)&&c[a]!==undefined&&c[a]!==null&&c[a]!=="")p[k]=c[a]});
  if(typeof p.batch==='string'){const n=p.batch.match(/\d+/);if(n)p.batch=n[0]}return p};
 const val=(p,k)=>{if(!p)return "—";const v=p[k];return v===undefined||v===null||v===""?"未記錄":String(v)};
 const bad=v=>v==="未記錄"||v==="—"||v==="UNVERIFIED";
 const present=vs=>vs.filter(v=>v!=="—");
 const shown=rows.map(([l,k])=>[l,REG.machines.map(m=>val(prof(m),k))]).filter(([l,vs])=>vs.some(v=>!bad(v)));
 if(!shown.length)return "";
 const same=[],diff=[];
 shown.forEach(([l,vs])=>{const pr=present(vs),known=pr.filter(v=>!bad(v));(pr.length>=2&&known.length===pr.length&&new Set(known).size===1?same:diff).push([l,vs,known])});
 const th=REG.machines.map(m=>`<th>${esc(m.label)}</th>`).join("");
 const dRows=diff.map(([l,vs,known])=>{const st=new Set(known).size>1?bi("Different","設定不同"):bi("Unverified","未核實");return `<tr><th>${lab(l)}</th>${vs.map(v=>`<td${bad(v)?' class="pt-unk"':""}>${dispVal(v)}</td>`).join("")}<td>⚠ ${st}</td></tr>`}).join("");
 const sRows=same.map(([l,vs,known])=>`<div><dt>${lab(l)}</dt><dd>${esc(known[0])}</dd></div>`).join("");
 const nM=REG.machines.length===2?bi("Two machines","兩機"):bi("Three machines","三機");
 const lead=OTHER?`<p class="pt-lead warn">⚠ ${esc(fwLabel(FW))}: ${bi("parameters differ, do not compare as equal conditions","各機參數不同，不可當成同條件比較")}</p>`:"";
 if(!OTHER){const mk=REG.machines.map(m=>m.label.replace(/^Intel /,"").replace(/ AMD$/,""));
  const uRows=diff.map(([l,vs])=>`<div class="pt-u"><dt>${lab(l)}</dt><dd>${vs.map((v,n)=>`<span class="${bad(v)?"pt-unk":""}"><i>${esc(mk[n])}</i> ${dispVal(v)}</span>`).join("")}</dd></div>`).join("");
  const um=$s("secUnmatched");if(um){um.hidden=!diff.length;um.innerHTML=diff.length?`<header><h2>Notes<span class="zh">備註 · ${diff.length}</span></h2></header><p class="v2-fn">${esc(fwLabel(FW))} · ${bi("Differing or unverified settings (not in the identical list above)","各機設定不同或未核實的項目")}</p><div class="pt-diffbox"><dl class="pt-ulist pt-ucols">${uRows}</dl></div>`:""}
  return `<h3 class="pt-h">Identical parameters<small class="zhs">${REG.machines.length===2?"兩機":"三機"}相同參數 · ${esc(fwLabel(FW))} · ${same.length}</small></h3><div class="pt-same pt-only">${sRows?`<dl>${sRows}</dl>`:`<p class="pt-none">${bi("No parameter is identical across the machines","目前沒有各機一致的參數")}</p>`}</div>`}
 {const um=$s("secUnmatched");if(um){um.hidden=true;um.innerHTML=""}}
 {const inner=`${lead}<div class="pt-split"><div class="pt-same"><h4>✓ Identical<small class="zhs">相同 · ${same.length}</small></h4>${sRows?`<dl>${sRows}</dl>`:`<p class="pt-none">${bi("None","沒有")}</p>`}</div><div class="pt-diffbox"><h4>⚠ Different / unverified<small class="zhs">不同／未核實 · ${diff.length}</small></h4>${diff.length?`<div class="pt-wrap"><table class="pt-tbl"><thead><tr><th>${bi("Parameter","參數")}</th>${th}<th>${bi("Verdict","判定")}</th></tr></thead><tbody>${dRows}</tbody></table></div>`:`<p class="pt-none">${bi("None","無")}</p>`}</div></div>`;
  const um=$s("secUnmatched");if(um){um.hidden=false;um.innerHTML=`<header><h2>Notes<span class="zh">備註 · ${esc(fwLabel(FW))} ${bi("machine parameters","各機參數")}</span></h2></header>${inner}`}return ""}
}
function renderSetup(){
 const r=(k,v)=>`<div><dt>${lab(k)}</dt><dd>${v}</dd></div>`;
 const rng=(m,k)=>{const v=[...new Set(REG.frameworks.flatMap(f=>runsOf(m,f.key)).map(x=>x[k]))].sort((a,b)=>a-b);return v.length?v.join("/"):"待核"};
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>Key parameters<span>測試參數</span></h2>
 <dl class="v2-params">${r("Output|輸出","1,024 tokens")}${r("Repeat|重複",bi("3 runs, averaged","3 次取平均"))}${r("Input|輸入","4K / 8K / 16K")}${r("NP (concurrency)|並發","1 / 2 / 4 / 5")}</dl>
 ${paramTable()}</section>`;
}
function renderConfig(){
 const rows=[["來源 Repo","repo"],["格式／量化","format"],["後端","backend"],["TP／切分","tp"],["Max Context","max_context"],["Batch／Chunk","batch"],["Max Seqs／Slots","max_seqs"],["Memory Fraction","mem_fraction"],["Cache","cache"],["Run","run_id"],["測試日期","date"]];
 const col=m=>{const ds=DATA[m.key]&&DATA[m.key][FW],has=runsOf(m.key,FW).some(r=>r.model===MODEL),c=ds&&ds.config[MODEL];return{has,c}};
 const cols=REG.machines.map(m=>({m,...col(m)}));
 const cell=(x,k)=>{if(!x.has)return '<td class="st-wait">此組合無資料</td>';const v=x.c?x.c[k]:null;return v===null||v===undefined||v===""?'<td class="cmp-unv">未核實</td>':`<td>${esc(v)}</td>`};
 $s("stCfg").innerHTML=`<thead><tr><th>項目</th>${cols.map(x=>`<th class="l">${esc(x.m.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(([l,k])=>`<tr><td class="st-model">${l}</td>${cols.map(x=>cell(x,k)).join("")}</tr>`).join("")}</tbody>`;
 $s("stCfgSub").textContent=`${fwLabel(FW)} · ${mlabel(FW,MODEL)}；欄位「未核實」= 來源資料沒有記錄，不以預設值填入。Output 1024、Repeat 3 為三機共同條件。`;
}
function renderPairs(){
 const el=$s("stPairs");if(!el)return;
 const link=(k,t)=>`<a class="pair-btn${PAIR===k?" on":""}" href="stress-test-pair.html?pair=${k}"${PAIR===k?' aria-current="page"':""}>${t}</a>`;
 el.innerHTML=`<div class="pair-tier"><span class="pair-tl">Multi-Tool<small class="zhs">多機比對</small></span><a class="pair-btn all${PAIR?"":" on"}" href="stress-test-compare.html"${PAIR?"":' aria-current="page"'}>AISO1 v.s B60 v.s B70</a></div><div class="pair-tier"><span class="pair-tl">Single-Tool<small class="zhs">兩機比對</small></span>${link("aiso1-b70","AISO1 vs B70")}${link("aiso1-b60","AISO1 vs B60")}${link("b60-b70","B60 vs B70")}</div>`;
}
const OMIT={aiso1:[5]};   // AISO1 cannot run NP5: never listed as missing
const omitted=(mk,n)=>(OMIT[mk]||[]).includes(n);
function renderGapPair(){
 const IN3=[4096,8192,16384],has=(m,fw,mod,np)=>IN3.every(i=>get(m,fw,mod,np,i)),[A,B]=REG.machines,map=new Map();
 REG.frameworks.forEach(f=>REG.models.forEach(m=>npsAll().forEach(n=>{
  const a=has(A.key,f.key,m.key,n),b=has(B.key,f.key,m.key,n),k=f.key+"|"+m.key,o=map.get(k)||{fw:f.key,model:m.key,both:[],onlyA:[],onlyB:[]};
  if(a&&b)o.both.push(n);else if(a&&!omitted(B.key,n))o.onlyA.push(n);else if(b&&!omitted(A.key,n))o.onlyB.push(n);map.set(k,o)})));
 const chip=(o,nps)=>`<button type="button" class="gap-chip" title="${esc(mtitle(o.fw,o.model))}" data-fw="${o.fw}" data-model="${o.model}" data-np="${nps[0]}"><b>${esc(fwLabel(o.fw))}</b><span>${esc(mlabel(o.fw,o.model))}</span><small>NP${nps.join(" / NP")}</small></button>`;
 const list=key=>[...map.values()].filter(o=>o[key].length),box=(cls,h,sub,items,key,fn)=>`<div class="gap-box ${cls}"><h3>${h} <small>${sub}</small></h3><div class="gap-chips">${items.map(o=>chip(o,o[key])).join("")||'<span class="st-wait">無</span>'}</div>${fn?`<p class="v2-fn">${fn}</p>`:""}</div>`;
 const both=list("both"),oa=list("onlyA"),ob=list("onlyB"),ai=REG.machines.some(m=>m.key==="aiso1");
 $s("stGap").innerHTML=box("ok","可直接並排",`${esc(A.label)}、${esc(B.label)} 都有 Input 4K / 8K / 16K · ${both.length} 組`,both,"both","點選任一組合會跳到下方圖表。");
 $s("stGap").querySelectorAll(".gap-chip").forEach(b=>b.onclick=()=>{FW=b.dataset.fw;OTHER=FW!=="llamacpp";MODEL=b.dataset.model;NP=+b.dataset.np;renderAll();$s("secMetrics").scrollIntoView({behavior:"smooth",block:"start"})});
}
let GAPFW=null;
function renderGap(){
 if(PAIR)return renderGapPair();
 if(true){$s("stGap").innerHTML="";return}
 const IN3=[4096,8192,16384],has=(m,fw,mod,np)=>IN3.every(i=>get(m,fw,mod,np,i));
 const key=new Map();   // fw|model -> {all:[np], miss:[np]}
 REG.frameworks.forEach(f=>REG.models.forEach(m=>npsAll().forEach(n=>{
  const b60=has("b60",f.key,m.key,n),b70=has("b70",f.key,m.key,n),ai=has("aiso1",f.key,m.key,n);
  const k=f.key+"|"+m.key,o=key.get(k)||{fw:f.key,model:m.key,all:[],miss:[]};
  if(b60&&b70&&ai)o.all.push(n);else if(b60&&b70&&!ai&&!omitted("aiso1",n))o.miss.push(n);
  key.set(k,o)})));
 const chip=(o,nps)=>`<button type="button" class="gap-chip" title="${esc(mtitle(o.fw,o.model))}" data-fw="${o.fw}" data-model="${o.model}" data-np="${nps[0]}"><span>${esc(mlabel(o.fw,o.model))}</span><small>NP${nps.join(" / NP")}</small></button>`;
 const all=[...key.values()].filter(o=>o.all.length),miss=[...key.values()].filter(o=>o.miss.length);
 $s("stGap").innerHTML=`<div class="gap-box ok"><h3 class="gap-sub">Ready to compare<small class="zhs">可直接比對 · ${all.length} 組</small></h3>${(()=>{const fl=REG.frameworks.filter(f=>all.some(o=>o.fw===f.key)).sort((x,y)=>(y.key==="llamacpp")-(x.key==="llamacpp"));if(!fl.length)return'<span class="st-wait">無</span>';if(!fl.some(f=>f.key===GAPFW))GAPFW=fl[0].key;return`<div class="gap-fwsel" role="tablist" aria-label="Framework">${fl.map(f=>`<button type="button" role="tab" class="gap-fwb${f.key===GAPFW?" on":""}" aria-selected="${f.key===GAPFW}" data-gfw="${f.key}"><b>${esc(f.label)}</b><small>${all.filter(o=>o.fw===f.key).length} 組 · 推論框架</small></button>`).join("")}</div><div class="gap-chips">${all.filter(o=>o.fw===GAPFW).map(o=>chip(o,o.all)).join("")}</div>`})()}<p class="v2-fn">B60、B70、AISO1 三台都有 Input 4K / 8K / 16K 的數值（AISO1 vLLM 為歷史・未核實；llama.cpp 為 B1024 重測，含 TTFT / TPOT）。</p></div>`;
 $s("stGap").querySelectorAll(".gap-fwb").forEach(b=>b.onclick=()=>{GAPFW=b.dataset.gfw;renderGap()});
 $s("stGap").querySelectorAll(".gap-chip").forEach(b=>b.onclick=()=>{FW=b.dataset.fw;OTHER=FW!=="llamacpp";MODEL=b.dataset.model;NP=+b.dataset.np;renderAll();$s("secMetrics").scrollIntoView({behavior:"smooth",block:"start"})});
}
let RMET="norm_tps";
function renderRepeats(){
 $s("rpMetric").innerHTML=btn("rp",Object.entries(RC.METRICS).map(([k,d])=>[k,d.short,true]),RMET);
 $s("rpMetric").querySelectorAll("button").forEach(b=>b.onclick=()=>{RMET=b.dataset.k;renderRepeats()});
 const el=$s("stRepeat");
 el.innerHTML=RC.html({width:el.clientWidth,machines:REG.machines,runsFor:mk=>cellRuns(mk),metric:RMET,inputs:inputsNow(),np:NP,title:`${modelName(MODEL)} / NP${NP} · ${fwLabel(FW)}`});
 RC.bind(el);
}
function renderAll(){renderControls();renderSetup();renderMetrics();renderRepeats();renderTable();renderConfig()}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry "+r.status);return r.json()})]).then(([reg])=>{
 REG=reg;
 if(PAIR)REG.machines=reg.machines.filter(m=>PAIRS[PAIR].includes(m.key));
 return Promise.all(reg.datasets.filter(x=>!PAIR||PAIRS[PAIR].includes(x.machine)).map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{
  const runs=(d[x.runs_key]||[]).map(r=>({...r,norm_tps:r.aggregate_tps/r.np,repeats:r.repeats||(Array.isArray(r.repeats_aggregate_tps)?{aggregate_tps:r.repeats_aggregate_tps}:undefined)}));
  (DATA[x.machine]=DATA[x.machine]||{})[x.framework]={profile:d.profile,runs,evidence_until:d.evidence_until,caveat:d.comparability||null,config:d.config_by_model||{},partial:d.partial_runs||[]};
 })));
}).then(()=>{
 // default: a combination all three machines share, else two, else the first one with any data, else the first one with any data
 const combos=[...REG.frameworks].sort((a,b)=>(b.key==='llamacpp')-(a.key==='llamacpp')).flatMap(f=>REG.models.flatMap(m=>npsAll().map(n=>[f.key,m.key,n])));
 const cnt=([f,m,n])=>REG.machines.filter(x=>runsOf(x.key,f).some(r=>r.model===m&&r.np===n)).length;
 const full=([f,m,n])=>REG.machines.every(x=>{const rs=runsOf(x.key,f).filter(r=>r.model===m&&r.np===n);return [4096,8192,16384].every(i=>rs.some(r=>r.input===i&&Number.isFinite(r.ttft_s)&&Number.isFinite(r.tpot_ms)&&Number.isFinite(r.aggregate_tps)))});   // all machines, all inputs, TTFT + TPOT + TPS present
 const best=combos.find(full)||combos.find(c=>cnt(c)>=REG.machines.length)||combos.find(c=>cnt(c)>=2)||combos.find(c=>cnt(c)>=1)||combos[0];
 [FW,MODEL,NP]=best;OTHER=FW!=="llamacpp";
 if(PAIR){const t=PAIR_TITLE[PAIR],lb=REG.machines.map(m=>m.label).join(" · ");
  document.title=`AISO — Stress Test · ${t}`;$s("pgTitle").innerHTML=`${esc(t)} <small class="zhs">Stress Test</small>`;
  $s("zhMetrics").textContent=`四項指標 · ${lb} 長條圖`;$s("zhCfg").textContent="同框架 · 同模型 · 兩機實際啟動條件"}
 renderPairs();renderGap();renderCover();renderAll();
 (function(){   // Data menu: opens on hover / focus (CSS) and on click or tap
  const m=$s("dataMenu");if(!m)return;const b=m.querySelector(".dm-btn");
  b.addEventListener("click",e=>{e.preventDefault();const o=m.classList.toggle("open");b.setAttribute("aria-expanded",String(o))});
  document.addEventListener("click",e=>{if(!m.contains(e.target)){m.classList.remove("open");b.setAttribute("aria-expanded","false")}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){m.classList.remove("open");b.setAttribute("aria-expanded","false")}});
 })();
 (function(){   // one collapsible "Evidence" panel with tabs; the five detail sections live inside it
  const parts=[["secRepeat","Repeat stability","穩定度"],["secTable","Full values","完整數值"],["secCfg","Config diff","設定差異"],["secCover","Coverage","資料覆蓋"],["secUnmatched","Notes","備註"]].filter(([id])=>$s(id));
  const first=$s(parts[0][0]),det=document.createElement("section");det.className="report-section sec-detail hv-fold hv-closed";det.id="secDetail";
  det.innerHTML='<header><h2>Evidence<span class="zh">佐證資料</span></h2><span class="hv-hint" aria-hidden="true">Click to pin <small class="zhs">點一下固定</small></span></header><div class="dt-tabs st-tabs" role="tablist"></div><div class="dt-body"></div>';
  first.parentNode.insertBefore(det,first);
  const tabs=det.querySelector(".dt-tabs"),body=det.querySelector(".dt-body");
  parts.forEach(([id,label,zh],n)=>{const sec=$s(id);sec.classList.remove("sec-fold","sec-closed");body.appendChild(sec);const b=document.createElement("button");b.type="button";b.dataset.id=id;b.innerHTML=label+'<small class="zhs">'+zh+"</small>";b.onclick=()=>pick(id);tabs.appendChild(b)});
  function pick(id){tabs.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.id===id));parts.forEach(([i])=>$s(i).classList.toggle("dt-off",i!==id));if(id==="secRepeat")renderRepeats()}
  if(window.HoverFold)HoverFold.bind(det);det.addEventListener("hvopen",()=>renderRepeats());
  pick(parts[0][0]);
 })();
 const last=Object.values(DATA).flatMap(o=>Object.values(o)).map(d=>d.evidence_until).sort().pop();
 $s("stFoot").textContent=`資料更新至 ${last}；新增資料集只需在 data/benchmark-registry.json 登錄，本頁自動帶入。`;
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{renderMetrics();renderRepeats()},150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
