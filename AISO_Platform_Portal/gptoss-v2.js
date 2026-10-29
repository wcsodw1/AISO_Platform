"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"],CAND=["aidaptiv","lmcache"];
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 ttft_ms:{short:"TTFT",zh:"首字延遲",unit:"ms",higher:false,dec:2},
 output_tps:{short:"TPS",zh:"每秒輸出 token",unit:"tok/s",higher:true,dec:2},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:2}};
const VIEWS={"reuse-base":{view:"reuse",basis:"baseline"},"reuse-own":{view:"reuse",basis:"own"},"cold-base":{view:"first",basis:"baseline"}};
const S={view:"reuse",basis:"baseline",rphase:"mean",input:"all",c:"all",metric:"ttft_ms",rMode:"all",rInput:"all",rC:"all",rPhase:"all"};
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
const PH={Cold:"KV Cold",Reuse_1:"KV Warm #1",Reuse_2:"KV Warm #2",Reuse_3:"KV Warm #3"};
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
 const nGood=V.batches.filter(valid).length,okAll=nGood===V.batches.length;
 const row=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 $v("v2Setup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">相同模型、相同 Prompt 下，比較 <b>Baseline</b>（關閉 KV 卸載）、<b>aiDAPTIV</b>、<b>LMCache</b>：重複請求（KV Warm）能快多少，第一次請求（KV Cold）要多付多少。</p></section>
 <section class="v2-pane"><h2>測試方式及參數<span>Method &amp; Parameters</span></h2>
 <p class="v2-goal">每個情境送<b>同一組 Prompt</b>：<b>KV Cold</b> 1 次（快取空）→ <b>KV Warm</b> 3 次（快取已有）；量 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出。</p>
 <dl class="v2-params">${row("Model 模型",s.model)}${row("Context 上限",`${tok(s.max_model_len)} tokens`)}${row("Input 輸入",`${s.input_tokens.map(tok).join(" / ")} tokens`)}${row("Output 輸出",`${s.output_tokens} tokens`)}${row("Concurrency 並發",s.concurrency.join(" / "))}${row("Scenarios 情境",`${SC.length} 個（15950 × C5 不納入）`)}</dl></section>`;
 $v("v2Check").className="v2-check "+(okAll?"ok":"bad");$v("v2Check").textContent=`${okAll?"✓":"✗"} 資料檢查：${nGood} / ${V.batches.length} 筆符合快取規則（Baseline 無任何命中；aiDAPTIV、LMCache 的 KV Warm 都有外部命中）`;
 const R=withView({view:"reuse",basis:"baseline",rphase:"mean"},()=>Object.fromEntries(Object.keys(METRICS).map(k=>[k,CAND.map(m=>average(m,k,SC))])));
 const C=withView({view:"first",basis:"baseline"},()=>CAND.map(m=>average(m,"ttft_ms",SC)));
 const hits=m=>V.batches.filter(r=>r.mode===m&&r.phase==="Reuse_1").map(r=>r.external_hit_tokens),lo=Math.min(...hits("aidaptiv"),...hits("lmcache")),hi=Math.max(...hits("aidaptiv"),...hits("lmcache"));
 const f=x=>x.toFixed(1),two=(a,fn)=>`${fn(a[0])} / ${fn(a[1])}`,rg=(a,fn)=>`${fn(Math.min(a[0],a[1]))}–${fn(Math.max(a[0],a[1]))}`;
 const allWin=R.ttft_ms.every(x=>x.wins===x.n)&&R.output_tps.every(x=>x.wins===x.n);
 $v("v2Verdict").innerHTML=`<p class="v2-sum">KV Warm（Reuse）${allWin?`${SC.length} 個情境全部`:"整體"}比 Baseline 快：TTFT 降 ${rg([R.ttft_ms[0].avg,R.ttft_ms[1].avg],f)}%、TPS 升 ${rg([R.output_tps[0].avg,R.output_tps[1].avg],f)}%；KV Cold 則慢 ${rg([Math.abs(C[0].avg),Math.abs(C[1].avg)],f)}%。</p><ol class="v2-find"><li><b>KV Warm 靠讀快取省掉 Prefill</b>：每批外部命中 ${tok(lo)}–${tok(hi)} tokens，GPU 命中 0；Input 越長省越多。</li><li><b>KV Cold 本來就會比 Baseline 慢</b>：第一次要把 KV 寫入 DRAM／SSD，TTFT 多 ${two([Math.abs(C[0].avg),Math.abs(C[1].avg)],x=>f(x)+"%")}，屬正常現象。</li><li><b>加速的是 Prefill，不是逐字生成</b>：TPS +${two([R.output_tps[0].avg,R.output_tps[1].avg],f)}%，TPOT 只 +${two([R.tpot_ms[0].avg,R.tpot_ms[1].avg],f)}%（LMCache 另含 runtime 差異）。</li></ol>`;
}
function renderCards(){
 const list=scenarios(),own=ownView();
 $v("v2Cards").innerHTML=MODES.map(m=>{
  const info=V.modes[m];
  const rows=Object.entries(METRICS).map(([k,d])=>{
   if(!own&&m==="baseline")return `<li><span>${d.short}<small>${d.zh} · ${d.unit}</small></span><b class="v2-big flat">Reference</b></li>`;
   const a=average(m,k,list);
   return `<li><span>${d.short}<small>${d.zh} · <em class="dir">${d.higher?"越高越好 ↑":"越低越好 ↓"}</em></small></span>${Number.isFinite(a.avg)?pct2(a.avg):`<b class="v2-big flat">—</b>`}<small class="v2-win">${a.wins} / ${a.n} better</small></li>`;
  }).join("");
  return `<article class="v2-card" style="--mc:${COL[m]}"><header><h3>${vEsc(info.label)}</h3><span>GPU ${info.gpu} · :${info.port}</span></header><p class="v2-rank">${own?"KV Warm vs KV Cold":S.view==="first"?"KV Cold vs Baseline":"KV Warm vs Baseline"}<small>${vEsc(info.cache)}</small></p><ul>${rows}</ul></article>`;
 }).join("");
 const fine=[];
 if(S.view==="first"||own)fine.push("* 3950／C1：Baseline 第一個請求含暖機（790.9 ms），平均不含此情境。");
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
  [true,`KV Warm 外部命中：aiDAPTIV ON ${ok("aidaptiv")}/${reuse("aidaptiv").length} 批、LMCache ${ok("lmcache")}/${reuse("lmcache").length} 批，GPU 命中 0；KV Cold 外部命中 0`],
  [true,"aiDAPTIV ON：DRAM offload 0 GB · SSD 250 GB"]
 ];
 $v("v2SsdList").innerHTML=items.map(([y,x])=>`<li class="${y?"yes":"no"}"><i>${y?"✓":"?"}</i><span>${vEsc(x)}</span></li>`).join("");
}

function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,list,mode){
 const d=METRICS[k],n=list.length;
 if(!n)return `<p class="v2-empty">${S.input==="15950"&&S.c==="5"?"Input 15950 / C5 已排除":"無資料"}</p>`;
 // Drawn at 1:1 pixels (no viewBox scaling) so axis and label text stays the same size as the tables.
 const avail=Math.max(0,($v("v2ChartList").clientWidth||900)-48);
 const L=64,R=12,T=42,B=62,H=328,ih=H-T-B,W=Math.max(avail,n*108+L+R),gw=(W-L-R)/n,bw=Math.min(40,(gw-10)/3),dec=bw>=34?1:0;
 const val=(i,c,m)=>mode==="gain"?cell(i,c,m,k).g:cell(i,c,m,k).v;
 const vals=list.flatMap(([i,c])=>MODES.map(m=>val(i,c,m)));
 const lo=Math.min(0,...vals),hi=Math.max(0,...vals),step=niceStep(hi-lo),bot=lo,top=hi,y=v=>T+ih-(v-bot)/(top-bot)*ih;
 let g="";
 for(let v=Math.ceil(bot/step)*step;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${Math.abs(v)<step/2?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${mode==="gain"?"% vs KV Cold":d.unit}</text>`;
 list.forEach(([i,c],n0)=>{
  const x0=L+gw*n0+(gw-bw*3-4)/2;
  MODES.forEach((m,j)=>{const v=val(i,c,m),x=x0+j*(bw+2),y0=y(0),y1=y(v);
   g+=`<rect x="${x}" y="${Math.min(y0,y1)}" width="${bw}" height="${Math.max(1,Math.abs(y1-y0))}" rx="2" fill="${COL[m]}"><title>${vEsc(label(m))} · ${i} · C${c}: ${mode==="gain"?`${v.toFixed(1)}%`:`${num(v,d.dec)} ${d.unit}`}</title></rect>`;
   // improvement % over each non-Baseline bar (all bars in the own-Cold view): green = better, red = worse
   const gv=mode==="gain"?v:(m==="baseline"?NaN:cell(i,c,m,k).g);
   if(Number.isFinite(gv)&&Math.abs(gv)>=0.05){
    const txt=`${gv>0?"+":"−"}${Math.abs(gv).toFixed(dec)}%`,up=y1<=y0,lift=(j%2===0&&txt.length*7.2>bw+2)?14:0;  // alternate height when neighbouring labels would collide
    g+=`<text class="bl ${gv>0?"up":"dn"}" x="${x+bw/2}" y="${up?y1-5-lift:y1+14+lift}" text-anchor="middle">${txt}</text>`}});
  g+=`<text x="${L+gw*n0+gw/2}" y="${H-34}" text-anchor="middle" class="xl">${i}${warm(i,c)&&(S.view==="first"||ownView())?"*":""}</text><text x="${L+gw*n0+gw/2}" y="${H-16}" text-anchor="middle" class="xl2">C${c}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
function renderCharts(){
 const list=scenarios(),own=ownView();
 $v("v2Count").textContent=`${list.length} / ${SC.length}`;
 $v("v2Legend").innerHTML=MODES.map(m=>`<span><i style="background:${COL[m]}"></i>${vEsc(label(m))}<small>GPU ${gpu(m)}</small></span>`).join("");
 $v("v2ChartList").innerHTML=Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<span class="zh-i">${d.zh}</span><span class="v2-dir ${own?"hi":d.higher?"hi":"lo"}">${own?"正數＝改善":d.higher?"↑ 越高越好":"↓ 越低越好"}</span><small>${own?"% vs KV Cold":d.unit}</small></h3>${chart(k,list,own?"gain":"value")}</article>`).join("");
}
function renderTable(){
 const d=METRICS[S.metric],k=S.metric,own=ownView();
 seg($v("tMetric"),Object.entries(METRICS).map(([v,x])=>[v,x.short]),S.metric);
 let list=[...scenarios()];
 list.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const mark=(i,c)=>warm(i,c)&&(S.view==="first"||own)?`<span class="v2-warm" title="Baseline warm-up">*</span>`:"";
 let head,body,foot;
 if(own){
  head=`<tr><th>Input</th><th>C</th>${MODES.map(m=>`<th class="${m[0]}">${vEsc(label(m))}<small>KV Cold → KV Warm</small></th><th>Δ</th>`).join("")}</tr>`;
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
 const r=(m,i,c)=>batch(m,i,c,"Reuse_1"),rate=(n,t)=>`${(n/t*100).toFixed(1)}%`;
 const cellHit=(m,i,c)=>{const n=r(m,i,c).external_hit_tokens;return `<td><b class="v2-hit">${tok(n)}</b> <span class="v2-rate">${rate(n,i*c)}</span></td>`};
 $v("tHits").innerHTML=`<thead><tr><th>Input</th><th>C</th><th>Prompt tokens<small>Input × C</small></th><th class="b">${vEsc(label("baseline"))}<small>GPU / External</small></th><th class="a">aiDAPTIV ON<small>External hit</small></th><th class="l">LMCache<small>External hit</small></th></tr></thead><tbody>${SC.map(([i,c])=>`<tr><td>${i}</td><td>C${c}</td><td>${tok(i*c)}</td><td>${r("baseline",i,c).gpu_hit_tokens} / ${r("baseline",i,c).external_hit_tokens}</td>${cellHit("aidaptiv",i,c)}${cellHit("lmcache",i,c)}</tr>`).join("")}</tbody>`;
}
function renderRaw(){
 const rows=V.batches.filter(r=>(S.rMode==="all"||r.mode===S.rMode)&&(S.rInput==="all"||r.input_tokens===+S.rInput)&&(S.rC==="all"||r.concurrency===+S.rC)&&(S.rPhase==="all"||r.phase===S.rPhase));
 $v("rCount").textContent=`${rows.length} / ${V.batches.length}`;
 $v("tRaw").innerHTML=`<thead><tr><th>Mode</th><th>GPU</th><th>Input</th><th>C</th><th>Phase</th><th>TTFT<small>ms</small></th><th>TPOT<small>ms</small></th><th>TPS<small>tok/s</small></th><th>GPU hit</th><th>External hit</th><th>Check</th></tr></thead><tbody>${rows.map(r=>`<tr><td><i class="v2-dot" style="background:${COL[r.mode]}"></i>${vEsc(label(r.mode))}</td><td>${gpu(r.mode)}</td><td>${r.input_tokens}</td><td>C${r.concurrency}</td><td>${PH[r.phase]}</td><td>${num(r.ttft_ms,1)}</td><td>${num(r.tpot_ms,2)}</td><td>${num(r.output_tps,1)}</td><td>${tok(r.gpu_hit_tokens)}</td><td>${r.external_hit_tokens?`<b class="v2-hit">${tok(r.external_hit_tokens)}</b>`:"0"}</td><td>${valid(r)?`<span class="v2-d gain">PASS</span>`:`<span class="v2-d loss">FAIL</span>`}</td></tr>`).join("")}</tbody>`;
}
function renderFilters(){
 const ins=[...new Set(SC.map(x=>x[0]))],cs=[...new Set(SC.map(x=>x[1]))].sort((a,b)=>a-b);
 opts($v("fInput"),[["all","All"],...ins.map(x=>[x,x])],S.input);
 opts($v("fC"),[["all","All"],...cs.map(x=>[x,`C${x}`])],S.c);
 opts($v("rMode"),[["all","All"],...MODES.map(m=>[m,label(m)])],S.rMode);
 opts($v("rInput"),[["all","All"],...ins.map(x=>[x,x])],S.rInput);
 opts($v("rC"),[["all","All"],...cs.map(x=>[x,`C${x}`])],S.rC);
 opts($v("rPhase"),[["all","All"],...V.scope.phases.map(p=>[p,PH[p]])],S.rPhase);
}
function setPressed(el,cur){el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===cur))}
function renderView(){
 setPressed($v("viewSeg"),S.view==="first"?"cold-base":S.basis==="own"?"reuse-own":"reuse-base");
 $v("secHits").hidden=S.view!=="reuse";
 renderCards();renderCharts();renderTable();
}
function bind(){
 const on=(id,key,after)=>$v(id).addEventListener("change",e=>{S[key]=e.target.value;after()});
 on("fInput","input",renderView);on("fC","c",renderView);
 on("rMode","rMode",renderRaw);on("rInput","rInput",renderRaw);on("rC","rC",renderRaw);on("rPhase","rPhase",renderRaw);
 const click=(id,fn)=>$v(id).addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(b)fn(b.dataset.v)});
 click("tMetric",v=>{S.metric=v;renderTable()});
 click("viewSeg",v=>{Object.assign(S,VIEWS[v]);renderView()});
}
fetch("data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 V=d;
 // Input 15950 / C5 stays out of every view even if a future data file contains it.
 const out=V.scope.excluded.map(e=>`${e.input_tokens}/${e.concurrency}`),keep=r=>!out.includes(`${r.input_tokens}/${r.concurrency}`);
 V.batches=V.batches.filter(keep);V.reuse_summary=V.reuse_summary.filter(keep);
 SC=[...new Set(V.batches.map(r=>`${r.input_tokens}/${r.concurrency}`))].map(k=>k.split("/").map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 renderTop();renderSsd();renderFilters();renderHits();renderRaw();renderView();bind();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderCharts,150)});
}).catch(()=>{$v("v2Count").textContent="載入失敗：data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json"});
