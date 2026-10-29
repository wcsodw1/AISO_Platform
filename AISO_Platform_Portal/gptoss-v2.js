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
 $v("v2Setup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">比較 <b>aiDAPTIV</b>、<b>LMCache</b> 相對 <b>Baseline</b>（無 KV 快取），以及 <b>LMCache 相對 aiDAPTIV</b> 的 TTFT、TPOT、TPS 差異。</p></section>
 <section class="v2-pane"><h2>測試方式及參數<span>Method &amp; Parameters</span></h2>
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

function msg(k){
 const d=METRICS[k],la=avg(TW,k,"la","Reuse");
 if(k==="tpot_ms")return `高 Concurrency（C5）比較中，LMCache 與 aiDAPTIV 各自優於 Baseline ${f1(c5(k,"lb"))}%, ${f1(c5(k,"ab"))}%；LMCache 優於 aiDAPTIV ${f1(c5(k,"la"))}%`;
 if(k==="output_tps"){const pi=i0=>mean(SC.filter(([i])=>i===i0).map(([i,c])=>at(TW,k,i,c).la));return `LMCache 平均 TPS 在 4K、8K、16K 分別較 aiDAPTIV 快出 ${f1(pi(3950))}%、${f1(pi(7950))}%、${f1(pi(15950))}%`}
 return `開啟 aiDAPTIV 或 LMCache 後效果皆遠優於 Baseline，同時 LMCache 平均優於 aiDAPTIV ${f1(la)}%`;
}
function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
// Y axis runs 0..tallest bar; green/red % over each non-Baseline bar = improvement over Baseline.
function chart(k,width){
 const d=METRICS[k],n=SC.length;
 // Drawn at 1:1 pixels (no viewBox scaling) so axis and label text stays the same size as the tables.
 const L=64,R=12,T=42,B=62,H=328,ih=H-T-B,W=Math.max(width,n*96+L+R),gw=(W-L-R)/n,bw=Math.min(40,(gw-10)/3),dec=bw>=34?1:0;
 const top=Math.max(...SC.flatMap(([i,c])=>MODES.map(m=>at(TW,k,i,c).v[m]))),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 SC.forEach(([i,c],q)=>{
  const x0=L+gw*q+(gw-bw*3-4)/2,t=at(TW,k,i,c);
  MODES.forEach((m,j)=>{const v=t.v[m],x=x0+j*(bw+2),y1=y(v);
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${COL[m]}"><title>${NAME[m]} · ${i} · C${c}: ${num(v,d.dec)} ${d.unit}</title></rect>`;
   if(m!=="baseline"){
    const gv=m==="aidaptiv"?t.ab:t.lb,txt=`${gv>0?"+":"−"}${Math.abs(gv).toFixed(dec)}%`,lift=m==="lmcache"?14:0;  // LMCache labels sit higher so neighbours do not collide
    g+=`<text class="bl ${gv>0?"up":"dn"}" x="${x+bw/2}" y="${y1-5-lift}" text-anchor="middle">${txt}</text>`}});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-34}" text-anchor="middle" class="xl">${tok(i)}</text><text x="${L+gw*q+gw/2}" y="${H-16}" text-anchor="middle" class="xl2">C${c}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
function metricTable(k){
 const d=METRICS[k];
 const rows=SC.map(([i,c])=>{const t=at(TW,k,i,c);return `<tr><td>${tok(i)}</td><td>C${c}</td><td>${num(t.v.baseline,d.dec)}</td><td class="a"><b>${num(t.v.aidaptiv,d.dec)}</b></td><td>${pct(t.ab)}</td><td class="l"><b>${num(t.v.lmcache,d.dec)}</b></td><td>${pct(t.lb)}</td><td class="la">${pct(t.la)}</td></tr>`}).join("");
 const foot=`<tr><td colspan="3">All Scenario average differential<small>全情境平均差異</small></td><td></td><td>${pct(avg(TW,k,"ab","Reuse"))}</td><td></td><td>${pct(avg(TW,k,"lb","Reuse"))}</td><td class="la">${pct(avg(TW,k,"la","Reuse"))}</td></tr>`;
 return `<p class="v2-hint">← 左右滑動 →</p><div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Input</th><th>C</th><th class="b">Baseline</th><th class="a">aiDAPTIV ON</th><th>vs Baseline</th><th class="l">LMCache</th><th>vs Baseline</th><th class="la">LMCache vs aiDAPTIV</th></tr></thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>`;
}
function renderMetrics(){
 const width=Math.max(0,($v("v2Metrics").clientWidth||900)-100);
 const legend=MODES.map(m=>`<span><i style="background:${COL[m]}"></i>${NAME[m]}</span>`).join("");
 $v("v2Metrics").innerHTML=Object.entries(METRICS).map(([k,d])=>`<section class="report-section v2-metric">
  <header><h2>${d.short}<span class="zh">${d.zh}｜KV Warm</span></h2></header>
  <p class="v2-line"><span class="v2-dir ${d.higher?"hi":"lo"}">${d.higher?"↑ 越高越好":"↓ 越低越好"}</span><span>${msg(k)}</span><span class="v2-legend2">${legend}</span></p>
  <div class="v2-chart">${chart(k,width)}</div>
  <h3 class="v2-sub3">KV Warm 數據<span class="zh-i">${d.short} 比較中 LMCache 平均優於 aiDAPTIV ${f1(avg(TW,k,"la","Reuse"))}%</span></h3>
  ${metricTable(k)}
 </section>`).join("");
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
