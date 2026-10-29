"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"],CAND=["aidaptiv","lmcache"];
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 ttft_ms:{short:"TTFT",unit:"ms",higher:false,dec:2},
 output_tps:{short:"TPS",unit:"tok/s",higher:true,dec:2},
 tpot_ms:{short:"TPOT",unit:"ms/token",higher:false,dec:2}};
const PHASES={mean:"Reuse mean",Reuse_1:"Reuse #1",Reuse_2:"Reuse #2",Reuse_3:"Reuse #3"};
const S={view:"reuse",basis:"baseline",rphase:"mean",input:"all",c:"all",metric:"ttft_ms",sort:"order",dir:1,rMode:"all",rInput:"all",rC:"all",rPhase:"all"};
let V,SC;

const num=(v,d)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const tok=n=>n.toLocaleString("en-US");
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const gain=(v,b,hi)=>hi?(v/b-1)*100:(1-v/b)*100;
function pct(v){
 if(!Number.isFinite(v))return `<span class="v2-na">—</span>`;
 if(Math.abs(v)<0.05)return `<span class="v2-d flat">0.0%</span>`;
 return `<span class="v2-d ${v>0?"gain":"loss"}">${v>0?"▲ +":"▼ −"}${Math.abs(v).toFixed(1)}%</span>`;
}
const pct2=v=>`<b class="v2-big ${v>0?"gain":v<0?"loss":"flat"}">${v>0?"+":v<0?"−":""}${Math.abs(v).toFixed(1)}%</b>`;
function opts(el,items,cur){el.innerHTML=items.map(([v,t])=>`<option value="${vEsc(v)}"${String(v)===String(cur)?" selected":""}>${vEsc(t)}</option>`).join("")}
function seg(el,items,cur){el.innerHTML=items.map(([v,t])=>`<button type="button" data-v="${v}" aria-pressed="${v===cur}">${t}</button>`).join("")}
const label=m=>V.modes[m].label,gpu=m=>V.modes[m].gpu;
// Baseline's first request after restart includes warm-up, so Cold comparisons skip this scenario in averages.
const warm=(i,c)=>i===3950&&c===1;

const batch=(m,i,c,ph)=>V.batches.find(r=>r.mode===m&&r.input_tokens===i&&r.concurrency===c&&r.phase===ph);
function phaseValue(m,i,c,k,ph){
 if(ph==="Cold"||ph.startsWith("Reuse_"))return batch(m,i,c,ph)[k];
 const s=V.reuse_summary.find(x=>x.input_tokens===i&&x.concurrency===c&&x.metric===k);
 return s?s[m]:mean(["Reuse_1","Reuse_2","Reuse_3"].map(p=>batch(m,i,c,p)[k]));
}
const curPhase=()=>S.view==="first"?"Cold":S.rphase;
const ownView=()=>S.view==="reuse"&&S.basis==="own";
// One scenario cell for the current view: value, reference value, gain, and whether it is the warm-up outlier.
function cell(i,c,m,k){
 const hi=METRICS[k].higher,ph=curPhase(),v=phaseValue(m,i,c,k,ph);
 if(ownView()){const cold=batch(m,i,c,"Cold")[k];return {v,ref:cold,g:gain(v,cold,hi),skip:warm(i,c)}}
 const b=phaseValue("baseline",i,c,k,ph);
 // For the Reuse mean, use the gain printed from the full-precision results rather than re-deriving it from rounded means.
 const s=ph==="mean"&&m!=="baseline"&&V.reuse_summary.find(x=>x.input_tokens===i&&x.concurrency===c&&x.metric===k);
 return {v,ref:b,g:m==="baseline"?0:s?s[`${m}_gain_pct`]:gain(v,b,hi),skip:ph==="Cold"&&warm(i,c)};
}
const scenarios=()=>SC.filter(([i,c])=>(S.input==="all"||i===+S.input)&&(S.c==="all"||c===+S.c));
function average(m,k,list){const xs=list.map(([i,c])=>cell(i,c,m,k)).filter(x=>!x.skip);return {avg:xs.length?mean(xs.map(x=>x.g)):NaN,wins:xs.filter(x=>x.g>0).length,n:xs.length}}
function withView(view,fn){const keep={view:S.view,basis:S.basis,rphase:S.rphase};Object.assign(S,view);try{return fn()}finally{Object.assign(S,keep)}}

function renderTop(){
 const s=V.scope;
 $v("v2Chips").innerHTML=[`Model ${s.model}`,`MAX_MODEL_LEN ${s.max_model_len}`,`Input ${s.input_tokens.join(" / ")}`,`Output ${s.output_tokens}`,`C ${s.concurrency.join(" / ")}`,`Cold + Reuse ×3`,`Run ${V.run_id}`].map(t=>`<li>${vEsc(t)}</li>`).join("");
 const reuse=withView({view:"reuse",basis:"baseline",rphase:"mean"},()=>Object.keys(METRICS).map(k=>CAND.map(m=>average(m,k,SC))));
 const cold=withView({view:"first",basis:"baseline"},()=>CAND.map(m=>average(m,"ttft_ms",SC)));
 const [t,p]=[reuse[0],reuse[1]];
 $v("v2Verdict").innerHTML=`<b>Reuse vs ${vEsc(label("baseline"))}<span class="zh-i">8 情境平均</span></b><p>TTFT：aiDAPTIV <em class="up">${t[0].avg.toFixed(1)}% faster</em> · LMCache <em class="up">${t[1].avg.toFixed(1)}% faster</em>（${t[0].wins}/8、${t[1].wins}/8）　TPS：+${p[0].avg.toFixed(1)}% · +${p[1].avg.toFixed(1)}%　First Run（Cold）TTFT：aiDAPTIV <em class="down">${Math.abs(cold[0].avg).toFixed(1)}% slower</em> · LMCache <em class="down">${Math.abs(cold[1].avg).toFixed(1)}% slower</em></p>`;
 const b=V.batches,base=b.filter(r=>r.mode==="baseline"),re=b.filter(r=>r.mode!=="baseline"&&r.phase!=="Cold");
 const checks=[["Batches",b.length,96],["Scenarios",SC.length,8],["Baseline hits = 0",base.filter(valid).length,base.length],["Reuse external hits > 0",re.filter(valid).length,re.length]];
 $v("v2Qa").innerHTML=checks.map(([n,a,x])=>`<li class="${a===x?"ok":"bad"}">${a===x?"✓":"✗"} ${n} <b>${a} / ${x}</b></li>`).join("");
}
function renderCards(){
 const list=scenarios(),own=ownView();
 $v("v2Cards").innerHTML=MODES.map(m=>{
  const info=V.modes[m];
  const rows=Object.entries(METRICS).map(([k,d])=>{
   if(!own&&m==="baseline")return `<li><span>${d.short}<small>${d.unit}</small></span><b class="v2-big flat">Reference</b></li>`;
   const a=average(m,k,list);
   return `<li><span>${d.short}<small>${d.higher?"↑ higher is better":"↓ lower is better"}</small></span>${Number.isFinite(a.avg)?pct2(a.avg):`<b class="v2-big flat">—</b>`}<small class="v2-win">${a.wins} / ${a.n} better</small></li>`;
  }).join("");
  return `<article class="v2-card" style="--mc:${COL[m]}"><header><h3>${vEsc(info.label)}</h3><span>GPU ${info.gpu} · :${info.port}</span></header><p class="v2-rank">${own?`${PHASES[S.rphase]} vs own Cold`:S.view==="first"?"Cold vs Baseline":`${PHASES[S.rphase]} vs Baseline`}<small>${vEsc(info.cache)}</small></p><ul>${rows}</ul></article>`;
 }).join("");
 const fine=["TTFT 是快取效果的主要指標；LMCache 為不同 runtime（GPU 記憶體 0.65 vs 0.85），TPS／TPOT 差距不全來自快取。"];
 if(S.view==="first"||own)fine.push("* Cold 平均不含 3950／C1（Baseline 第一個請求含暖機 790.9 ms）。");
 $v("v2Fine").textContent=fine.join(" ");
}
// A batch passes when its hit counters match the cache rule for its mode and phase.
function valid(r){
 if(r.mode==="baseline")return !r.gpu_hit_tokens&&!r.external_hit_tokens;
 return r.phase==="Cold"?!r.external_hit_tokens:(r.external_hit_tokens>0&&!r.gpu_hit_tokens);
}
function renderSsd(){
 const reuse=k=>V.batches.filter(r=>r.mode===k&&r.phase!=="Cold"),ok=k=>reuse(k).filter(valid).length;
 const items=[
  [true,`${label("baseline")}：每批 GPU 命中 0、外部命中 0（${V.batches.filter(r=>r.mode==="baseline").length} 批）`],
  [true,`Reuse 外部命中：aiDAPTIV ON ${ok("aidaptiv")}/${reuse("aidaptiv").length} 批、LMCache ${ok("lmcache")}/${reuse("lmcache").length} 批，GPU 命中 0；Cold 外部命中 0`],
  [true,"aiDAPTIV ON：DRAM offload 0 GB · SSD 250 GB"]
 ];
 $v("v2SsdList").innerHTML=items.map(([y,x])=>`<li class="${y?"yes":"no"}"><i>${y?"✓":"?"}</i><span>${vEsc(x)}</span></li>`).join("");
}

function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,list,mode){
 const d=METRICS[k],n=list.length;
 if(!n)return `<p class="v2-empty">${S.input==="15950"&&S.c==="5"?"Input 15950 / C5 已排除":"無資料"}</p>`;
 const L=62,R=14,T=14,B=58,gw=Math.max(78,Math.min(150,760/n)),W=L+R+gw*n,H=300,ih=H-T-B,bw=Math.min(30,(gw-18)/3);
 const val=(i,c,m)=>mode==="gain"?cell(i,c,m,k).g:cell(i,c,m,k).v;
 const vals=list.flatMap(([i,c])=>MODES.map(m=>val(i,c,m)));
 const lo=Math.min(0,...vals),hi=Math.max(0,...vals),step=niceStep(hi-lo),bot=Math.floor(lo/step)*step,top=Math.ceil(hi/step)*step,y=v=>T+ih-(v-bot)/(top-bot)*ih;
 let g="";
 for(let v=bot;v<=top+step/2;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${Math.abs(v)<step/2?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${mode==="gain"?"% vs own Cold":d.unit}</text>`;
 list.forEach(([i,c],n0)=>{
  const x0=L+gw*n0+(gw-bw*3-4)/2;
  MODES.forEach((m,j)=>{const v=val(i,c,m),x=x0+j*(bw+2),y0=y(0),y1=y(v);
   g+=`<rect x="${x}" y="${Math.min(y0,y1)}" width="${bw}" height="${Math.max(1,Math.abs(y1-y0))}" rx="2" fill="${COL[m]}"><title>${vEsc(label(m))} · ${i} · C${c}: ${mode==="gain"?`${v.toFixed(1)}%`:`${num(v,d.dec)} ${d.unit}`}</title></rect>`});
  g+=`<text x="${L+gw*n0+gw/2}" y="${H-30}" text-anchor="middle" class="xl">${i}${warm(i,c)&&(S.view==="first"||ownView())?"*":""}</text><text x="${L+gw*n0+gw/2}" y="${H-14}" text-anchor="middle" class="xl2">C${c}</text>`;
 });
 return `<div class="v2-chartwrap"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(W,360)}px" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
function renderCharts(){
 const list=scenarios(),own=ownView();
 $v("v2Count").textContent=`${list.length} / ${SC.length}`;
 $v("v2Legend").innerHTML=MODES.map(m=>`<span><i style="background:${COL[m]}"></i>${vEsc(label(m))}<small>GPU ${gpu(m)}</small></span>`).join("");
 $v("rphaseSeg").hidden=S.view!=="reuse";
 setPressed($v("rphaseSeg"),S.rphase);
 $v("v2ChartList").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${own?"% vs own Cold · positive = better":`${d.unit} · ${d.higher?"↑ higher is better":"↓ lower is better"}`}</small></h3>${chart(k,list,own?"gain":"value")}</article>`).join("");
}
function renderTable(){
 const d=METRICS[S.metric],k=S.metric,own=ownView();
 seg($v("tMetric"),Object.entries(METRICS).map(([v,x])=>[v,x.short]),S.metric);
 $v("tDir").textContent=S.dir>0?"↑ ASC":"↓ DESC";
 let list=[...scenarios()];
 if(S.sort!=="order")list.sort((a,b)=>(cell(a[0],a[1],S.sort,k).g-cell(b[0],b[1],S.sort,k).g)*S.dir);
 else list.sort((a,b)=>(a[0]-b[0]||a[1]-b[1])*S.dir);
 const mark=(i,c)=>warm(i,c)&&(S.view==="first"||own)?`<span class="v2-warm" title="Baseline warm-up">*</span>`:"";
 let head,body,foot;
 if(own){
  head=`<tr><th>Input</th><th>C</th>${MODES.map(m=>`<th class="${m[0]}">${vEsc(label(m))}<small>Cold → ${PHASES[S.rphase]}</small></th><th>Δ</th>`).join("")}</tr>`;
  body=list.map(([i,c])=>`<tr><td>${i}${mark(i,c)}</td><td>C${c}</td>${MODES.map(m=>{const x=cell(i,c,m,k);return `<td>${num(x.ref,d.dec)} → <b>${num(x.v,d.dec)}</b></td><td>${pct(x.g)}</td>`}).join("")}</tr>`).join("");
  foot=`<tr><td colspan="2">Average (excl. *)</td>${MODES.map(m=>`<td></td><td>${pct(average(m,k,list).avg)}</td>`).join("")}</tr>`;
 }else{
  head=`<tr><th>Input</th><th>C</th><th class="b">${vEsc(label("baseline"))}<small>${d.unit}</small></th>${CAND.map(m=>`<th class="${m[0]}">${vEsc(label(m))}<small>${d.unit}</small></th><th>vs Baseline</th>`).join("")}</tr>`;
  body=list.map(([i,c])=>`<tr><td>${i}${mark(i,c)}</td><td>C${c}</td><td>${num(cell(i,c,"baseline",k).v,d.dec)}</td>${CAND.map(m=>{const x=cell(i,c,m,k);return `<td><b>${num(x.v,d.dec)}</b></td><td>${pct(x.g)}</td>`}).join("")}</tr>`).join("");
  foot=`<tr><td colspan="3">Average${S.view==="first"?" (excl. *)":""}</td>${CAND.map(m=>`<td></td><td>${pct(average(m,k,list).avg)}</td>`).join("")}</tr>`;
 }
 $v("tScenario").innerHTML=`<thead>${head}</thead><tbody>${body||`<tr><td colspan="8" class="v2-empty">無資料</td></tr>`}</tbody>${list.length?`<tfoot>${foot}</tfoot>`:""}`;
}
function renderHits(){
 const r=(m,i,c)=>batch(m,i,c,"Reuse_1");
 $v("tHits").innerHTML=`<thead><tr><th>Input</th><th>C</th><th class="b">${vEsc(label("baseline"))}<small>GPU / External</small></th><th class="a">aiDAPTIV ON<small>External / batch</small></th><th class="l">LMCache<small>External / batch</small></th><th>Prompt tokens</th></tr></thead><tbody>${SC.map(([i,c])=>`<tr><td>${i}</td><td>C${c}</td><td>${r("baseline",i,c).gpu_hit_tokens} / ${r("baseline",i,c).external_hit_tokens}</td><td><b class="v2-hit">${tok(r("aidaptiv",i,c).external_hit_tokens)}</b></td><td><b class="v2-hit">${tok(r("lmcache",i,c).external_hit_tokens)}</b></td><td>${tok(i*c)}</td></tr>`).join("")}</tbody>`;
}
function renderRaw(){
 const rows=V.batches.filter(r=>(S.rMode==="all"||r.mode===S.rMode)&&(S.rInput==="all"||r.input_tokens===+S.rInput)&&(S.rC==="all"||r.concurrency===+S.rC)&&(S.rPhase==="all"||r.phase===S.rPhase));
 $v("rCount").textContent=`${rows.length} / ${V.batches.length}`;
 $v("tRaw").innerHTML=`<thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Phase</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS<small>tok/s</small></th><th>GPU hit</th><th>External hit</th><th>Check</th></tr></thead><tbody>${rows.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(label(r.mode))}</td><td>${gpu(r.mode)}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>${r.phase.replace("_"," #")}</td><td>${num(r.ttft_ms,1)}</td><td>${num(r.tpot_ms,2)}</td><td>${num(r.output_tps,1)}</td><td>${tok(r.gpu_hit_tokens)}</td><td>${r.external_hit_tokens?`<b class="v2-hit">${tok(r.external_hit_tokens)}</b>`:"0"}</td><td>${valid(r)?`<span class="v2-d gain">PASS</span>`:`<span class="v2-d loss">FAIL</span>`}</td></tr>`).join("")}</tbody>`;
}
function renderMethod(){
 const s=V.scope;
 $v("v2MethodBody").innerHTML=`<h4>Method<span class="zh-i">方法</span></h4><ul><li>${vEsc(label("baseline"))}：${vEsc(V.modes.baseline.runtime)}，${vEsc(V.modes.baseline.cache)}。</li><li>${vEsc(s.prompts)}；Cold 1 次 + Reuse 3 次；Temperature 0、Output 200（伺服器回報）。</li><li>Improvement：TTFT、TPOT ＝ (Baseline − Mode) ÷ Baseline；TPS ＝ (Mode − Baseline) ÷ Baseline。正數＝改善。8 情境等權平均。</li><li>TPS ＝ ${vEsc(s.output_tps_definition)}。</li><li>Input 15950 / C5 不納入。</li></ul>
 <h4>Limits<span class="zh-i">限制</span></h4><ul>${V.notes.map(n=>`<li>${vEsc(n)}</li>`).join("")}</ul>
 <h4>Historical<span class="zh-i">歷史資料（不混算）</span></h4><ul><li><a href="${vEsc(V.historical.page)}">${vEsc(V.historical.label)}</a>：${vEsc(V.historical.note)}</li></ul>
 <h4>Downloads<span class="zh-i">原始資料</span></h4><ul class="v2-links">${[["AISO_BenchmarkV2_Verified_Reuse.json","Verified reuse (96 batches)"],["AISO_BenchmarkV2_SharedPrompt_Reuse_Probe.json","Historical: GPU-cache Baseline probe"],["AISO_BenchmarkV2_First_vs_Repeated.json","Historical: Random R1 / R2-R3"],["AISO_Benchmark_Valid72.csv","Historical: 72 random runs"]].map(([f,t])=>`<li><a href="data/benchmark-v2/${f}" download>${t}</a></li>`).join("")}</ul>`;
}
function renderFilters(){
 const ins=[...new Set(SC.map(x=>x[0]))],cs=[...new Set(SC.map(x=>x[1]))].sort((a,b)=>a-b);
 opts($v("fInput"),[["all","All"],...ins.map(x=>[x,x])],S.input);
 opts($v("fC"),[["all","All"],...cs.map(x=>[x,`C${x}`])],S.c);
 opts($v("rMode"),[["all","All"],...MODES.map(m=>[m,label(m)])],S.rMode);
 opts($v("rInput"),[["all","All"],...ins.map(x=>[x,x])],S.rInput);
 opts($v("rC"),[["all","All"],...cs.map(x=>[x,`C${x}`])],S.rC);
 opts($v("rPhase"),[["all","All"],...V.scope.phases.map(p=>[p,p.replace("_"," #")])],S.rPhase);
}
function setPressed(el,cur){el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===cur))}
function renderView(){
 setPressed($v("phaseSeg"),S.view);setPressed($v("basisSeg"),S.basis);
 $v("basisSeg").hidden=S.view!=="reuse";
 $v("secHits").hidden=S.view!=="reuse";
 renderCards();renderCharts();renderTable();
}
function bind(){
 const on=(id,key,after)=>$v(id).addEventListener("change",e=>{S[key]=e.target.value;after()});
 on("fInput","input",renderView);on("fC","c",renderView);on("tSort","sort",renderTable);
 on("rMode","rMode",renderRaw);on("rInput","rInput",renderRaw);on("rC","rC",renderRaw);on("rPhase","rPhase",renderRaw);
 $v("tDir").addEventListener("click",()=>{S.dir*=-1;renderTable()});
 const click=(id,fn)=>$v(id).addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(b)fn(b.dataset.v)});
 click("tMetric",v=>{S.metric=v;renderTable()});
 click("phaseSeg",v=>{S.view=v;renderView()});
 click("basisSeg",v=>{S.basis=v;renderView()});
 click("rphaseSeg",v=>{S.rphase=v;renderView()});
}
fetch("data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 V=d;
 // Input 15950 / C5 stays out of every view even if a future data file contains it.
 const out=V.scope.excluded.map(e=>`${e.input_tokens}/${e.concurrency}`),keep=r=>!out.includes(`${r.input_tokens}/${r.concurrency}`);
 V.batches=V.batches.filter(keep);V.reuse_summary=V.reuse_summary.filter(keep);
 SC=[...new Set(V.batches.map(r=>`${r.input_tokens}/${r.concurrency}`))].map(k=>k.split("/").map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 renderTop();renderSsd();renderFilters();renderHits();renderRaw();renderMethod();renderView();bind();
}).catch(()=>{$v("v2Count").textContent="載入失敗：data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json"});
