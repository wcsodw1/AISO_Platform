"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"];
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 output_tps:{short:"TPS",en:"Output TPS",zh:"每秒輸出 token",unit:"tokens/s",higher:true,dec:2,formula:"Improvement = (Mode ÷ Baseline − 1) × 100%"},
 ttft_median_ms:{short:"TTFT",en:"TTFT",zh:"首字延遲",unit:"ms",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"},
 tpot_median_ms:{short:"TPOT",en:"TPOT",zh:"每個輸出 token 的時間",unit:"ms/token",higher:false,dec:2,formula:"Improvement = (1 − Mode ÷ Baseline) × 100%"}};
const S={phase:"reuse",basis:"baseline",input:"all",c:"all",metric:"output_tps",sort:"order",dir:1,rMode:"all",rC:"all",rInput:"all",rRun:"all",wMetric:"ttft",bMetric:"ttft"};
const PHASE={first:"first_observed_r1",reuse:"repeated_observed_r2_r3"};
const PHASE_NAME={first:"First Run (R1)",reuse:"Reuse (R2/R3)"};
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
 $v("v2Chips").innerHTML=[`Model ${md.model}`,`MAX_MODEL_LEN ${md.max_model_len}`,`Input ${[...new Set(D.scenarioComparison.map(s=>s.input_tokens))].join(" / ")}`,`Output ${md.output_target_tokens}`,`C ${cs.join(" / ")}`,`${md.repetitions} runs`].map(t=>`<li>${vEsc(t)}</li>`).join("");
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
  return `<article class="v2-card" style="--mc:${COL[m]}"><header><h3>${vEsc(info.label)}</h3><span>GPU ${info.gpu} · :${info.port}</span></header><p class="v2-rank">Rank #${rank.indexOf(m)+1}<small>${PHASE_NAME[S.phase]} vs Baseline · 8 情境平均</small></p><ul>${rows}</ul></article>`;
 }).join("");
}
function renderPhase(){
 seg2($v("phaseSeg"),S.phase);seg2($v("basisSeg"),S.basis);
 const own=S.phase==="reuse"&&S.basis==="own";
 $v("basisSeg").hidden=S.phase!=="reuse";
 ["secFilter","v2Charts","secTable"].forEach(id=>{$v(id).hidden=own});
 $v("v2Cards").hidden=own;$v("v2Reuse").hidden=!own;$v("evidBaseSec").hidden=!(S.phase==="reuse"&&!own);
 if(own)return;
 D.scenarioComparison=phaseScenarios(S.phase);
 renderCards();renderCharts();renderTable();
}
function seg2(el,cur){el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===cur))}
function reuseOf(k){const r=E.modes[k].requests.slice(1),mean=f=>r.reduce((a,x)=>a+x[f],0)/r.length;return {ttft:mean("ttft_ms"),tpot:mean("tpot_ms"),tps:mean("output_tps"),ext:r[0].external_hit_delta,gpu:r[0].gpu_hit_delta,n:r.length}}
function renderSsd(){
 const c=E.aidaptiv_config,t=k=>reuseOf(k).ext.toLocaleString("en-US");
 const items=[
  [true,`外部 KV 命中／Reuse 請求：aiDAPTIV ${t("aidaptiv")} · LMCache ${t("lmcache")} tokens（Prompt ${E.scope.input_tokens.toLocaleString("en-US")}），GPU 命中 0`],
  [true,`aiDAPTIV：DRAM offload ${c.dram_kv_offload_gb} GB · SSD ${c.ssd_kv_offload_gb} GB`],
  [true,`Baseline：GPU Prefix Cache 命中 ${reuseOf("baseline").gpu.toLocaleString("en-US")} tokens`],
  [false,"SSD 硬體實際讀寫量：未量測"]
 ];
 $v("v2SsdList").innerHTML=items.map(([ok,x])=>`<li class="${ok?"yes":"no"}"><i>${ok?"✓":"?"}</i><span>${vEsc(x)}</span></li>`).join("");
}
function niceTop(max){const raw=max/4,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(s=>s*mag>=raw)*mag;return {step,top:step*4}}
function barChart(key,list){
 const def=METRICS[key],n=list.length;
 if(!n)return `<p class="v2-empty">${S.input==="15950"&&S.c==="5"?"Input 15950 / C5 已排除":"無資料"}</p>`;
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
 $v("v2Count").textContent=`${list.length} / ${D.scenarioComparison.length}`;
 $v("v2Legend").innerHTML=MODES.map(m=>`<span><i style="background:${COL[m]}"></i>${vEsc(modeName(m))}<small>GPU ${GPU[m]}</small></span>`).join("");
 $v("v2ChartList").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.en}<small>${d.unit} · ${d.higher?"↑ higher is better":"↓ lower is better"}</small></h3>${barChart(k,list)}</article>`).join("");
}
function renderTable(){
 const def=METRICS[S.metric],k=S.metric;
 seg($v("tMetric"),Object.entries(METRICS).map(([v,d])=>[v,d.short]),S.metric);
 let list=[...scenarios()];
 if(S.sort!=="order")list.sort((a,b)=>(a[`${S.sort}_${k}_improvement_pct`]-b[`${S.sort}_${k}_improvement_pct`])*S.dir);
 else list.sort((a,b)=>(a.input_tokens-b.input_tokens||a.concurrency-b.concurrency)*S.dir);
 $v("tDir").textContent=S.dir>0?"↑ ASC":"↓ DESC";
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
 const cold=k=>E.modes[k].requests[0],drop=(c,r)=>(1-r/c)*100,up=(c,r)=>(r/c-1)*100,tok=n=>n.toLocaleString("en-US");
 const head=t=>`<h3>${t}<span class="zh-i">Input ${s.input_tokens} · C${s.concurrency} · 1 Cold + ${s.requests_per_mode.reuse} Reuse</span></h3>`;
 $v("evid").innerHTML=head("Cold → Reuse")+`<div class="v2-evcards v2-ev3">${keys.map(k=>{const m=E.modes[k],c=cold(k),r=R[k],hit=k==="baseline"?r.gpu:r.ext;return `<article class="v2-evcard" style="--mc:${COL[k]}"><h4>${vEsc(m.label)}<small>GPU ${m.gpu}</small></h4><p class="v2-evbig"><b class="v2-big gain">${drop(c.ttft_ms,r.ttft).toFixed(1)}%</b><span>TTFT ↓<small>${f(c.ttft_ms,2)} → ${f(r.ttft,2)} ms</small></span></p><p class="v2-evbig"><b class="v2-big gain">+${up(c.output_tps,r.tps).toFixed(1)}%</b><span>TPS ↑<small>${f(c.output_tps,2)} → ${f(r.tps,2)}</small></span></p><p class="v2-evhit"><b class="v2-hit">${tok(hit)}</b> hit tokens / Reuse<small>${k==="baseline"?"GPU prefix cache":"external KV cache"}</small></p></article>`}).join("")}</div>`;
 const two=["aidaptiv","lmcache"];
 $v("evidBase").innerHTML=head("Reuse vs Baseline")+`<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Metric</th>${two.map(k=>`<th>${vEsc(E.modes[k].label)}</th><th>vs Baseline Reuse</th><th>vs Baseline Cold</th>`).join("")}</tr></thead><tbody>
 <tr><td>TTFT (ms) ↓</td>${two.map(k=>`<td><b>${f(R[k].ttft,2)}</b></td><td>${pct(drop(R.baseline.ttft,R[k].ttft))}</td><td>${pct(drop(cold("baseline").ttft_ms,R[k].ttft))}</td>`).join("")}</tr>
 <tr><td>TPS ↑</td>${two.map(k=>`<td><b>${f(R[k].tps,2)}</b></td><td>${pct(up(R.baseline.tps,R[k].tps))}</td><td>${pct(up(cold("baseline").output_tps,R[k].tps))}</td>`).join("")}</tr>
 <tr><td>TPOT (ms) ↓</td>${two.map(k=>`<td><b>${f(R[k].tpot,2)}</b></td><td>${pct(drop(R.baseline.tpot,R[k].tpot))}</td><td>${pct(drop(cold("baseline").tpot_ms,R[k].tpot))}</td>`).join("")}</tr>
 <tr class="v2-ref"><td>Baseline</td><td colspan="6">Reuse：TTFT ${f(R.baseline.ttft,2)} · TPS ${f(R.baseline.tps,2)} · TPOT ${f(R.baseline.tpot,2)} ｜ Cold：TTFT ${f(cold("baseline").ttft_ms,2)} · TPS ${f(cold("baseline").output_tps,2)} · TPOT ${f(cold("baseline").tpot_ms,2)}</td></tr></tbody></table></div>
 <h3 class="v2-sub3">Hit tokens per request<span class="zh-i">逐請求命中</span></h3>
 <p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Mode</th><th>Phase</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS</th><th>Out</th><th>GPU hit Δ</th><th>External hit Δ</th></tr></thead><tbody>${keys.flatMap(k=>E.modes[k].requests.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[k]}"></i>${vEsc(E.modes[k].label)}</td><td>${r.phase.replace("_"," ")}</td><td>${f(r.ttft_ms,2)}</td><td>${f(r.tpot_ms,2)}</td><td>${f(r.output_tps,2)}</td><td>${r.output_tokens}</td><td>${r.gpu_hit_delta?`<b class="v2-hit">${tok(r.gpu_hit_delta)}</b>`:"0"}</td><td>${r.external_hit_delta?`<b class="v2-hit">${tok(r.external_hit_delta)}</b>`:"0"}</td></tr>`)).join("")}</tbody></table></div>`;
}
function renderReuse(){
 const hw=F.headline.filter(h=>h.phase==="repeat_vs_own_first");
 $v("wCards").innerHTML=MODES.map(m=>{const h=hw.find(x=>x.mode===m);return `<article class="v2-wcard" style="--mc:${COL[m]}"><h3>${vEsc(modeName(m))}<small> GPU ${GPU[m]}</small></h3><ul>${[["TPS gain","tps","tps_gain_pct"],["TTFT improvement","ttft","ttft_gain_pct"],["TPOT improvement","tpot","tpot_gain_pct"]].map(([t,k,c])=>`<li><span>${t}<small>${F.within_mode.filter(r=>r.mode===m&&r[c]>0).length} / 8 scenarios improved</small></span>${pct2(h[k+"_vs_baseline_pct"])}</li>`).join("")}</ul></article>`}).join("");
 const list=[...new Set(F.within_mode.map(r=>skey(r)))].map(k=>{
  const rows=F.within_mode.filter(r=>skey(r)===k),o={input_tokens:rows[0].input_tokens,concurrency:rows[0].concurrency};
  rows.forEach(r=>{o[r.mode]=r});return o;
 }).sort((a,b)=>a.input_tokens-b.input_tokens||a.concurrency-b.concurrency);
 $v("wCharts").innerHTML=Object.entries(WSRC).map(([k,w])=>`<article class="v2-chart"><h3>${w.en}<small>R2/R3 vs own R1 · % ${w.higher?"↑":"↓ (positive = faster)"}</small></h3>${gainChart(k,list)}</article>`).join("");
 const w=WSRC[S.wMetric];
 seg($v("wMetric"),Object.entries(WSRC).map(([v,x])=>[v,x.en]),S.wMetric);
 $v("tWithin").innerHTML=`<thead><tr><th>Input</th><th>C</th><th>Mode</th><th>First R1<small>${w.unit}</small></th><th>Repeated R2/R3<small>${w.unit}</small></th><th>Change</th></tr></thead><tbody>${F.within_mode.map(r=>`<tr><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(modeName(r.mode))}</td><td>${num(r[w.first],w.dec)}</td><td>${num(r[w.rep],w.dec)}</td><td>${pct(r[w.col])}</td></tr>`).join("")}</tbody>`;
}
function renderMethod(){
 $v("v2MethodBody").innerHTML=`<h4>Notes<span class="zh-i">說明</span></h4><ul><li>Improvement：TPS ＝ (Mode ÷ Baseline − 1)；TTFT、TPOT ＝ (1 − Mode ÷ Baseline)。負值＝比 Baseline 差。</li><li>8 情境等權平均；每格 R1 為單次，Reuse 為 R2/R3 平均。</li><li>Input 15950 / C5 整組排除（9 筆：Baseline、LMCache 異常，aiDAPTIV 為對照一致一併排除），不在任何圖表、表格或排名。</li><li>三模式為不同 GPU（7 / 6 / 4）、不同 vLLM 版本、同時在同一台 Server 執行；Baseline 開 GPU Prefix Cache；數值為終端機 2 位小數。</li><li>R1 不保證是冷快取；72 筆正式 Benchmark 沒有逐批命中資料。</li></ul>
 <h4>Excluded<span class="zh-i">排除紀錄</span></h4><div class="table-wrap"><table class="v2-table"><thead><tr><th>Mode</th><th>Input</th><th>C</th><th>Run</th><th>Status</th></tr></thead><tbody>${D.excluded.map(r=>`<tr><td>${vEsc(modeName(r.mode))}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>R${r.repetition}</td><td>${vEsc(r.status)}</td></tr>`).join("")}</tbody></table></div>
 <h4>Downloads<span class="zh-i">原始資料</span></h4><ul class="v2-links">${[["AISO_BenchmarkV2_SharedPrompt_Reuse_Probe.json","Shared-prompt probe"],["AISO_BenchmarkV2_First_vs_Repeated.json","First vs Repeated"],["AISO_FvR_phase_comparison_48.csv","Phase comparison"],["AISO_FvR_repeated_vs_own_first_24.csv","Reuse vs own first"],["AISO_Benchmark_Valid72.csv","72 raw runs"],["AISO_BenchmarkV2_20000.json","Full JSON"],["AISO_Excluded9.csv","Exclusions"]].map(([f,t])=>`<li><a href="data/benchmark-v2/${f}" download>${t}</a></li>`).join("")}</ul>`;
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
 $v("wMetric").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.wMetric=b.dataset.v;renderReuse()}});
 $v("phaseSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.phase=b.dataset.v;renderPhase()}});
 $v("basisSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.basis=b.dataset.v;renderPhase()}});
}
const getJson=u=>fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(u);return r.json()});
Promise.all([getJson("data/benchmark-v2/AISO_BenchmarkV2_20000.json"),getJson("data/benchmark-v2/AISO_BenchmarkV2_First_vs_Repeated.json"),getJson("data/benchmark-v2/AISO_BenchmarkV2_SharedPrompt_Reuse_Probe.json")]).then(([d,f,e])=>{
 D=d;F=f;E=e;
 // Input 15950 / C5 must never reach a chart, table or ranking, even if a future data file contains it.
 const keep=r=>!excluded(+r.input_tokens,+r.concurrency);
 ["batchDetail72","scenarioComparison","scenarioMetricsLong","repetitionComparison"].forEach(k=>{D[k]=D[k].filter(keep)});
 ["phase_comparison","within_mode","raw_runs"].forEach(k=>{F[k]=F[k].filter(keep)});
 D.modes.forEach(m=>{LABEL[m.key]=m.label;GPU[m.key]=m.gpu});
 renderTop();renderFilters();renderMethod();renderSsd();renderEvidence();renderReuse();renderPhase();renderRaw();bind();
}).catch(()=>{$v("v2Count").textContent="載入失敗：data/benchmark-v2/*.json"});
