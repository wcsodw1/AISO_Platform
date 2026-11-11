"use strict";
const $v=id=>document.getElementById(id);
const vEsc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MODES=["baseline","aidaptiv","lmcache"];
const NAME={baseline:"Baseline",aidaptiv:"aiDAPTIV ON",lmcache:"LMCache"};
const COL={baseline:"#c9ced6",aidaptiv:"#ff8a4c",lmcache:"#4fd1b0"};
const METRICS={
 ttft_ms:{short:"TTFT",zh:"首字延遲",unit:"ms",higher:false,dec:2},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false,dec:2},
 output_tps:{short:"TPS",zh:"每秒輸出 token",unit:"tok/s",higher:true,dec:1}};
let V,SC,TW,TC;

const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const tok=n=>n.toLocaleString("en-US");
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const gain=(v,b,hi)=>hi?(v/b-1)*100:(1-v/b)*100;
const sign=v=>v>0.05?"+":v<-0.05?"−":"";
const cls=v=>v>0.05?"gain":v<-0.05?"loss":"flat";
const pct=v=>`<span class="v2-d ${cls(v)}">${sign(v)}${Math.abs(v).toFixed(1)}%</span>`;
const pct2=v=>`<b class="v2-big ${cls(v)}">${sign(v)}${Math.abs(v).toFixed(1)}%</b>`;
const f1=v=>Math.abs(v).toFixed(1);
// Baseline's first request after restart includes warm-up, so Cold averages skip this scenario.
const warm=(i,c)=>i===3950&&c===1;

const batch=(m,i,c,ph)=>V.batches.find(r=>r.mode===m&&r.input_tokens===i&&r.concurrency===c&&r.phase===ph);
// KV Warm = mean of the three repeated requests; KV Cold = the first request.
const val=(m,i,c,k,ph)=>ph==="Reuse"?mean(["Reuse_1","Reuse_2","Reuse_3"].map(p=>batch(m,i,c,p)[k])):batch(m,i,c,"Cold")[k];
function build(ph){
 const T={};
 Object.entries(METRICS).forEach(([k,d])=>SC.forEach(([i,c])=>{
  const v=Object.fromEntries(MODES.map(m=>[m,val(m,i,c,k,ph)]));
  T[`${k}/${i}/${c}`]={v,ab:gain(v.aidaptiv,v.baseline,d.higher),lb:gain(v.lmcache,v.baseline,d.higher),la:gain(v.lmcache,v.aidaptiv,d.higher)};
 }));
 return T;
}
const at=(T,k,i,c)=>T[`${k}/${i}/${c}`];
const avg=(T,k,key,ph)=>mean(SC.filter(([i,c])=>!(ph==="Cold"&&warm(i,c))).map(([i,c])=>at(T,k,i,c)[key]));
const c5=(k,key)=>mean(SC.filter(([,c])=>c===5).map(([i,c])=>at(TW,k,i,c)[key]));

function renderSetup(){
 const s=V.scope,row=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 $v("v2Setup").innerHTML=`<section class="v2-pane"><h2>Purpose<span>實驗目的</span></h2><p class="v2-goal">比較 <b>aiDAPTIV</b>、<b>LMCache</b> 相對 <b>Baseline</b>（無 KV 快取），以及 <b>LMCache 相對 aiDAPTIV</b> 的 TTFT、TPOT、TPS 差異。</p></section>
 <section class="v2-pane"><h2>Method &amp; Parameters<span>測試方式及參數</span></h2>
 <p class="v2-goal">每個情境送<b>同一組 Prompt</b>：<b>KV Cold</b> 1 次（快取空）→ <b>KV Warm</b> 3 次（快取已有）；測試 <b>TTFT</b> 首字延遲、<b>TPOT</b> 字間隔、<b>TPS</b> 每秒輸出。</p>
 <dl class="v2-params">${row("Model 模型",vEsc(s.model))}${row("Context 上限",`${tok(s.max_model_len)} tokens`)}${row("Input 輸入",`${s.input_tokens.map(tok).join(" / ")} tokens<small class="v2-approx">約等於 4K / 8K / 16K</small>`)}${row("Output 輸出",`${s.output_tokens} tokens`)}${row("Concurrency 並發",s.concurrency.join(" / "))}</dl><p class="v2-fn">測試參數參照群聯提供之 benchmark 腳本</p></section>`;
}

// Three pairwise comparisons side by side: aiDAPTIV vs Baseline, LMCache vs Baseline, LMCache vs aiDAPTIV.
function sumTable(T,ph){
 const cols=[["ab","aiDAPTIV","相對 Baseline","aidaptiv"],["lb","LMCache","相對 Baseline","lmcache"],["la","LMCache","相對 aiDAPTIV","lmcache"]];
 const head=cols.map(([,n,s,m])=>`<th><i class="v2-sw" style="background:${COL[m]}"></i>${n}<small>${s}</small></th>`).join("");
 const body=Object.entries(METRICS).map(([k,d])=>`<tr><th>${d.short}<small>${d.zh}${ph==="Reuse"?` · ${d.higher?"越高越好 ↑":"越低越好 ↓"}`:""}</small></th>${cols.map(([key])=>`<td>${pct2(avg(T,k,key,ph))}</td>`).join("")}</tr>`).join("");
 return `<div class="table-wrap"><table class="v2-table v2-sumt"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function renderConclusion(){
 $v("v2Sum").innerHTML=sumTable(TW,"Reuse");
 const a=(k,key)=>f1(avg(TW,k,key,"Reuse"));
 $v("v2Take").innerHTML=`<b>相較 Baseline（無 aiDAPTIV），<span class="ga">aiDAPTIV</span> 與 <span class="gl">LMCache</span> 都大幅降低 TTFT（首字延遲）：<span class="ga">+${a("ttft_ms","ab")}%</span> / <span class="gl">+${a("ttft_ms","lb")}%</span>。<br><span class="gl">LMCache</span> 在 TPOT、TPS 上更遠勝 <span class="ga">aiDAPTIV</span>：TPOT <span class="gl">+${a("tpot_ms","lb")}%</span> vs <span class="ga">+${a("tpot_ms","ab")}%</span>，TPS <span class="gl">+${a("output_tps","lb")}%</span> vs <span class="ga">+${a("output_tps","ab")}%</span>。</b>`;
}
function renderCold(){
 const a=(k,key)=>avg(TC,k,key,"Cold");
 $v("v2ColdSub").textContent=`即便在 KV Cold，LMCache 在 TPOT、TPS 仍優於 aiDAPTIV：TPOT +${f1(a("tpot_ms","la"))}%、TPS +${f1(a("output_tps","la"))}%；TTFT 則慢 ${f1(a("ttft_ms","la"))}%`;
 $v("v2ColdSum").innerHTML=sumTable(TC,"Cold");
 $v("v2ColdTake").innerHTML=`<b>第一次請求需 offload 到 DRAM 與 SSD，各項數據慢於 Baseline 屬正常現象；即便如此，LMCache 平均在 TPOT、TPS 的表現仍皆優於 Baseline 與 aiDAPTIV。</b>`;
}

let CUR=null;   // selected concurrency (C1 / C2 / C5): one line chart per metric across the input lengths, like the NP selector on the B60 / B70 pages
function renderMetrics(){
 // Same approach as the Intel B60 / B70 pages: shared line charts (bench-viz.js), one-sentence summary beside "full values".
 const width=Math.max(320,($v("v2Metrics").clientWidth||900)-100),kk=i=>`${Math.round(i/1000)}K`,cs=[...new Set(SC.map(([,c])=>c))].sort((a,b)=>a-b);
 if(!cs.includes(CUR))CUR=cs[0];
 const groups=SC.filter(([,c])=>c===CUR).map(([i,c])=>({label:kk(i),sub:`${tok(i)} tokens`,i:`${i}/${c}`}));
 const series=MODES.map(m=>({key:m,label:NAME[m],color:COL[m]}));
 const pick=`<div class="cmp-pick v2-pick"><span>Concurrency<small class="zhs">並發</small></span><div class="st-tabs cmp-tabs" role="tablist" aria-label="Concurrency">${cs.map(c=>`<button type="button" role="tab" class="${c===CUR?"on":""} has" aria-selected="${c===CUR}" data-c="${c}">C${c}</button>`).join("")}</div></div>`;
 $v("v2Metrics").innerHTML=pick+Object.entries(METRICS).map(([k,d])=>`<section class="report-section v2-metric">
  ${BV.block({k,def:d,groups,series,baseline:"baseline",width,context:`GPT-OSS-20B · KV Warm · C${CUR}`,rowHead:"Input",tableNote:`差異以 Baseline 為基準；C${CUR} 下 LMCache vs aiDAPTIV 平均 ${f1(mean(SC.filter(([,c])=>c===CUR).map(([i,c])=>at(TW,k,i,c).la)))}%`,
   get:(m,g)=>{const [i,c]=g.i.split("/").map(Number);const v=at(TW,k,i,c).v[m];return Number.isFinite(v)?{[k]:v}:null}})}
 </section>`).join("");
 $v("v2Metrics").querySelectorAll(".v2-pick button").forEach(b=>b.onclick=()=>{CUR=+b.dataset.c;renderMetrics()});
}
function renderHits(){
 const r=(m,i,c)=>batch(m,i,c,"Reuse_1").external_hit_tokens,rate=(n,t)=>`${(n/t*100).toFixed(1)}%`,dl=[];
 const rows=SC.map(([i,c])=>{
  const a=r("aidaptiv",i,c),l=r("lmcache",i,c),t=i*c,d=(l/a-1)*100;dl.push(d);
  return `<tr><td>${tok(i)}</td><td>C${c}</td><td>${tok(t)}</td><td class="a"><b class="v2-hit">${tok(a)}</b> <span class="v2-rate">${rate(a,t)}</span></td><td class="l"><b class="v2-hit">${tok(l)}</b> <span class="v2-rate">${rate(l,t)}</span></td><td class="la">${pct(d)}</td></tr>`}).join("");
 const m=mean(dl);
 $v("v2HitSub").textContent=`aiDAPTIV 在 Hit tokens 命中數上小幅優於 LMCache，平均約 ${f1(m)}%`;
 $v("tHits").innerHTML=`<thead><tr><th>Input</th><th>C*</th><th>Prompt tokens</th><th class="a">aiDAPTIV ON<small>External hit</small></th><th class="l">LMCache<small>External hit</small></th><th class="la">LMCache vs aiDAPTIV<small>命中數差異</small></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">All Scenario average differential<small>全情境平均差異</small></td><td></td><td></td><td class="la">${pct(m)}</td></tr></tfoot>`;
}

fetch("data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 V=d;
 // Input 15950 / C5 stays out of every view even if a future data file contains it.
 const out=V.scope.excluded.map(e=>`${e.input_tokens}/${e.concurrency}`),keep=r=>!out.includes(`${r.input_tokens}/${r.concurrency}`);
 V.batches=V.batches.filter(keep);
 SC=[...new Set(V.batches.map(r=>`${r.input_tokens}/${r.concurrency}`))].map(k=>k.split("/").map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 TW=build("Reuse");TC=build("Cold");
 renderSetup();renderConclusion();renderMetrics();renderCold();renderHits();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(()=>{$v("v2Err").textContent="載入失敗：data/benchmark-v2/AISO_BenchmarkV2_Verified_Reuse.json"});
