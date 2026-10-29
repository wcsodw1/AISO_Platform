"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"];
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 output_tps:{short:"TPS",en:"Output TPS",zh:"每秒輸出 token",unit:"tokens/s",higher:true,dec:2,formula:"Improvement = (Mode ÷ Baseline − 1) × 100%"},
 ttft_median_ms:{short:"TTFT",en:"TTFT",zh:"首字延遲",unit:"ms",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"},
 tpot_median_ms:{short:"TPOT",en:"TPOT",zh:"每個輸出 token 的時間",unit:"ms/token",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"}};
const S={input:"all",c:"all",metric:"output_tps",sort:"order",dir:1,rMode:"all",rC:"all",rInput:"all",rRun:"all",rrMetric:"output_tps"};
let D,LABEL={},GPU={};

const num=(v,d)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
function pct(v){
 if(!Number.isFinite(v))return `<span class="v2-na">—</span>`;
 if(Math.abs(v)<0.05)return `<span class="v2-d flat">0.0%</span>`;
 return `<span class="v2-d ${v>0?"gain":"loss"}">${v>0?"▲ +":"▼ −"}${Math.abs(v).toFixed(1)}%</span>`;
}
function pct2(v){return `<b class="v2-big ${v>0?"gain":v<0?"loss":"flat"}">${v>0?"+":v<0?"−":""}${Math.abs(v).toFixed(2)}%</b>`}
const skey=s=>`${s.input_tokens}/${s.concurrency}`;
const excluded=(i,c)=>D.displayExclusions.some(e=>e.inputTokens===i&&e.concurrency===c);
function scenarios(){return D.scenarioComparison.filter(s=>(S.input==="all"||s.input_tokens===+S.input)&&(S.c==="all"||s.concurrency===+S.c))}
function opts(el,items,cur){el.innerHTML=items.map(([v,t])=>`<option value="${vEsc(v)}"${String(v)===String(cur)?" selected":""}>${vEsc(t)}</option>`).join("")}
function seg(el,items,cur){el.innerHTML=items.map(([v,t])=>`<button type="button" data-v="${v}" aria-pressed="${v===cur}">${t}</button>`).join("")}
const modeName=m=>LABEL[m]||m;

function renderTop(){
 const md=D.metadata,w=[...new Set(D.batchDetail72.map(r=>r.input_tokens))].sort((a,b)=>a-b),cs=[...new Set(D.batchDetail72.map(r=>r.concurrency))].sort((a,b)=>a-b);
 $v("v2Chips").innerHTML=[`Model ${md.model}`,`MAX_MODEL_LEN ${md.max_model_len}`,`Input ${[...new Set(D.scenarioComparison.map(s=>s.input_tokens))].join(" / ")}`,`Output target ${md.output_target_tokens}`,`C ${cs.join(" / ")}`,`${md.repetitions} runs (R1–R3)`,`Seed = ${md.seed_formula}`,`Run ${md.run_id}`].map(t=>`<li>${vEsc(t)}</li>`).join("");
 const checks=[["Runs",D.batchDetail72.length,72],["Scenarios",D.scenarioComparison.length,8],["Chart groups",D.scenarioMetricsLong.length,24],["Excluded records",D.excluded.length,9]];
 $v("v2Qa").innerHTML=checks.map(([n,a,b])=>`<li class="${a===b?"ok":"bad"}">${a===b?"✓":"✗"} ${n} <b>${a} / ${b}</b></li>`).join("");
 const h=D.headlineImprovementPct,sc=D.scenarioComparison;
 const wins=(m,k)=>sc.filter(s=>s[`${m}_${k}_improvement_pct`]>0).length;
 const score=m=>m==="baseline"?0:Object.keys(METRICS).reduce((a,k)=>a+h[`${m}_${k}_average_improvement_pct`],0)/3;
 const rank=[...MODES].sort((a,b)=>score(b)-score(a));
 $v("v2Cards").innerHTML=MODES.map(m=>{
  const info=D.modes.find(x=>x.key===m);
  const rows=Object.entries(METRICS).map(([k,def])=>m==="baseline"?`<li><span>${def.short}<small>${def.unit}</small></span><b class="v2-big flat">Reference</b></li>`:`<li><span>${def.short}<small>${def.higher?"higher is better":"lower is better"}</small></span>${pct2(h[`${m}_${k}_average_improvement_pct`])}<small class="v2-win">${wins(m,k)} / 8 wins</small></li>`).join("");
  return `<article class="v2-card" style="--mc:${COL[m]}"><header><h3>${vEsc(info.label)}</h3><span>GPU ${info.gpu} · :${info.port}</span></header><p class="v2-rank">Overall rank #${rank.indexOf(m)+1}<small>8 情境等權平均</small></p><ul>${rows}</ul></article>`;
 }).join("");
}

function niceTop(max){const raw=max/4,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(s=>s*mag>=raw)*mag;return {step,top:step*4}}
function barChart(key,list){
 const def=METRICS[key],n=list.length;
 if(!n)return `<p class="v2-empty">${S.input==="15950"&&S.c==="5"?"Input 15950 / C5 已依規格排除，不顯示。":"沒有符合的情境。"}</p>`;
 const L=62,R=14,T=14,B=58,gw=Math.max(78,Math.min(150,760/n)),W=L+R+gw*n,H=300,ih=H-T-B;
 const max=Math.max(...list.flatMap(s=>MODES.map(m=>s[`${m}_${key}`])));
 const {step,top}=niceTop(max),y=v=>T+ih-v/top*ih,bw=Math.min(30,(gw-18)/3);
 let g="";
 for(let i=0;i<=4;i++){const yy=y(step*i);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="gl"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(step*i,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${def.unit}</text>`;
 list.forEach((s,i)=>{
  const x0=L+gw*i+(gw-bw*3-4)/2;
  MODES.forEach((m,j)=>{const v=s[`${m}_${key}`],x=x0+j*(bw+2);
   g+=`<rect x="${x}" y="${y(v)}" width="${bw}" height="${T+ih-y(v)}" rx="2" fill="${COL[m]}"><title>${vEsc(modeName(m))} (GPU ${GPU[m]}) · Input ${s.input_tokens} · C${s.concurrency}: ${num(v,def.dec)} ${def.unit}</title></rect>`});
  g+=`<text x="${L+gw*i+gw/2}" y="${H-30}" text-anchor="middle" class="xl">${s.input_tokens}</text><text x="${L+gw*i+gw/2}" y="${H-14}" text-anchor="middle" class="xl2">C${s.concurrency}</text>`;
 });
 return `<div class="v2-chartwrap"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(W,360)}px" role="img" aria-label="${def.en} by scenario">${g}</svg></div>`;
}
function renderCharts(){
 const list=scenarios();
 $v("v2Count").textContent=`顯示 ${list.length} / ${D.scenarioComparison.length} 個情境 · Input 15950 / C5 已依規格整組排除`;
 $v("v2Legend").innerHTML=MODES.map(m=>`<span><i style="background:${COL[m]}"></i>${vEsc(modeName(m))}<small>GPU ${GPU[m]}</small></span>`).join("");
 $v("v2ChartList").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.en}<span class="zh-i">${d.zh}</span><small>${d.unit} · ${d.higher?"higher is better ↑":"lower is better ↓"}</small></h3>${barChart(k,list)}</article>`).join("");
}
function renderTable(){
 const def=METRICS[S.metric],k=S.metric;
 seg($v("tMetric"),Object.entries(METRICS).map(([v,d])=>[v,d.short]),S.metric);
 let list=[...scenarios()];
 if(S.sort!=="order")list.sort((a,b)=>(a[`${S.sort}_${k}_improvement_pct`]-b[`${S.sort}_${k}_improvement_pct`])*S.dir);
 else list.sort((a,b)=>(a.input_tokens-b.input_tokens||a.concurrency-b.concurrency)*S.dir);
 $v("tDir").textContent=S.dir>0?"↑ ASC":"↓ DESC";
 $v("tNote").innerHTML=`${def.en}（${def.unit}）· 每格是 3 輪平均 · ${def.formula} · 負值＝比 Baseline 差`;
 const avg=m=>list.length?list.reduce((a,s)=>a+s[`${m}_${k}_improvement_pct`],0)/list.length:NaN;
 const body=list.map(s=>`<tr><td>${s.input_tokens}</td><td>C${s.concurrency}</td><td>${num(s[`baseline_${k}`],def.dec)}</td><td>${num(s[`aidaptiv_${k}`],def.dec)}</td><td>${pct(s[`aidaptiv_${k}_improvement_pct`])}</td><td>${num(s[`lmcache_${k}`],def.dec)}</td><td>${pct(s[`lmcache_${k}_improvement_pct`])}</td></tr>`).join("");
 $v("tScenario").innerHTML=`<thead><tr><th>Input</th><th>C</th><th class="b">Baseline<small>GPU ${GPU.baseline}</small></th><th class="a">aiDAPTIV<small>GPU ${GPU.aidaptiv}</small></th><th>vs Baseline</th><th class="l">LMCache<small>GPU ${GPU.lmcache}</small></th><th>vs Baseline</th></tr></thead><tbody>${body||`<tr><td colspan="7" class="v2-empty">沒有符合的情境</td></tr>`}</tbody>${list.length?`<tfoot><tr><td colspan="4">Equal-weight average of ${list.length} scenario${list.length>1?"s":""}</td><td>${pct(avg("aidaptiv"))}</td><td></td><td>${pct(avg("lmcache"))}</td></tr></tfoot>`:""}`;
}
function renderRaw(){
 const rows=D.batchDetail72.filter(r=>(S.rMode==="all"||r.mode===S.rMode)&&(S.rC==="all"||r.concurrency===+S.rC)&&(S.rInput==="all"||r.input_tokens===+S.rInput)&&(S.rRun==="all"||r.repetition===+S.rRun));
 $v("rCount").textContent=`顯示 ${rows.length} / ${D.batchDetail72.length} 筆`;
 $v("tRaw").innerHTML=`<thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Run</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS<small>tok/s</small></th><th>Norm. TPS/C<small>reported</small></th><th>Output tokens</th></tr></thead><tbody>${rows.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(modeName(r.mode))}</td><td>${r.gpu}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>R${r.repetition}</td><td>${num(r.ttft_median_ms,2)}</td><td>${num(r.tpot_median_ms,2)}</td><td>${num(r.output_tps,2)}</td><td>${num(r.normalized_tps_per_c_reported,2)}</td><td>${r.total_output_tokens}</td></tr>`).join("")||`<tr><td colspan="10" class="v2-empty">沒有符合的資料</td></tr>`}</tbody>`;
}
function renderRR(){
 const k=S.rrMetric,def=METRICS[k];
 seg($v("rrMetric"),Object.entries(METRICS).map(([v,d])=>[v,d.short]),k);
 $v("tRR").innerHTML=`<thead><tr><th>Input</th><th>C</th><th>Phase</th><th class="b">Baseline</th><th class="a">aiDAPTIV</th><th class="l">LMCache</th></tr></thead><tbody>${D.repetitionComparison.map(r=>`<tr><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>${r.phase.replace("_","/")}</td>${MODES.map(m=>`<td>${num(r[`${m}_${k}`],def.dec)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function renderMethod(){
 const d=D.metricDefinitions;
 $v("v2MethodBody").innerHTML=`<h4>Conclusion<span class="zh-i">結論</span></h4><ul><li>本輪<b>未達成</b> aiDAPTIV、LMCache 優於 Baseline 的效能預期；兩者 8 情境平均皆為負。</li><li>LMCache 整體比 aiDAPTIV 更接近 Baseline；這是「整體服務組態」的觀察，不能直接當成 SSD KV Offload 本身的因果。</li></ul>
 <h4>Metric definitions<span class="zh-i">指標定義</span></h4><ul>${["output_tps","ttft_median_ms","tpot_median_ms","normalized_tps_per_c_reported","improvement_percent","headline_aggregation","rounding_caveat"].map(k=>`<li><code>${k}</code> ${vEsc(d[k])}</li>`).join("")}</ul>
 <h4>Limitations<span class="zh-i">限制</span></h4><ul>${D.limitations.map(x=>`<li>${vEsc(x)}</li>`).join("")}<li>三個模式使用不同實體 GPU（Baseline GPU 7、aiDAPTIV GPU 6、LMCache GPU 4）與不同 vLLM／容器版本。</li><li>Baseline 的 vLLM 原生 Prefix Cache 沒有完全控制；Random Prompt 與固定 seed 可能受益。</li><li>三組測試同時在同一台 Server 執行，可能共用 CPU／RAM／NVMe。</li><li>數值取自終端機顯示的 2 位小數，不代表伺服器原始高精度值。</li></ul>
 <h4>QA exclusions<span class="zh-i">排除紀錄（不納入任何圖表、表格或排名）</span></h4><p class="v2-note">Input 15950 / C5 整組排除：Baseline、LMCache 各 3 筆異常，aiDAPTIV 3 筆雖有效，為確保對照一致一併排除。</p><div class="table-wrap"><table class="v2-table"><thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Run</th><th>Status</th><th>Reason</th></tr></thead><tbody>${D.excluded.map(r=>`<tr><td>${vEsc(modeName(r.mode))}</td><td>${r.gpu}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>R${r.repetition}</td><td>${vEsc(r.status)}</td><td>${vEsc(r.reason)}</td></tr>`).join("")}</tbody></table></div>
 <h4>Downloads<span class="zh-i">原始資料</span></h4><ul class="v2-links">${[["AISO_BenchmarkV2_20000.json","Full JSON"],["AISO_Benchmark_Valid72.csv","72 raw runs"],["AISO_Scenario_Comparison_8.csv","8 scenarios"],["AISO_Scenario_Metrics_Long24.csv","24 chart groups"],["AISO_R1_vs_R2R3_16.csv","R1 vs R2/R3"],["AISO_Excluded9.csv","9 exclusions"]].map(([f,t])=>`<li><a href="data/benchmark-v2/${f}" download>${t}</a></li>`).join("")}</ul>`;
}
function renderFilters(){
 const inputs=[...new Set(D.batchDetail72.map(r=>r.input_tokens))].sort((a,b)=>a-b),cs=[...new Set(D.batchDetail72.map(r=>r.concurrency))].sort((a,b)=>a-b);
 const allInputs=[3950,7950,15950],allC=[1,2,5];
 opts($v("fInput"),[["all","All"],...allInputs.map(x=>[x,x])],S.input);
 opts($v("fC"),[["all","All"],...allC.map(x=>[x,`C${x}`])],S.c);
 opts($v("rModel"),[[D.metadata.model,D.metadata.model]],D.metadata.model);
 opts($v("rMode"),[["all","All"],...MODES.map(m=>[m,modeName(m)])],S.rMode);
 opts($v("rC"),[["all","All"],...cs.map(x=>[x,`C${x}`])],S.rC);
 opts($v("rInput"),[["all","All"],...inputs.map(x=>[x,x])],S.rInput);
 opts($v("rRun"),[["all","All"],[1,"R1"],[2,"R2"],[3,"R3"]],S.rRun);
}
function renderAll(){renderCharts();renderTable();renderRaw();renderRR()}

function bind(){
 const on=(id,key,after)=>$v(id).addEventListener("change",e=>{S[key]=e.target.value;after()});
 on("fInput","input",renderAll);on("fC","c",renderAll);on("tSort","sort",renderTable);
 on("rMode","rMode",renderRaw);on("rC","rC",renderRaw);on("rInput","rInput",renderRaw);on("rRun","rRun",renderRaw);
 $v("tDir").addEventListener("click",()=>{S.dir*=-1;renderTable()});
 $v("tMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.metric=b.dataset.v;renderTable()}});
 $v("rrMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.rrMetric=b.dataset.v;renderRR()}});
}
fetch("data/benchmark-v2/AISO_BenchmarkV2_20000.json",{cache:"no-store"}).then(r=>r.json()).then(d=>{
 D=d;
 // Input 15950 / C5 must never reach a chart, table or ranking, even if a future data file contains it.
 const keep=r=>!excluded(r.input_tokens,r.concurrency);
 ["batchDetail72","scenarioComparison","scenarioMetricsLong","repetitionComparison"].forEach(k=>{D[k]=D[k].filter(keep)});
 D.modes.forEach(m=>{LABEL[m.key]=m.label;GPU[m.key]=m.gpu});
 renderTop();renderFilters();renderMethod();renderAll();bind();
}).catch(()=>{$v("v2Count").textContent="載入失敗：data/benchmark-v2/AISO_BenchmarkV2_20000.json"});
