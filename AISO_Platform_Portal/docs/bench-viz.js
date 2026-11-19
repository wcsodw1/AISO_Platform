"use strict";
/* Shared Stress Test chart block, same visual language as the LMCache v.s aiDAPTIV page:
   badge (越低越好/越高越好) + one-sentence conclusion + legend, bar chart with green/red % over each non-baseline bar,
   then the data table with "vs baseline" columns and an average-differential footer. */
window.BV=(function(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const tok=n=>n.toLocaleString("en-US");
 const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
 const fmt=(k,v)=>k==="ttft_s"?(v<10?num(v,2):num(v,1)):(v>=100?num(v,0):num(v,1));
 const gain=(v,b,hi)=>hi?(v/b-1)*100:(1-v/b)*100;          // + = better than baseline
 const sign=v=>v>0.05?"+":v<-0.05?"−":"",cls=v=>v>0.05?"gain":v<-0.05?"loss":"flat";
 const pct=v=>Number.isFinite(v)?`<span class="v2-d ${cls(v)}">${sign(v)}${Math.abs(v).toFixed(1)}%</span>`:'<span class="v2-na">—</span>';
 const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
 // delta vs baseline: +/-x% (same convention as the LMCache page); once the gap passes 100% show a multiple (慢 8.1× / 快 2.3×) instead
 function dtext(g,ratio,hi){
  if(!Number.isFinite(g))return {t:"—",c:"flat"};
  if(hi&&g>=100)return {t:`快 ${ratio.toFixed(1)}×`,c:"gain"};
  if(!hi&&g<=-100)return {t:`慢 ${ratio.toFixed(1)}×`,c:"loss"};
  return {t:`${sign(g)}${Math.abs(g).toFixed(1)}%`,c:cls(g)};
 }
 const dd=(v,b,hi)=>dtext(gain(v,b,hi),v/b,hi);
 const dspan=d=>`<span class="v2-d ${d.c}">${d.t}</span>`;
 function step(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}

 function svg(o){
  const {k,def,groups,series,get,baseline,width}=o,n=groups.length,ns=series.length;
  const L=68,R=14,T=66,B=80,H=364,ih=H-T-B,W=Math.max(width||0,n*Math.max(150,ns*62)+L+R),gw=(W-L-R)/n,bw=Math.min(54,(gw-18)/ns);
  const vals=groups.flatMap(g=>series.map(s=>get(s.key,g)).filter(Boolean).map(r=>r[k]));
  if(!vals.length)return null;
  const top=Math.max(...vals),st=step(top),y=v=>T+ih-v/top*ih;
  let s="";
  for(let v=0;v<=top+1e-9;v+=st){const yy=y(v);s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,st<1?1:0)}</text>`}
  s+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(def.unit)}</text>`;
  groups.forEach((g,q)=>{
   const x0=L+gw*q+(gw-bw*ns-3*(ns-1))/2,base=baseline?get(baseline,g):null;
   series.forEach((se,j)=>{
    const r=get(se.key,g),x=x0+j*(bw+3);
    if(!r){s+=`<text class="bl up2" x="${x+bw/2}" y="${y(0)-6}" text-anchor="middle">—</text>`;return}
    const v=r[k],y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
    s+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="3" fill="${se.color}"><title>${esc(se.label)} · ${esc(g.label)}: ${fmt(k,v)} ${esc(def.unit)}</title></rect>`;
    s+=`<text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-6}" text-anchor="middle">${fmt(k,v)}</text>`;
    if(baseline&&se.key!==baseline&&base){const d=dd(v,base[k],def.higher);
     s+=`<text class="bl ${d.c==="gain"?"up":d.c==="loss"?"dn":"up2"}" x="${x+bw/2}" y="${y1-26}" text-anchor="middle">${d.t}</text>`}
   });
   s+=`<text x="${L+gw*q+gw/2}" y="${H-46}" text-anchor="middle" class="xl">${esc(g.label)}</text><text x="${L+gw*q+gw/2}" y="${H-20}" text-anchor="middle" class="xl2">${esc(g.sub||"")}</text>`;
  });
  return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(def.short)}">${s}</svg></div>`;
 }

 /* line chart: same data and axis as the bars; one line per series across the input lengths */
 const gwOf=o=>{const n=o.groups.length,L=68,R=30,W=Math.min(780,Math.max(o.width||0,n*150+L+R));return (W-L-R)/n};
 const SHAPES=["circle","square","triangle","diamond"];
 const mark=(shape,cx,cy,r,fill,tip="",a="")=>shape==="square"?`<rect ${a} x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}" rx="1.5" fill="${fill}" stroke="#0b0f17" stroke-width="2">${tip}</rect>`:shape==="triangle"?`<polygon ${a} points="${cx},${cy-r-1.5} ${cx+r+1.5},${cy+r} ${cx-r-1.5},${cy+r}" fill="${fill}" stroke="#0b0f17" stroke-width="2" stroke-linejoin="round">${tip}</polygon>`:shape==="diamond"?`<polygon ${a} points="${cx},${cy-r-2} ${cx+r+2},${cy} ${cx},${cy+r+2} ${cx-r-2},${cy}" fill="${fill}" stroke="#0b0f17" stroke-width="2" stroke-linejoin="round">${tip}</polygon>`:`<circle ${a} cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#0b0f17" stroke-width="2">${tip}</circle>`;
 function lineSvg(o){
  const {k,def,groups,series,get,width}=o,n=groups.length,dodge=o.dodge?Math.min(40,Math.max(0,(gwOf(o)-60)/Math.max(1,series.length-1))):0,off=j=>dodge?(j-(series.length-1)/2)*dodge:0;
  const L=68,R=30,T=50,B=80,H=364,ih=H-T-B,W=Math.min(780,Math.max(width||0,n*150+L+R)),gw=(W-L-R)/n;   // never wider than 780 px: a narrow chart makes the slope of the lines easy to see (David 2026-11-18); it scales down, never scrolls
  const vals=groups.flatMap(g=>series.map(s=>get(s.key,g)).filter(Boolean).map(r=>r[k]));
  if(!vals.length)return null;
  const top=Math.max(...vals),st=step(top),y=v=>T+ih-v/top*ih,x=q=>L+gw*(q+.5);
  let s="";
  for(let v=0;v<=top+1e-9;v+=st){const yy=y(v);s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,st<1?1:0)}</text>`}
  s+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(def.unit)}</text>`;
  series.forEach((se,j)=>{
   let d="",pen=false;
   groups.forEach((g,q)=>{const r=get(se.key,g);if(!r){pen=false;return}d+=`${pen?"L":"M"}${(x(q)+off(j)).toFixed(1)} ${y(r[k]).toFixed(1)} `;pen=true});
   if(d)s+=`<path d="${d}" fill="none" stroke="transparent" stroke-width="18" data-s="${j}" class="bv-hit"/><path d="${d}" fill="none" data-s="${j}" class="bv-ln" stroke="${se.color}" stroke-width="3"${o.dodge&&j%2?' stroke-dasharray="9 6"':""} stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  /* points + number labels, one input at a time: a point right under another labels below it, and then the labels of ALL series at this input
     are pushed apart (>= 20 px) so two or three close values never print on top of each other (the "2:69" bug David saw) */
  groups.forEach((g,q)=>{
   const pts=series.map((se,j)=>{const r=get(se.key,g);return r?{se,j,r,v:r[k],py:y(r[k])}:null}).filter(Boolean);
   if(o.dodge)pts.forEach(p=>{p.ly=p.py-12});
   else{
   pts.forEach(p=>{const close=pts.some(o=>o!==p&&o.py<p.py&&p.py-o.py<26);p.ly=close?p.py+24:p.py-12});
   let last=-1e9;pts.slice().sort((a,b)=>a.ly-b.ly||a.py-b.py).forEach(p=>{p.ly=Math.max(p.ly,last+20);last=p.ly});}
   pts.forEach(p=>{const red=k==="ttft_s"&&p.r.ttft_over_180s;
    const cx=x(q)+off(p.j),tip=`<title>${esc(p.se.label)} · ${esc(g.label)}: ${fmt(k,p.v)} ${esc(def.unit)}</title>`;
    const at=`data-s="${p.j}" class="bv-pt"`;
    s+=`<circle cx="${cx}" cy="${p.py}" r="13" fill="transparent" data-s="${p.j}" class="bv-hit"/>`;
    s+=o.dodge?mark(SHAPES[p.j%SHAPES.length],cx,p.py,6,p.se.color,tip,at):`<circle ${at} cx="${cx}" cy="${p.py}" r="5.5" fill="${p.se.color}" stroke="#0b0f17" stroke-width="2">${tip}</circle>`;
    s+=`<text class="bl ${red?"dn":"up2"}" data-s="${p.j}" style="--dy:${(p.py-12-p.ly).toFixed(1)}px" x="${cx}" y="${p.ly}" text-anchor="middle">${fmt(k,p.v)}</text>`});
   if(o.skip)series.forEach((se,j)=>{if(!get(se.key,g)&&o.skip(se.key,g))s+=`<text class="bl dn" x="${x(q)+off(j)}" y="${y(0)-8}" text-anchor="middle" style="font-size:20px">✕<title>${esc(se.label)} · ${esc(g.label)}: SKIP</title></text>`});
  });
  groups.forEach((g,q)=>{s+=`<text x="${x(q)}" y="${H-46}" text-anchor="middle" class="xl">${esc(g.label)}</text><text x="${x(q)}" y="${H-20}" text-anchor="middle" class="xl2">${esc(g.sub||"")}</text>`});
  return `<div class="v2-chartwrap bv-fit"><svg class="bv-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:${W}px;height:auto;margin:0 auto" role="img" aria-label="${esc(def.short)} line chart">${s}</svg></div>`;
 }
 /* hover or click a line / point: that series is picked out, enlarged, its values drawn right at its points and the others dimmed; click again (or the empty chart) to release (David 2026-11-19) */
 (function(){if(window.__bvPick)return;window.__bvPick=1;const pin=new WeakMap();
  const st=document.createElement("style");st.textContent=".bv-dv{display:block;font-size:.82em;margin-top:2px;white-space:nowrap}.bv-svg [data-s]{transition:opacity .15s}.bv-svg .bv-hit{cursor:pointer}.bv-svg.bv-on [data-s]{opacity:.12}.bv-svg.bv-on .bl{opacity:0}.bv-svg.bv-on [data-s].sel{opacity:1}.bv-svg.bv-on .bl.sel{opacity:1;font-size:17px;font-weight:800;transform:translateY(var(--dy,0px))}.bv-svg.bv-on .bv-ln.sel{stroke-width:5.5}.bv-svg.bv-on .bv-pt.sel{transform:scale(1.8);transform-box:fill-box;transform-origin:center}";
  document.head.appendChild(st);
  const apply=(svg,v)=>{svg.classList.toggle("bv-on",v!=null);svg.querySelectorAll("[data-s]").forEach(e=>e.classList.toggle("sel",v!=null&&e.getAttribute("data-s")===String(v)))};
  const hit=e=>{const t=e.target.closest&&e.target.closest(".bv-svg [data-s]");return t?[t.closest("svg"),t.getAttribute("data-s")]:null};
  document.addEventListener("mouseover",e=>{const h=hit(e);if(h)apply(h[0],h[1])});
  document.addEventListener("mouseout",e=>{const sv=e.target.closest&&e.target.closest(".bv-svg");if(!sv)return;const to=e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest(".bv-svg [data-s]");if(!to||to.closest("svg")!==sv)apply(sv,pin.has(sv)?pin.get(sv):null)});
  document.addEventListener("click",e=>{const sv=e.target.closest&&e.target.closest(".bv-svg");if(!sv)return;const h=hit(e);if(h&&pin.get(sv)!==h[1]){pin.set(sv,h[1]);apply(sv,h[1])}else{pin.delete(sv);apply(sv,null)}})})();
 /* Bar | Line | Both switch, remembered per browser; one handler flips every chart block on the page */
 const MODES=[["bar","Bar","長條"],["line","Line","折線"],["both","Both","兩者"]];
 const getMode=()=>{try{const m=localStorage.getItem("bvMode");return MODES.some(x=>x[0]===m)?m:"both"}catch(e){return "both"}};
 const modeBar=m=>`<div class="bv-mode" role="group" aria-label="Chart type">${MODES.map(([k,en,zh])=>`<button type="button" data-mode="${k}" class="${k===m?"on":""}" aria-pressed="${k===m}">${en}<small>${zh}</small></button>`).join("")}</div>`;
 function charts(o){   // line charts only (bars were replaced by lines)
  const ln=lineSvg(o);if(!ln)return null;
  return `<div class="bv-charts" data-mode="line"><div class="bv-line">${ln}</div></div>`;
 }
 document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".bv-mode button");if(!b)return;const m=b.dataset.mode;
  try{localStorage.setItem("bvMode",m)}catch(err){}
  document.querySelectorAll(".bv-charts").forEach(c=>{c.dataset.mode=m;c.querySelectorAll(".bv-mode button").forEach(x=>{const on=x.dataset.mode===m;x.classList.toggle("on",on);x.setAttribute("aria-pressed",String(on))})})});
 function message(o){
  const {k,def,groups,series,get,baseline}=o;
  if(!baseline)return o.message||"";
  const b=series.find(s=>s.key===baseline),out=[];
  series.filter(s=>s.key!==baseline).forEach(s=>{
   const ds=groups.map(g=>{const a=get(s.key,g),c=get(baseline,g);return a&&c?[g.label,gain(a[k],c[k],def.higher),a[k]/c[k]]:null}).filter(Boolean);
   if(!ds.length){out.push(`${s.label} 尚無與 ${b.label} 同條件的資料可比較`);return}
   const m=mean(ds.map(x=>x[1])),av=dtext(m,mean(ds.map(x=>x[2])),def.higher);
   out.push(`以 ${b.label} 為基準，${s.label} 平均${m>=0?"優於":"劣於"}（${av.t}）；${ds.map(x=>`${x[0]} ${dtext(x[1],x[2],def.higher).t}`).join("、")}`)});
  return out.join("；");
 }
 function summary(o){   // ONE short sentence under the chart (HTML): each machine's all-input average versus the baseline
  const {k,def,groups,series,get,baseline}=o;if(!baseline)return "";
  const b=series.find(x=>x.key===baseline),short=l=>esc(String(l).replace(/^Intel /,"").replace(/ AMD$/,"")),out=[];
  series.filter(x=>x.key!==baseline).forEach(x=>{
   const ds=groups.map(g=>{const a=get(x.key,g),c=get(baseline,g);return a&&c?[gain(a[k],c[k],def.higher),a[k]/c[k]]:null}).filter(Boolean);
   if(!ds.length){out.push({n:short(x.sum||x.label),none:true});return}
   const m=mean(ds.map(y=>y[0])),ra=mean(ds.map(y=>y[1])),big=def.higher?m>=100:m<=-100;
   out.push({n:short(x.sum||x.label),good:m>=0,big,v:Math.abs(m).toFixed(1),x:ra.toFixed(1)})});
  const bn=short(b.sum||b.label),ok=out.filter(y=>!y.none);if(!ok.length)return "";
  const word=y=>y.big?(def.higher?"faster":"slower"):(y.good?"better":"worse"),zh=y=>y.big?(def.higher?"快":"慢"):(y.good?"好":"差"),num=y=>y.big?`${y.x}×`:`${y.v}%`,znum=y=>y.big?`${y.x} 倍`:`${y.v}%`;
  const same=ok.every(y=>word(y)===word(ok[0]));
  const en=same?`${ok.map(y=>`${y.n} ${num(y)}`).join(" · ")} ${word(ok[0])} than ${bn}`:`${ok.map(y=>`${y.n} ${num(y)} ${word(y)}`).join(" · ")} than ${bn}`;
  const zt=same?`比 ${bn} ${zh(ok[0])} ${ok.map(znum).join("／")}`:`${ok.map(y=>`${y.n} ${zh(y)} ${znum(y)}`).join("；")}（比 ${bn}）`;
  return `${en}<small class="zhs">${zt}</small>`+(o.summaryNote?` <span class="bv-note">⚠ ${esc(o.summaryNote[0])}<small class="zhs">${esc(o.summaryNote[1])}</small></span>`:"");
 }
 function table(o){
  const {k,def,groups,series,get,baseline}=o,others=baseline?series.filter(s=>s.key!==baseline):[];
  const b=series.find(s=>s.key===baseline);
  const cell=(r,s,g)=>{const c=baseline&&s.key!==baseline?get(baseline,g):null;return `<td${k==="ttft_s"&&r&&r.ttft_over_180s?' class="st-over"':""}>${r?fmt(k,r[k]):"—"}${r&&c?`<span class="bv-dv">${dspan(dd(r[k],c[k],def.higher))}</span>`:""}</td>`};
  const rows=groups.map(g=>`<tr><td>${esc(g.label)}<small class="bv-sub">${esc(g.sub||"")}</small></td>${series.map(s=>cell(get(s.key,g),s,g)).join("")}</tr>`).join("");
  const avg=series.map(s=>{if(s.key===baseline)return "<td></td>";const v=groups.map(g=>{const a=get(s.key,g),c=get(baseline,g);return a&&c?[gain(a[k],c[k],def.higher),a[k]/c[k]]:null}).filter(Boolean);return `<td>${v.length?dspan(dtext(mean(v.map(x=>x[0])),mean(v.map(x=>x[1])),def.higher)):'<span class="v2-na">—</span>'}</td>`}).join("");
  const foot=others.length?`<tfoot><tr><td>All Scenario average differential vs ${esc(b.label)}<small>全情境平均差異（相對 ${esc(b.label)}）</small></td>${avg}</tr></tfoot>`:"";
  return `<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>${esc(o.rowHead||"Input")}</th>${series.map(s=>`<th class="l"><i class="v2-sw" style="background:${s.color}"></i>${esc(s.label)}<small>${esc(def.unit)}</small></th>`).join("")}</tr></thead><tbody>${rows}</tbody>${foot}</table></div>`;
 }
 // trend check: with a longer input, latency (TTFT / TPOT) should not fall and throughput should not rise (> 25 %). Only for charts whose x axis is the input length (4K, 8K ...).
 function anomalies(o){
  const {k,def,groups,series,get}=o;if(!groups.every(g=>/^\d+K$/.test(g.label)))return "";
  const out=[];
  series.forEach(se=>{for(let i=1;i<groups.length;i++){
   const a=get(se.key,groups[i-1]),b=get(se.key,groups[i]);if(!a||!b||!Number.isFinite(a[k])||!Number.isFinite(b[k]))continue;
   const odd=def.higher?b[k]>a[k]*1.25:b[k]<a[k]*0.75;
   if(odd)out.push(`<p class="bv-warn">⚠ ${esc(String(se.label).replace(/^Intel /,"").replace(/ AMD$/,""))}: ${esc(def.short)} at ${esc(groups[i].label)} (${fmt(k,b[k])}) is ${def.higher?"higher":"lower"} than at ${esc(groups[i-1].label)} (${fmt(k,a[k])}) — unexpected, check the repeats<small class="zhs">異常：${esc(groups[i].label)} 比 ${esc(groups[i-1].label)} 還${def.higher?"高":"低"}，請檢查逐次數值</small></p>`)}});
  return out.join("");
 }
 /* one metric block: title + (badge · conclusion · legend) + chart + table */
 function block(o){
  const d=o.def,chart=charts(o);
  const legend=o.series.map((s,j)=>o.dodge?`<span><b style="color:${s.color};font-size:18px;line-height:1">${["●","■","▲","◆"][j%4]}</b>${esc(s.label)}</span>`:`<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("");
  const head=`<h3 class="bv-h">${esc(d.short).replace("Decode",'<em class="bv-dec">Decode</em>')}<span class="zh-i">${esc(d.zh)}${o.context?"｜"+esc(o.context):""}</span></h3>${MEAN[o.k]?`<p class="bv-mean" title="${esc(MEAN[o.k][2])}">${esc(MEAN[o.k][0])}<small class="zhs">${esc(MEAN[o.k][1])}</small></p>`:""}
   <p class="v2-line"><span class="v2-dir ${d.higher?"hi":"lo"}">${d.higher?"↑ 越高越好":"↓ 越低越好"}</span><span>${o.baseline?"":esc(message(o))}</span><span class="v2-legend2">${legend}</span></p>`;
  if(!chart)return `<div class="bv-block">${head}<p class="v2-fine st-empty">這個組合目前沒有任何資料。</p></div>`;
  return `<div class="bv-block">${head}<div class="v2-chart">${chart}</div>${o.noWarn?"":anomalies(o)}<div class="bv-foot">${o.noSummary?"<span></span>":`<p class="bv-sum">${summary(o)}</p>`}<button type="button" class="bv-more" aria-expanded="false">Full values<small class="zhs">完整數值</small> ▾</button></div><div class="bv-detail" hidden><h3 class="v2-sub3">${esc(d.short)} 數據<span class="zh-i">${esc(o.tableNote||"")}</span></h3>${table(o)}</div></div>`;
 }
/* one line under every metric title (David 2026-11-18): what the number means; the full formula is in the hover */
 const MEAN={
  ttft_s:["Time from sending the request to the first word (long inputs: mostly prefill). Lower is better.","首字延遲：從送出請求到收到第一個字的秒數（長輸入主要花在預填）。越低越好。","TTFT = first word received - request sent (s)"],
  tpot_ms:["After the first word, the average ms per generated word. Lower is better.","每個字的間隔：第一個字之後，平均每產生一個字要幾毫秒。越低越好。","TPOT = (finish - first word) / (output tokens - 1) (ms); measured by the client unless the page says otherwise"],
  decode_only_tps:["1000 ÷ TPOT: words per second per request, without the first-word wait. Higher is better.","純產生速度：1000 ÷ TPOT，每個請求每秒產生幾個字，不含首字等待。越高越好。","Decode TPS = 1000 / TPOT (tok/s), per request - the inverse of TPOT, not summed over requests"],
  normalized_tps:["Output words of one request ÷ its total time (first-word wait included). Higher is better.","每請求每秒輸出：這個請求的輸出字數 ÷ 總花費時間（含首字等待）。越高越好。","Normalized TPS = aggregate TPS / NP"],
  aggregate_tps:["Output words of all requests ÷ time from the first request sent to the last finished (wait included). Higher is better.","合計每秒輸出：全部請求的輸出字數 ÷ 從第一個請求送出到最後一個完成的時間（含首字等待）。越高越好。","Aggregate TPS = sum of output tokens / (last done - first start)"]};
 MEAN.norm_tps=MEAN.normalized_tps;
 const DEC_DEF={short:"TPS (Decode only)",zh:"純產生速度（不含首字等待）",unit:"tok/s",higher:true};
 /* every page that shows TPOT also gets TPS (Decode only) = 1000 / TPOT per request (empty or 0 TPOT: no value, never estimated) */
 function withDecode(list){
  if(list.some(o=>o.k==="decode_only_tps"))return list;
  const out=[];
  list.forEach(o=>{
   out.push(o);
   if(o.k!=="tpot_ms")return;
   const get=(key,g)=>{const r=o.get(key,g),t=r&&Number(r.tpot_ms);return Number.isFinite(t)&&t>0?{...r,decode_only_tps:1000/t,ttft_over_180s:false}:null};
   out.push({...o,k:"decode_only_tps",def:DEC_DEF,get,tableNote:(o.tableNote?o.tableNote+"；":"")+"TPOT is client-measured on B60 / AISO1 / GB10 and server-reported for B70 (llama.cpp, vLLM, SGLang): Decode TPS is not directly comparable across machines. TPOT 定義因機器而異，Decode TPS 不可跨機器直接比較。"});
  });
  return out;
 }
 function blocks(list){
  list=withDecode(list);
  const isTps=o=>/^(norm|normalized|aggregate|decode_only)_tps$/.test(o.k),isLat=o=>o.k==="ttft_s"||o.k==="tpot_ms";
  const tps=list.filter(isTps),iN=list.findIndex(o=>/^(norm|normalized)_tps$/.test(o.k)),iA=list.findIndex(o=>o.k==="aggregate_tps");
  const sh=iN>=0&&iA>=0&&list[iN].baseline&&list[iA].baseline&&summary(list[iN])&&summary(list[iN])===summary(list[iA])?summary(list[iN]):null;
  const grp=(title,zh,body,sum)=>`<div class="bv-group"><div class="bv-tps"><h3 class="bv-h">${title}<span class="zh-i">${zh}</span></h3>${sum?`<p class="bv-sum">${sum}</p>`:""}</div>${body}</div>`;
  const lat=list.filter(isLat);
  let out="",doneLat=false,doneTps=false;
  list.forEach((o,i)=>{
   if(isLat(o)){if(!doneLat){doneLat=true;out+=grp("Latency","延遲",lat.map(x=>block(x)).join(""))}}
   else if(isTps(o)){if(!doneTps){doneTps=true;out+=grp("TPS","每秒輸出 token",tps.map((x,j)=>sh?block({...x,noSummary:true,noWarn:j>0}):block(x)).join(""),sh)}}
   else out+=block(o)});
  return out;
 }
 // one delegated handler for every chart block on the page: the button (bottom-right of the chart) shows / hides the data table
 document.addEventListener("click",e=>{const btn=e.target.closest&&e.target.closest(".bv-more");if(!btn)return;
  const box=btn.closest(".bv-block"),det=box&&box.querySelector(".bv-detail");if(!det)return;
  const open=det.hidden;det.hidden=!open;btn.setAttribute("aria-expanded",String(open));btn.innerHTML=open?'Hide values<small class="zhs">收合數值</small> ▴':'Full values<small class="zhs">完整數值</small> ▾'});
 return {block,blocks,esc,fmt,gain,pct,lineSvg,charts};
})();
