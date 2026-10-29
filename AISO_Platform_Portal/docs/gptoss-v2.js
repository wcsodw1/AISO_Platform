"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"];
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 output_tps:{short:"TPS",en:"Output TPS",zh:"每秒輸出 token",unit:"tokens/s",higher:true,dec:2,formula:"Improvement = (Mode ÷ Baseline − 1) × 100%"},
 ttft_median_ms:{short:"TTFT",en:"TTFT",zh:"首字延遲",unit:"ms",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"},
 tpot_median_ms:{short:"TPOT",en:"TPOT",zh:"每個輸出 token 的時間",unit:"ms/token",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"}};
const S={phase:"first",input:"all",c:"all",metric:"output_tps",sort:"order",dir:1,rMode:"all",rC:"all",rInput:"all",rRun:"all",wMetric:"ttft",bMetric:"ttft"};
const PHASE={first:"first_observed_r1",repeated:"repeated_observed_r2_r3"};
const PHASE_NAME={first:"First Run (R1)",repeated:"Repeated Run (R2/R3)",reuse:"Reuse (R2/R3 vs own R1)"};
let D,F,E,LABEL={},GPU={};

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
}

// Scenario rows for one phase, in the same shape the charts and tables already use.
const SHORT={output_tps:"tps",ttft_median_ms:"ttft",tpot_median_ms:"tpot"},SRC={output_tps:"tps",ttft_median_ms:"ttft_ms",tpot_median_ms:"tpot_ms"};
function phaseScenarios(phase){
 const rows=F.phase_comparison.filter(r=>r.phase===PHASE[phase]&&!excluded(r.input_tokens,r.concurrency)),out=new Map();
 rows.forEach(r=>{
  const k=skey(r);
  if(!out.has(k))out.set(k,{input_tokens:r.input_tokens,concurrency:r.concurrency,status:"PASS"});
  const s=out.get(k);
  Object.keys(METRICS).forEach(m=>{s[`${r.mode}_${m}`]=r[SRC[m]];s[`${r.mode}_${m}_improvement_pct`]=r[`${SHORT[m]}_improvement_vs_baseline_pct`]});
 });
 return [...out.values()].sort((a,b)=>a.input_tokens-b.input_tokens||a.concurrency-b.concurrency);
}
function headline(phase,mode){
 const h=F.headline.find(x=>x.phase===PHASE[phase]&&x.mode===mode);
 return h?{output_tps:h.tps_vs_baseline_pct,ttft_median_ms:h.ttft_vs_baseline_pct,tpot_median_ms:h.tpot_vs_baseline_pct}:null;
}
function renderCards(){
 const sc=D.scenarioComparison;
 const wins=(m,k)=>sc.filter(s=>s[`${m}_${k}_improvement_pct`]>0).length;
 const score=m=>{const h=headline(S.phase,m);return m==="baseline"?0:Object.keys(METRICS).reduce((a,k)=>a+h[k],0)/3};
 const rank=[...MODES].sort((a,b)=>score(b)-score(a));
 $v("v2Cards").innerHTML=MODES.map(m=>{
  const info=D.modes.find(x=>x.key===m),h=headline(S.phase,m);
  const rows=Object.entries(METRICS).map(([k,def])=>m==="baseline"?`<li><span>${def.short}<small>${def.unit}</small></span><b class="v2-big flat">Reference</b></li>`:`<li><span>${def.short}<small>${def.higher?"higher is better":"lower is better"}</small></span>${pct2(h[k])}<small class="v2-win">${wins(m,k)} / 8 wins</small></li>`).join("");
  return `<article class="v2-card" style="--mc:${COL[m]}"><header><h3>${vEsc(info.label)}</h3><span>GPU ${info.gpu} · :${info.port}</span></header><p class="v2-rank">Overall rank #${rank.indexOf(m)+1}<small>${PHASE_NAME[S.phase]} · 8 情境等權平均 · vs 同階段 Baseline</small></p><ul>${rows}</ul></article>`;
 }).join("");
}
function renderPhase(){
 seg2($v("phaseSeg"),S.phase);
 const reuse=S.phase==="reuse";
 ["v2Cards","secFilter","v2Charts","secTable"].forEach(id=>{$v(id).hidden=reuse});$v("v2Reuse").hidden=!reuse;
 if(reuse){
  $v("phaseCap").innerHTML=`<b>Reuse：每個模式拿自己的 R2/R3 平均，去比自己的第一次（R1）</b><br>這跟「三模式互比」是兩種不同的比較，不要混在一起看。${vEsc(F.caveat)}`;
  return;
 }
 $v("phaseCap").innerHTML=S.phase==="first"?`<b>${vEsc(F.first_label)}</b><br>每個情境只有 1 次觀測；R1 不保證是真正的冷快取（Baseline 原生 Prefix Cache、暖機都可能影響）。`:`<b>${vEsc(F.repeated_label)}</b><br>每個情境取 R2、R3 平均。${vEsc(F.caveat)}`;
 D.scenarioComparison=phaseScenarios(S.phase);
 renderCards();renderCharts();renderTable();
}
function seg2(el,cur){el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===cur))}
function reuseOf(k){const r=E.modes[k].requests.slice(1),mean=f=>r.reduce((a,x)=>a+x[f],0)/r.length;return {ttft:mean("ttft_ms"),tpot:mean("tpot_ms"),tps:mean("output_tps"),ext:r[0].external_hit_delta,gpu:r[0].gpu_hit_delta,n:r.length}}
function renderSsd(){
 const c=E.aidaptiv_config,x=k=>reuseOf(k).ext.toLocaleString("en-US");
 const items=[
  [true,`Per-request external KV hits on every Reuse request · 每個 Reuse 請求的外部 KV 命中：aiDAPTIV ${x("aidaptiv")} tokens；LMCache ${x("lmcache")} tokens（Prompt 3,950）；GPU prefix 命中 0`],
  [true,`aiDAPTIV engine log agrees: aiDAPTIVCache hit ${E.vendor_log_corroboration.requests[1].aidaptiv_cache_hit} on each Reuse request, 0 on Cold · 廠商 log 一致`],
  [true,`SSD tier is the only external tier for aiDAPTIV: DRAM KV offload ${c.dram_kv_offload_gb} GB, SSD KV offload ${c.ssd_kv_offload_gb} GB, GPU reuse disabled · DRAM offload 為 0，外部快取只能在 SSD`],
  [true,`Baseline hits come from the GPU prefix cache instead (${reuseOf("baseline").gpu.toLocaleString("en-US")} tokens per Reuse request, external 0) · Baseline 命中來自 GPU Prefix Cache`],
  [false,"Device-level SSD reads not measured (e.g. NVMe I/O counters); SSD-backing is inferred from configuration · 尚未量到 SSD 硬體實際讀寫量"],
  [false,"LMCache hits are via a disk cache configured as disk-only, but its device I/O was not measured either · LMCache 同樣未量測硬體 I/O"],
  [false,"72-run benchmark: no per-run hit telemetry; reuse_percent=80 is only the argument default (random_run_phase=1) · 72 筆正式 Benchmark 沒有逐批命中資料"]
 ];
 $v("v2SsdList").innerHTML=items.map(([ok,t])=>`<li class="${ok?"yes":"no"}"><i>${ok?"✓":"?"}</i><span>${vEsc(t)}</span></li>`).join("");
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
 $v("tNote").innerHTML=`${PHASE_NAME[S.phase]} · ${def.en}（${def.unit}）· ${S.phase==="first"?"每格是 R1 單次觀測":"每格是 R2/R3 平均"} · vs 同階段 Baseline · ${def.formula} · 負值＝比 Baseline 差`;
 const avg=m=>list.length?list.reduce((a,s)=>a+s[`${m}_${k}_improvement_pct`],0)/list.length:NaN;
 const body=list.map(s=>`<tr><td>${s.input_tokens}</td><td>C${s.concurrency}</td><td>${num(s[`baseline_${k}`],def.dec)}</td><td>${num(s[`aidaptiv_${k}`],def.dec)}</td><td>${pct(s[`aidaptiv_${k}_improvement_pct`])}</td><td>${num(s[`lmcache_${k}`],def.dec)}</td><td>${pct(s[`lmcache_${k}_improvement_pct`])}</td></tr>`).join("");
 $v("tScenario").innerHTML=`<thead><tr><th>Input</th><th>C</th><th class="b">Baseline<small>GPU ${GPU.baseline}</small></th><th class="a">aiDAPTIV<small>GPU ${GPU.aidaptiv}</small></th><th>vs Baseline</th><th class="l">LMCache<small>GPU ${GPU.lmcache}</small></th><th>vs Baseline</th></tr></thead><tbody>${body||`<tr><td colspan="7" class="v2-empty">沒有符合的情境</td></tr>`}</tbody>${list.length?`<tfoot><tr><td colspan="4">Equal-weight average of ${list.length} scenario${list.length>1?"s":""}</td><td>${pct(avg("aidaptiv"))}</td><td></td><td>${pct(avg("lmcache"))}</td></tr></tfoot>`:""}`;
}
function renderRaw(){
 const rows=D.batchDetail72.filter(r=>(S.rMode==="all"||r.mode===S.rMode)&&(S.rC==="all"||r.concurrency===+S.rC)&&(S.rInput==="all"||r.input_tokens===+S.rInput)&&(S.rRun==="all"||r.repetition===+S.rRun));
 $v("rCount").textContent=`顯示 ${rows.length} / ${D.batchDetail72.length} 筆`;
 $v("tRaw").innerHTML=`<thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Run</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS<small>tok/s</small></th><th>Norm. TPS/C<small>reported</small></th><th>Output tokens</th></tr></thead><tbody>${rows.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(modeName(r.mode))}</td><td>${r.gpu}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>R${r.repetition}</td><td>${num(r.ttft_median_ms,2)}</td><td>${num(r.tpot_median_ms,2)}</td><td>${num(r.output_tps,2)}</td><td>${num(r.normalized_tps_per_c_reported,2)}</td><td>${r.total_output_tokens}</td></tr>`).join("")||`<tr><td colspan="10" class="v2-empty">沒有符合的資料</td></tr>`}</tbody>`;
}
const WSRC={tps:{col:"tps_gain_pct",first:"first_tps",rep:"repeated_tps",en:"TPS",unit:"tok/s",higher:true,dec:2},ttft:{col:"ttft_gain_pct",first:"first_ttft_ms",rep:"repeated_ttft_ms",en:"TTFT",unit:"ms",higher:false,dec:2},tpot:{col:"tpot_gain_pct",first:"first_tpot_ms",rep:"repeated_tpot_ms",en:"TPOT",unit:"ms/token",higher:false,dec:2}};
function gainChart(key,list){
 const w=WSRC[key],n=list.length,L=62,R=14,T=14,B=58,gw=Math.max(78,Math.min(150,760/n)),W=L+R+gw*n,H=300,ih=H-T-B;
 const vals=list.flatMap(s=>MODES.map(m=>s[m][w.col])),lo=Math.min(0,...vals),hi=Math.max(0,...vals),bw=Math.min(30,(gw-18)/3);
 const raw=(hi-lo||1)/4,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(s=>s*mag>=raw)*mag;
 const bot=Math.floor(lo/step)*step,top=Math.ceil(hi/step)*step,y=v=>T+ih-(v-bot)/(top-bot)*ih;
 let g="";
 for(let v=bot;v<=top+step/2;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${Math.abs(v)<step/2?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">% vs own R1</text>`;
 list.forEach((s,i)=>{
  const x0=L+gw*i+(gw-bw*3-4)/2;
  MODES.forEach((m,k)=>{const v=s[m][w.col],x=x0+k*(bw+2),y0=y(0),y1=y(v);
   g+=`<rect x="${x}" y="${Math.min(y0,y1)}" width="${bw}" height="${Math.max(1,Math.abs(y1-y0))}" rx="2" fill="${COL[m]}"><title>${vEsc(modeName(m))} · Input ${s.input_tokens} · C${s.concurrency}: ${w.en} first ${num(s[m][w.first],w.dec)} → repeated ${num(s[m][w.rep],w.dec)} ${w.unit} (${v>0?"+":""}${v.toFixed(1)}%)</title></rect>`});
  g+=`<text x="${L+gw*i+gw/2}" y="${H-30}" text-anchor="middle" class="xl">${s.input_tokens}</text><text x="${L+gw*i+gw/2}" y="${H-14}" text-anchor="middle" class="xl2">C${s.concurrency}</text>`;
 });
 return `<div class="v2-chartwrap"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(W,360)}px" role="img" aria-label="${w.en} gain of repeated vs own first run">${g}</svg></div>`;
}
function renderEvidence(){
 const s=E.scope,keys=Object.keys(E.modes),f=(v,d)=>num(v,d),R={};keys.forEach(k=>{R[k]=reuseOf(k)});
 const cold=k=>E.modes[k].requests[0],drop=(c,r)=>(1-r/c)*100,up=(c,r)=>(r/c-1)*100;
 const tok=n=>n.toLocaleString("en-US");
 $v("evid").innerHTML=`<h3>Cold vs Reuse · same prompt, 3 modes<span class="zh-i">同一個 Prompt、三個模式：第一次（Cold）vs 重複（Reuse）</span></h3>
 <p class="v2-note">Input ${s.input_tokens} · C${s.concurrency} · Output ${s.output_tokens} · 每個模式 ${s.requests_per_mode.cold} Cold + ${s.requests_per_mode.reuse} Reuse 請求，Reuse 取平均 · <b>每個請求前後讀 /metrics，下面的命中是每個請求新增的差值</b>。${vEsc(s.note)}</p>
 <div class="v2-evcards v2-ev3">${keys.map(k=>{const m=E.modes[k],c=cold(k),r=R[k],hit=k==="baseline"?r.gpu:r.ext;return `<article class="v2-evcard" style="--mc:${COL[k]}"><h4>${vEsc(m.label)}<small>GPU ${m.gpu}</small></h4><p class="v2-evtype">${vEsc(m.cache_type)}</p><p class="v2-evbig"><b class="v2-big gain">${drop(c.ttft_ms,r.ttft).toFixed(1)}%</b><span>Reuse TTFT lower<small>${f(c.ttft_ms,2)} → ${f(r.ttft,2)} ms</small></span></p><p class="v2-evbig"><b class="v2-big gain">+${up(c.output_tps,r.tps).toFixed(1)}%</b><span>Output TPS higher<small>${f(c.output_tps,2)} → ${f(r.tps,2)} tok/s</small></span></p><p class="v2-evhit"><b class="v2-hit">${tok(hit)}</b> tokens hit per Reuse request<small>${k==="baseline"?"GPU prefix cache":"external KV cache"} · of ${tok(s.input_tokens)}</small></p></article>`}).join("")}</div>
 <h3 class="v2-sub3">Reuse vs Baseline<span class="zh-i">Reuse 的速度跟 Baseline 比</span></h3>
 <p class="v2-note">兩種參考：<b>Baseline Reuse</b>＝Baseline 用 GPU Prefix Cache 的重複請求（它有快取，比較嚴格）；<b>Baseline Cold</b>＝Baseline 沒有快取、整段重算（看快取有沒有贏過重算）。</p>
 <div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Metric</th>${["aidaptiv","lmcache"].map(k=>`<th>${vEsc(E.modes[k].label)} Reuse</th><th>vs Baseline Reuse</th><th>vs Baseline Cold</th>`).join("")}</tr></thead><tbody>
 <tr><td>TTFT (ms) ↓</td>${["aidaptiv","lmcache"].map(k=>`<td><b>${f(R[k].ttft,2)}</b></td><td>${pct(drop(R.baseline.ttft,R[k].ttft))}</td><td>${pct(drop(cold("baseline").ttft_ms,R[k].ttft))}</td>`).join("")}</tr>
 <tr><td>Output TPS ↑</td>${["aidaptiv","lmcache"].map(k=>`<td><b>${f(R[k].tps,2)}</b></td><td>${pct(up(R.baseline.tps,R[k].tps))}</td><td>${pct(up(cold("baseline").output_tps,R[k].tps))}</td>`).join("")}</tr>
 <tr><td>TPOT (ms) ↓</td>${["aidaptiv","lmcache"].map(k=>`<td><b>${f(R[k].tpot,2)}</b></td><td>${pct(drop(R.baseline.tpot,R[k].tpot))}</td><td>${pct(drop(cold("baseline").tpot_ms,R[k].tpot))}</td>`).join("")}</tr>
 <tr class="v2-ref"><td>Baseline reference</td><td colspan="6">Reuse TTFT ${f(R.baseline.ttft,2)} ms · TPS ${f(R.baseline.tps,2)} · TPOT ${f(R.baseline.tpot,2)} ｜ Cold TTFT ${f(cold("baseline").ttft_ms,2)} ms · TPS ${f(cold("baseline").output_tps,2)} · TPOT ${f(cold("baseline").tpot_ms,2)}</td></tr></tbody></table></div>
 <p class="v2-take v2-take-mid"><b>讀法：</b>外部 KV 快取確實命中並讓 TTFT 比自己的第一次降低約 ${drop(cold("aidaptiv").ttft_ms,R.aidaptiv.ttft).toFixed(0)}–${drop(cold("lmcache").ttft_ms,R.lmcache.ttft).toFixed(0)}%，TTFT 也比 Baseline 重算（Cold）低；但 Baseline 的 GPU Prefix Cache 更快，所以跟 Baseline 的重複請求比，TTFT 與 TPS 仍然比較差，aiDAPTIV 的 TPOT 也較慢。</p>
 <h3 class="v2-sub3">Hit tokens per request<span class="zh-i">逐請求命中 Token</span></h3>
 <div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Mode</th><th>Phase</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS<small>tok/s</small></th><th>Output tokens</th><th>GPU prefix hit Δ</th><th>External hit Δ</th></tr></thead><tbody>${keys.flatMap(k=>E.modes[k].requests.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[k]}"></i>${vEsc(E.modes[k].label)}</td><td>${r.phase.replace("_"," ")}</td><td>${f(r.ttft_ms,2)}</td><td>${f(r.tpot_ms,2)}</td><td>${f(r.output_tps,2)}</td><td>${r.output_tokens}</td><td>${r.gpu_hit_delta?`<b class="v2-hit">${tok(r.gpu_hit_delta)}</b>`:"0"}</td><td>${r.external_hit_delta?`<b class="v2-hit">${tok(r.external_hit_delta)}</b>`:"0"}</td></tr>`)).join("")}</tbody></table></div>
 <ul class="v2-caveats">${E.caveats.map(c=>`<li>${vEsc(c)}</li>`).join("")}</ul>`;
}
function renderBVs(){
 const m=WSRC[S.bMetric],key={tps:"tps",ttft:"ttft_ms",tpot:"tpot_ms"}[S.bMetric];
 const at=(phase,mode,i,c)=>F.phase_comparison.find(r=>r.phase===PHASE[phase]&&r.mode===mode&&r.input_tokens===i&&r.concurrency===c)[key];
 const g=(v,b)=>m.higher?(v/b-1)*100:(1-v/b)*100;
 const sc=[...new Set(F.phase_comparison.map(r=>skey(r)))].map(k=>k.split("/").map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const rows=sc.map(([i,c])=>{const b1=at("first","baseline",i,c),b2=at("repeated","baseline",i,c),o={i,c,b1,b2};["aidaptiv","lmcache"].forEach(x=>{const v=at("repeated",x,i,c);o[x]={v,same:g(v,b2),cross:g(v,b1)}});return o});
 const avg=(x,f)=>rows.reduce((a,r)=>a+r[x][f],0)/rows.length;
 $v("bNote").innerHTML=`每格是 R2/R3 平均（${m.en}，${m.unit}）。<b>同階段</b>＝跟 Baseline 自己的 R2/R3 比（公平：兩邊都有重複請求）；<b>跟 Baseline R1</b>＝跟 Baseline 的第一次比，只是參考，因為 Baseline 自己重複後也變快，這個比較對 Baseline 不公平。`;
 seg($v("bMetric"),Object.entries(WSRC).map(([v,x])=>[v,x.en]),S.bMetric);
 $v("bSum").innerHTML=["aidaptiv","lmcache"].map(x=>`<div class="v2-bs" style="--mc:${COL[x]}"><h4>${vEsc(modeName(x))}</h4><p><span>R2/R3 vs Baseline R2/R3<small>同階段 · 公平比較</small></span>${pct2(avg(x,"same"))}</p><p class="v2-cross"><span>R2/R3 vs Baseline R1<small>參考 · 對 Baseline 不公平</small></span>${pct2(avg(x,"cross"))}</p></div>`).join("");
 $v("tBVs").innerHTML=`<thead><tr><th>Input</th><th>C</th><th class="b">Baseline R1<small>${m.unit}</small></th><th class="b">Baseline R2/R3<small>${m.unit}</small></th><th class="a">aiDAPTIV R2/R3<small>${m.unit}</small></th><th>vs Base R2/R3</th><th>vs Base R1</th><th class="l">LMCache R2/R3<small>${m.unit}</small></th><th>vs Base R2/R3</th><th>vs Base R1</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.i}</td><td>C${r.c}</td><td>${num(r.b1,m.dec)}</td><td>${num(r.b2,m.dec)}</td><td>${num(r.aidaptiv.v,m.dec)}</td><td>${pct(r.aidaptiv.same)}</td><td class="v2-cross">${pct(r.aidaptiv.cross)}</td><td>${num(r.lmcache.v,m.dec)}</td><td>${pct(r.lmcache.same)}</td><td class="v2-cross">${pct(r.lmcache.cross)}</td></tr>`).join("")}</tbody>`;
}
function renderReuse(){
 $v("wNote").innerHTML=`每個模式拿自己的 R2/R3 平均去比自己的 R1，所以 <b>Baseline 也會變快</b>：這個加速不能歸因於 SSD。<br>Repeated vs its own first run, per mode. Baseline accelerates too — the speed-up cannot be attributed to SSD. ${vEsc(F.caveat)}`;
 const faster=F.within_mode.filter(r=>r.ttft_gain_pct>0).length,hw0=F.headline.filter(h=>h.phase==="repeat_vs_own_first");
 const ex=F.within_mode.filter(r=>r.input_tokens===7950&&r.concurrency===5);
 $v("wExample").innerHTML=`<p class="v2-take"><b>Reuse 沒有變慢：</b>${faster} / ${F.within_mode.length} 個「模式 × 情境」的 TTFT，R2/R3 都比自己的 R1 快。aiDAPTIV 的 TPS 重複後 ${hw0.find(h=>h.mode==="aidaptiv").tps_vs_baseline_pct>0?"+":""}${hw0.find(h=>h.mode==="aidaptiv").tps_vs_baseline_pct.toFixed(2)}%，比 Baseline 自己的 ${hw0.find(h=>h.mode==="baseline").tps_vs_baseline_pct.toFixed(2)}% 更大，但絕對 TPS 仍低於 Baseline，兩個結論不矛盾。</p>${ex.length?`<div class="table-wrap"><table class="v2-table v2-sc"><caption>範例 Example · Input 7950 · C5</caption><thead><tr><th>Mode</th><th>TTFT R1<small>ms</small></th><th>TTFT R2/R3<small>ms</small></th><th>TTFT</th><th>TPS R1<small>tok/s</small></th><th>TPS R2/R3<small>tok/s</small></th><th>TPS</th></tr></thead><tbody>${MODES.map(m=>{const r=ex.find(x=>x.mode===m);return r?`<tr><td><i class="v2-dot" style="background:${COL[m]}"></i>${vEsc(modeName(m))}</td><td>${num(r.first_ttft_ms,2)}</td><td>${num(r.repeated_ttft_ms,2)}</td><td>${pct(r.ttft_gain_pct)}</td><td>${num(r.first_tps,2)}</td><td>${num(r.repeated_tps,2)}</td><td>${pct(r.tps_gain_pct)}</td></tr>`:""}).join("")}</tbody></table></div>`:""}`;
 const hw=F.headline.filter(h=>h.phase==="repeat_vs_own_first");
 $v("wCards").innerHTML=MODES.map(m=>{const h=hw.find(x=>x.mode===m);return `<article class="v2-wcard" style="--mc:${COL[m]}"><h3>${vEsc(modeName(m))}<small> GPU ${GPU[m]}</small></h3><ul>${[["TPS gain","tps","tps_gain_pct"],["TTFT improvement","ttft","ttft_gain_pct"],["TPOT improvement","tpot","tpot_gain_pct"]].map(([t,k,c])=>`<li><span>${t}<small>${F.within_mode.filter(r=>r.mode===m&&r[c]>0).length} / 8 scenarios improved</small></span>${pct2(h[k+"_vs_baseline_pct"])}</li>`).join("")}</ul></article>`}).join("");
 const list=[...new Set(F.within_mode.map(r=>skey(r)))].map(k=>{
  const rows=F.within_mode.filter(r=>skey(r)===k),o={input_tokens:rows[0].input_tokens,concurrency:rows[0].concurrency};
  rows.forEach(r=>{o[r.mode]=r});return o;
 }).sort((a,b)=>a.input_tokens-b.input_tokens||a.concurrency-b.concurrency);
 $v("wCharts").innerHTML=Object.entries(WSRC).map(([k,w])=>`<article class="v2-chart"><h3>${w.en} · R2/R3 vs own R1<small>% change · ${w.higher?"higher":"lower"} ${w.en} is ${w.higher?"better ↑ (TPS gain)":"better ↓ (shown as improvement: positive = faster)"}</small></h3>${gainChart(k,list)}</article>`).join("");
 const w=WSRC[S.wMetric];
 seg($v("wMetric"),Object.entries(WSRC).map(([v,x])=>[v,x.en]),S.wMetric);
 $v("tWithin").innerHTML=`<thead><tr><th>Input</th><th>C</th><th>Mode</th><th>First R1<small>${w.unit}</small></th><th>Repeated R2/R3<small>${w.unit}</small></th><th>Change</th></tr></thead><tbody>${F.within_mode.map(r=>`<tr><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(modeName(r.mode))}</td><td>${num(r[w.first],w.dec)}</td><td>${num(r[w.rep],w.dec)}</td><td>${pct(r[w.col])}</td></tr>`).join("")}</tbody>`;
}
function renderMethod(){
 const d=D.metricDefinitions;
 $v("v2MethodBody").innerHTML=`<h4>Conclusion<span class="zh-i">結論</span></h4><ul><li>本輪<b>未達成</b> aiDAPTIV、LMCache 優於 Baseline 的效能預期；不論 R1 或 R2/R3，兩者跟同階段 Baseline 比的 8 情境平均都是負的。</li><li>R2/R3 比自己的 R1 快（TTFT 約快 73–78%），但 Baseline 也一樣快，不能當成 SSD 快取命中的證據。</li><li>LMCache 整體比 aiDAPTIV 更接近 Baseline；這是「整體服務組態」的觀察，不能直接當成 SSD KV Offload 本身的因果。</li></ul>
 <h4>Metric definitions<span class="zh-i">指標定義</span></h4><ul>${["output_tps","ttft_median_ms","tpot_median_ms","normalized_tps_per_c_reported","improvement_percent","headline_aggregation","rounding_caveat"].map(k=>`<li><code>${k}</code> ${vEsc(d[k])}</li>`).join("")}</ul>
 <h4>Limitations<span class="zh-i">限制</span></h4><ul>${D.limitations.map(x=>`<li>${vEsc(x)}</li>`).join("")}<li>三個模式使用不同實體 GPU（Baseline GPU 7、aiDAPTIV GPU 6、LMCache GPU 4）與不同 vLLM／容器版本。</li><li>Baseline 的 vLLM 原生 Prefix Cache 沒有完全控制；Random Prompt 與固定 seed 可能受益。</li><li>三組測試同時在同一台 Server 執行，可能共用 CPU／RAM／NVMe。</li><li>數值取自終端機顯示的 2 位小數，不代表伺服器原始高精度值。</li><li>R1 不保證是真正的冷快取；沒有逐請求的 SSD 讀取／命中遙測；比較時 R1 對 R1、R2/R3 對 R2/R3，另外才看各模式自己的 R2/R3 對 R1。</li><li>下一輪若要宣稱 SSD 快取重用：先查測試期間的廠商 log 與 metrics（store／retrieve／hit／miss），確認有效設定（含 <code>--disable-gpu-reuse</code>）與 GPU 對應，並控制 GPU prefix cache 或 eviction，記錄相同 prompt 前後的外部命中數。</li></ul>
 <h4>QA exclusions<span class="zh-i">排除紀錄（不納入任何圖表、表格或排名）</span></h4><p class="v2-note">Input 15950 / C5 整組排除：Baseline、LMCache 各 3 筆異常，aiDAPTIV 3 筆雖有效，為確保對照一致一併排除。</p><div class="table-wrap"><table class="v2-table"><thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Run</th><th>Status</th><th>Reason</th></tr></thead><tbody>${D.excluded.map(r=>`<tr><td>${vEsc(modeName(r.mode))}</td><td>${r.gpu}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>R${r.repetition}</td><td>${vEsc(r.status)}</td><td>${vEsc(r.reason)}</td></tr>`).join("")}</tbody></table></div>
 <h4>Downloads<span class="zh-i">原始資料</span></h4><ul class="v2-links">${[["AISO_BenchmarkV2_SharedPrompt_Reuse_Probe.json","Shared-prompt reuse probe JSON"],["AISO_BenchmarkV2_First_vs_Repeated.json","First vs Repeated JSON"],["AISO_FvR_phase_comparison_48.csv","Phase comparison (48)"],["AISO_FvR_first_run_R1_24.csv","First run R1 (24)"],["AISO_FvR_repeated_run_R2_R3_24.csv","Repeated R2/R3 (24)"],["AISO_FvR_repeated_vs_own_first_24.csv","Repeated vs own first (24)"],["AISO_FvR_phase_headlines.csv","Phase headlines"],["AISO_Benchmark_Valid72.csv","72 raw runs"],["AISO_BenchmarkV2_20000.json","Earlier blended JSON"],["AISO_Scenario_Comparison_8.csv","Earlier blended 8 scenarios"],["AISO_Excluded9.csv","9 exclusions"]].map(([f,t])=>`<li><a href="data/benchmark-v2/${f}" download>${t}</a></li>`).join("")}</ul>`;
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
function renderAll(){renderCharts();renderTable();renderRaw()}

function bind(){
 const on=(id,key,after)=>$v(id).addEventListener("change",e=>{S[key]=e.target.value;after()});
 on("fInput","input",renderAll);on("fC","c",renderAll);on("tSort","sort",renderTable);
 on("rMode","rMode",renderRaw);on("rC","rC",renderRaw);on("rInput","rInput",renderRaw);on("rRun","rRun",renderRaw);
 $v("tDir").addEventListener("click",()=>{S.dir*=-1;renderTable()});
 $v("tMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.metric=b.dataset.v;renderTable()}});
 $v("bMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.bMetric=b.dataset.v;renderBVs()}});
 $v("wMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.wMetric=b.dataset.v;renderReuse()}});
 $v("phaseSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.phase=b.dataset.v;renderPhase()}});
}
const getJson=u=>fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(u);return r.json()});
Promise.all([getJson("data/benchmark-v2/AISO_BenchmarkV2_20000.json"),getJson("data/benchmark-v2/AISO_BenchmarkV2_First_vs_Repeated.json"),getJson("data/benchmark-v2/AISO_BenchmarkV2_SharedPrompt_Reuse_Probe.json")]).then(([d,f,e])=>{
 D=d;F=f;E=e;
 // Input 15950 / C5 must never reach a chart, table or ranking, even if a future data file contains it.
 const keep=r=>!excluded(+r.input_tokens,+r.concurrency);
 ["batchDetail72","scenarioComparison","scenarioMetricsLong","repetitionComparison"].forEach(k=>{D[k]=D[k].filter(keep)});
 ["phase_comparison","within_mode","raw_runs"].forEach(k=>{F[k]=F[k].filter(keep)});
 D.modes.forEach(m=>{LABEL[m.key]=m.label;GPU[m.key]=m.gpu});
 renderTop();renderFilters();renderMethod();renderSsd();renderEvidence();renderBVs();renderReuse();renderPhase();renderRaw();bind();
}).catch(()=>{$v("v2Count").textContent="載入失敗：data/benchmark-v2/*.json"});
