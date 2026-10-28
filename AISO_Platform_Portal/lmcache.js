"use strict";
let lmData;
const $lm=id=>document.getElementById(id);
const lmEsc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const th=(en,zh)=>`<th>${en}${zh?`<span class="zh-i">${zh}</span>`:""}</th>`;
const lmNum=n=>Number.isFinite(n)?n.toFixed(2):"—";
const lmPct=n=>Number.isFinite(n)?`${n>0?"+":""}${n.toFixed(1)}%`:"—";
const MODES={cpu:"CPU",ssd:"SSD"};
const mean=(rs,k)=>rs.reduce((s,r)=>s+r[k],0)/rs.length;
function groupsFor(run,scenario){
 const selected=run.rows.filter(r=>r.scenario===scenario);
 return [2048,4096].flatMap(t=>[1,5].map(c=>{
  const rows=selected.filter(r=>r.target_tokens===t&&r.concurrency===c);
  const cold=rows.filter(r=>r.phase==="cold"),warm=rows.filter(r=>r.phase==="warm");
  const g={t,c,cold:mean(cold,"ttft_p50_ms"),warm:mean(warm,"ttft_p50_ms"),ctps:mean(cold,"output_tps"),wtps:mean(warm,"output_tps"),hit:100*warm.reduce((s,r)=>s+r.cache_hits,0)/warm.reduce((s,r)=>s+r.cache_queries,0)};
  g.red=100*(1-g.warm/g.cold);g.tpsGain=100*(g.wtps/g.ctps-1);
  return g;
 }));
}
const bar=(label,value,max,cls)=>`<div class="lm-bar ${cls}"><span>${label}</span><i><u style="width:${Math.max(2,100*value/max).toFixed(1)}%"></u></i><b>${lmNum(value)} ms</b></div>`;
const chip=(pct,label)=>`<em class="lm-chip ${pct>=0?"good":"bad"}">${label} ${lmPct(-pct)}</em>`;

const range=(vals,low)=>{const a=Math.min(...vals),b=Math.max(...vals),c=v=>{const r=Math.round(v);return `<span class="${r===0?"":(low?r<0:r>0)?"gain":"loss"}">${lmPctI(v)}</span>`};return Math.round(a)===Math.round(b)?c(a):`${c(a)} ~ ${c(b)}`};
const lmPctI=n=>`${n>0?"+":n<0?"−":""}${Math.abs(Math.round(n))}%`;
let ptT=4096,ptC=10;
function renderPoints(){
 const S=lmData.summary.rows,g=(b,st)=>S.find(r=>r.backend===b&&r.context_target===ptT&&r.concurrency===ptC&&r.stage===st);
 document.querySelectorAll("#lmPtT [data-t]").forEach(b=>b.setAttribute("aria-checked",String(+b.dataset.t===ptT)));
 document.querySelectorAll("#lmPtC [data-c]").forEach(b=>b.setAttribute("aria-checked",String(+b.dataset.c===ptC)));
 const ttft=r=>r.ttft_p50_ms,tps=r=>r.batch_output_tps;
 const ba=(label,f,from,to,low)=>{const a=f(from),b=f(to),p=100*(b/a-1),cls=Math.abs(p)<1?"":(low?p<0:p>0)?"gain":"loss";return `<div class="lm-ba"><small>${label}</small><b><u>${fmtV(a)}</u><i>→</i>${fmtV(b)}</b><em class="${cls}">${lmPctI(p)}</em></div>`};
 const tile=(h,zh,body)=>`<section><h4>${h}<span class="zh-i">${zh}</span></h4>${body}</section>`;
 const row=(n,title,sub,a,b)=>`<article class="lm-point"><div class="lm-point-h"><i>${n}</i><h3>${title}</h3><p>${sub}</p></div><div class="lm-point-m">${a}${b}</div></article>`;
 const W={b:g("baseline","warm"),c:g("cpu","warm"),s:g("ssd","warm")};
 $lm("lmPoints").innerHTML=
  row(1,"LMCache vs Baseline","沒開 LMCache → 開了（Warm）",
   tile("TTFT ms","越低越好",ba("Baseline → CPU",ttft,W.b,W.c,true)+ba("Baseline → SSD",ttft,W.b,W.s,true)),
   tile("Output TPS tok/s","越高越好",ba("Baseline → CPU",tps,W.b,W.c,false)+ba("Baseline → SSD",tps,W.b,W.s,false)))+
  row(2,"Cold → Warm","第一次問 → 第二次問",
   tile("TTFT ms","越低越好",["baseline","cpu","ssd"].map(k=>ba(BCOL[k][0]+" Cold → Warm",ttft,g(k,"cold"),g(k,"warm"),true)).join("")),
   tile("Output TPS tok/s","越高越好",["baseline","cpu","ssd"].map(k=>ba(BCOL[k][0]+" Cold → Warm",tps,g(k,"cold"),g(k,"warm"),false)).join("")))+
  row(3,"CPU vs SSD","快取放記憶體 → 放硬碟（Warm）",
   tile("TTFT ms","越低越好",ba("CPU → SSD",ttft,W.c,W.s,true)),
   tile("Output TPS tok/s","越高越好",ba("CPU → SSD",tps,W.c,W.s,false)));
}
$lm("lmPtT").onclick=e=>{const b=e.target.closest("[data-t]");if(!b||!lmData)return;ptT=+b.dataset.t;renderPoints()};
$lm("lmPtC").onclick=e=>{const b=e.target.closest("[data-c]");if(!b||!lmData)return;ptC=+b.dataset.c;renderPoints()};
const SERIES={cpu:{cold:["CPU Cold","#6b7380"],warm:["CPU Warm","#70d3a2"]},ssd:{cold:["SSD Cold","#5d7fa8"],warm:["SSD Warm","#7aaee8"]}};
const fmtV=v=>v===0?"0":v>=100?v.toFixed(0):v>=10?v.toFixed(1):v.toFixed(2);
const fmtT=v=>v>=100?v.toFixed(0):String(+v.toFixed(2));
function plot(title,unit,zh,labels,series,deltas,W=700,H=360){
 const L=56,R=12,T=34,B=56+18*deltas.length,pw=W-L-R,ph=H-T-B;
 const max=Math.max(...series.flatMap(s=>s.vals)),step=[1,2,2.5,5,10].map(m=>m*Math.pow(10,Math.floor(Math.log10(max/4)))).find(v=>max/v<=4.001)||max/4,top=Math.ceil(max/step)*step;
 const y=v=>T+ph-ph*v/top,gw=pw/labels.length,bw=Math.min(48,gw*.78/series.length),gap=bw*series.length;
 let g=`<text x="${L}" y="22" class="lm-t">${title}<tspan class="lm-z" dx="10">${zh}</tspan></text><text x="${W-R}" y="20" text-anchor="end" class="lm-u">${unit}</text>`;
 for(let v=0;v<=top+1e-9;v+=step)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="lm-grid"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" class="lm-ax">${fmtT(v)}</text>`;
 labels.forEach((lab,i)=>{
  const x0=L+gw*i+(gw-gap)/2;
  series.forEach((s,k)=>{const v=s.vals[i],x=x0+k*bw;g+=`<rect x="${x+2}" y="${y(v)}" width="${bw-4}" height="${T+ph-y(v)}" rx="4" fill="${s.color}"><title>${s.name} · ${lab}: ${fmtV(v)} ${unit}</title></rect><text x="${x+bw/2}" y="${y(v)-6}" text-anchor="middle" class="lm-v">${fmtV(v)}</text>`});
  g+=`<text x="${L+gw*i+gw/2}" y="${T+ph+22}" text-anchor="middle" class="lm-ax lm-x">${lab}</text>`;
  deltas.forEach((d,k)=>{const t=d.vals[i];g+=`<text x="${L+gw*i+gw/2}" y="${T+ph+42+k*18}" text-anchor="middle" class="lm-d ${t.good?"good":"bad"}">${d.name} ${t.text}</text>`});
 });
 return `<figure class="lm-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}</svg></figure>`;
}
function renderPlots(){
 const mode=$lm("lmMode").value,scenario=$lm("scenario").value,runs=lmData.runs;
 const modes=mode==="compare"?["cpu","ssd"]:[mode];
 const gs=Object.fromEntries(modes.map(m=>[m,groupsFor(runs[m],scenario)]));
 const labels=gs[modes[0]].map(g=>`~${g.t} / C${g.c}`);
 const series=(ck,wk)=>modes.flatMap(m=>[{name:SERIES[m].cold[0],color:SERIES[m].cold[1],vals:gs[m].map(g=>g[ck])},{name:SERIES[m].warm[0],color:SERIES[m].warm[1],vals:gs[m].map(g=>g[wk])}]);
 const dl=(f,lowerBetter)=>modes.map(m=>({name:MODES[m],vals:gs[m].map(g=>{const p=f(g);return {text:lmPctI(p),good:lowerBetter?p<=0:p>=0}})}));
 const legend=series("cold","warm").map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
 $lm("lmPlots").innerHTML=`<div class="lm-legend">${legend}</div><div class="lm-plot-row">${plot("TTFT","ms","越低越好",labels,series("cold","warm"),dl(g=>100*(g.warm/g.cold-1),true))}${plot("Output TPS","tok/s","越高越好",labels,series("ctps","wtps"),dl(g=>g.tpsGain,false))}</div>`;
}

function lines(title,sub,reps,series,labels,xl=r=>`Repeat ${r}`){
 const W=520,H=300,L=52,R=40,T=40,B=40,pw=W-L-R,ph=H-T-B;
 const all=series.flatMap(s=>s.vals),lo=Math.min(...all),hi=Math.max(...all),pad=(hi-lo||hi)*.18,min=Math.max(0,lo-pad),max=hi+pad;
 const x=i=>L+pw*(reps.length===1?.5:i/(reps.length-1)),y=v=>T+ph-ph*(v-min)/(max-min||1);
 let g=`<text x="${L}" y="22" class="lm-t">${title}<tspan class="lm-z" dx="8">${sub}</tspan></text>`;
 for(let k=0;k<=3;k++){const v=min+(max-min)*k/3;g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="lm-grid"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" class="lm-ax">${fmtV(v)}</text>`}
 reps.forEach((r,i)=>g+=`<text x="${x(i)}" y="${H-14}" text-anchor="middle" class="lm-x">${xl(r)}</text>`);
 series.forEach(s=>{
  g+=`<polyline fill="none" stroke="${s.color}" stroke-width="3" ${s.dash?'stroke-dasharray="7 5"':""} points="${s.vals.map((v,i)=>x(i)+","+y(v)).join(" ")}"/>`;
  s.vals.forEach((v,i)=>{g+=`<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="${s.color}"><title>${s.name} · Repeat ${reps[i]}: ${fmtV(v)}</title></circle>`;if(labels)g+=`<text x="${x(i)}" y="${y(v)+(s.warm?18:-10)}" text-anchor="middle" class="lm-v" fill="${s.color}">${fmtV(v)}</text>`});
 });
 return `<figure class="lm-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}</svg></figure>`;
}
function renderLines(){
 const mode=$lm("lmMode").value,scenario=$lm("scenario").value,key=$lm("lmBatchMetric").value,runs=lmData.runs;
 const modes=mode==="compare"?["cpu","ssd"]:[mode],reps=[1,2,3];
 const unit=key==="ttft_p50_ms"?"ms":"tok/s",zh=key==="ttft_p50_ms"?"越低越好":"越高越好";
 $lm("lmLines").innerHTML=[2048,4096].flatMap(t=>[1,5].map(c=>{
  const series=modes.flatMap(m=>["cold","warm"].map(ph=>({name:`${MODES[m]} ${ph}`,warm:ph==="warm",dash:m==="ssd",color:ph==="cold"?"#6fb4ff":"#ff9a4d",vals:reps.map(r=>runs[m].rows.find(x=>x.scenario===scenario&&x.target_tokens===t&&x.concurrency===c&&x.repeat===r&&x.phase===ph)[key])})));
  return lines(`~${t} / C${c}`,`${unit} · ${zh}${modes.length>1?" · 實線 CPU / 虛線 SSD":""}`,reps,series,modes.length===1);
 })).join("");
}

const BCOL={baseline:["Baseline","#9aa3b2"],cpu:["CPU","#70d3a2"],ssd:["SSD","#7aaee8"]};
const BC2={baseline:["Baseline","#6e7787","#c4ccd8"],cpu:["CPU","#3f8f6b","#70d3a2"],ssd:["SSD","#4a6d99","#7aaee8"]};
let lmC=10;
function renderBaseline(){
 const sm=lmData.summary;if(!sm)return;
 document.querySelectorAll("#lmConc [data-c]").forEach(b=>b.setAttribute("aria-checked",String(+b.dataset.c===lmC)));
 const ctx=[2048,4096],labels=ctx.map(t=>`~${t} tokens`),KS=["baseline","cpu","ssd"];
 const get=(k,t,st)=>sm.rows.find(r=>r.backend===k&&r.context_target===t&&r.concurrency===lmC&&r.stage===st);
 const ser=(f,keys=KS)=>keys.flatMap(k=>[{name:BC2[k][0]+" Cold",color:BC2[k][1],vals:ctx.map(t=>f(get(k,t,"cold")))},{name:BC2[k][0]+" Warm",color:BC2[k][2],vals:ctx.map(t=>f(get(k,t,"warm")))}]);
 const pc=(a,b,low)=>{const p=100*(a/b-1);return {text:lmPctI(p),good:low?p<=0:p>=0}};
 const dl=(f,low)=>KS.map(k=>({name:BC2[k][0]+" Cold→Warm",vals:ctx.map(t=>pc(f(get(k,t,"warm")),f(get(k,t,"cold")),low))})).concat(["cpu","ssd"].map(k=>({name:BC2[k][0]+" vs Baseline (Warm)",vals:ctx.map(t=>pc(f(get(k,t,"warm")),f(get("baseline",t,"warm")),low))})));
 const m=[["TTFT p50","ms","中位數 · 越低越好",r=>r.ttft_p50_ms,true],["TTFT p95","ms","偏慢的 5% 邊界 · 越低越好",r=>r.ttft_p95_ms,true],["TPOT p50","ms","每個字的間隔 · 越低越好",r=>r.tpot_p50_ms,true],["Output TPS","tok/s","越高越好",r=>r.batch_output_tps,false]];
 let html=m.map(([t,u,z,f,low])=>plot(t,u,z,labels,ser(f),dl(f,low),640,400)).join("");
 html+=plot("External Hit Ratio","%","越高越好",labels,ser(r=>r.external_hit_ratio_pct,["cpu","ssd"]),[],1300,300).replace('<figure class="lm-plot">','<figure class="lm-plot lm-wide">');
 $lm("lmBase").innerHTML=html;
 $lm("lmBaseLegend").innerHTML=KS.flatMap(k=>[[BC2[k][0]+" Cold",BC2[k][1]],[BC2[k][0]+" Warm",BC2[k][2]]]).map(([n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")+'<span class="zh-i">Baseline = 未開 LMCache</span>';
 $lm("lmBaseNote").textContent=`Shared prefix · 併發 ${lmC}。每組左邊 Cold（第一次問）、右邊 Warm（第二次問）；圖下方的百分比是 Cold→Warm 的變化，以及開 LMCache 後相對 Baseline 的變化。SSD 的實體 I/O 歸因仍待確認。SSD 設定：chunk 256 tokens · 磁碟上限 5 GB · LRU · 不使用 CPU 快取層。`;
}
$lm("lmConc").onclick=e=>{const b=e.target.closest("[data-c]");if(!b||!lmData)return;lmC=+b.dataset.c;renderBaseline()};

function renderReuse(){
 const rs=lmData.ssd_reuse_series,sm=lmData.summary;if(!rs)return;
 const stages=rs.stages,names={cold:"Cold",warm1:"Warm 1",warm2:"Warm 2",warm3:"Warm 3"},xl=r=>names[r];
 const base=(c,f)=>{const g=st=>sm.rows.find(r=>r.backend==="baseline"&&r.context_target===4096&&r.concurrency===c&&r.stage===st);return [f(g("cold")),f(g("warm")),f(g("warm")),f(g("warm"))]};
 const out=[];
 [[1,"C1"],[10,"C10"]].forEach(([c,k])=>{const L=rs.levels[k];
  [["TTFT p50","ms · 越低越好","ttft_p50_ms",r=>r.ttft_p50_ms],["Output TPS","tok/s · 越高越好","output_tps",r=>r.batch_output_tps]].forEach(([t,u,key,f])=>{
   out.push(lines(`${t} · ${k}`,`${u} · n=${L.n}`,stages,[{name:"Baseline（原始 A/B）",color:"#9aa3b2",dash:true,warm:false,vals:base(c,f)},{name:"SSD",color:"#7aaee8",warm:true,vals:L[key]}],true,xl));
  });});
 $lm("lmReuse").innerHTML=out.join("");
 $lm("lmReuseLegend").innerHTML='<span><i style="background:#7aaee8"></i>SSD</span><span><i style="background:#9aa3b2"></i>Baseline<span class="zh-i">原始 A/B 的 Cold / Warm</span></span>';
 const hit=k=>rs.levels[k].hit_pct.slice(1).map(v=>v.toFixed(1)+"%").join(" / ");
 $lm("lmReuseNote").textContent=`補充實驗：只有 SSD、~4096、C1 與 C10，每組 3 次。命中率 Warm 1/2/3：C1 ${hit("C1")}；C10 ${hit("C10")}。與前面的 A/B 結果分開看，不要合併。`;
}
function renderLM(){
 const mode=$lm("lmMode").value,scenario=$lm("scenario").value,runs=lmData.runs;
 const note=scenario==="no_reuse"?"No reuse 沒有可重用前綴（命中 0），Cold／Warm 的差異是系統暖機與波動，不是快取效果。":"";
 $lm("lmNote").textContent=note;$lm("lmNote").hidden=!note;
 let cards,head,body;
 if(mode==="compare"){
  const a=groupsFor(runs.cpu,scenario),b=groupsFor(runs.ssd,scenario);
  cards=a.map((g,i)=>{const s=b[i],max=Math.max(g.cold,g.warm,s.cold,s.warm);
   return `<article><header><b>~${g.t} / C${g.c}</b><span>TTFT ms · lower is better</span></header>${bar("CPU Cold",g.cold,max,"cpu")}${bar("CPU Warm",g.warm,max,"cpu warm")}${bar("SSD Cold",s.cold,max,"ssd")}${bar("SSD Warm",s.warm,max,"ssd warm")}<footer>${chip(g.red,"CPU TTFT")}${chip(s.red,"SSD TTFT")}<small>Warm TTFT：SSD ${lmPct(100*(s.warm/g.warm-1))} vs CPU</small></footer></article>`}).join("");
  head=`<tr>${th("Target / C")}${th("CPU Cold")}${th("CPU Warm")}${th("CPU Reduction","降幅")}${th("SSD Cold")}${th("SSD Warm")}${th("SSD Reduction","降幅")}${th("Warm TTFT SSD vs CPU")}${th("CPU Hit Rate","命中率")}${th("SSD Hit Rate","命中率")}</tr>`;
  body=a.map((g,i)=>{const s=b[i];return `<tr><th>~${g.t} / C${g.c}</th><td>${lmNum(g.cold)} ms</td><td>${lmNum(g.warm)} ms</td><td>${lmNum(g.red)}%</td><td>${lmNum(s.cold)} ms</td><td>${lmNum(s.warm)} ms</td><td>${lmNum(s.red)}%</td><td>${lmPct(100*(s.warm/g.warm-1))}</td><td>${lmNum(g.hit)}%</td><td>${lmNum(s.hit)}%</td></tr>`}).join("");
 }else{
  const gs=groupsFor(runs[mode],scenario);
  cards=gs.map(g=>{const max=Math.max(g.cold,g.warm);
   return `<article><header><b>~${g.t} / C${g.c}</b><span>TTFT ms · lower is better</span></header>${bar("Cold",g.cold,max,mode)}${bar("Warm",g.warm,max,mode+" warm")}<footer>${chip(g.red,"TTFT")}<em class="lm-chip ${g.tpsGain>=0?"good":"bad"}">Output TPS ${lmPct(g.tpsGain)}</em><em class="lm-chip hit">Hit rate ${lmNum(g.hit)}%</em></footer></article>`}).join("");
  head=`<tr>${th("Target / C")}${th("Cold TTFT")}${th("Warm TTFT")}${th("TTFT Reduction","降幅")}${th("Cold Output TPS")}${th("Warm Output TPS")}${th("TPS Change","變化")}${th("Warm Hit Rate","命中率")}</tr>`;
  body=gs.map(g=>`<tr><th>~${g.t} / C${g.c}</th><td>${lmNum(g.cold)} ms</td><td>${lmNum(g.warm)} ms</td><td>${lmNum(g.red)}%</td><td>${lmNum(g.ctps)}</td><td>${lmNum(g.wtps)}</td><td>${lmPct(g.tpsGain)}</td><td>${lmNum(g.hit)}%</td></tr>`).join("");
 }
 renderPlots();renderLines();$lm("lmCharts").innerHTML=cards;$lm("lmHead").innerHTML=head;$lm("lmSummary").innerHTML=body;
 const list=mode==="compare"?["cpu","ssd"]:[mode];
 $lm("lmRows").innerHTML=list.flatMap(m=>runs[m].rows.filter(r=>r.scenario===scenario).map(r=>`<tr><td>${MODES[m]}</td><td>${lmEsc(r.scenario)}</td><td>~${r.target_tokens}</td><td>${r.concurrency}</td><td>${r.repeat}</td><td>${lmEsc(r.phase)}</td><td>${lmNum(r.ttft_p50_ms)}</td><td>${lmNum(r.output_tps)}</td><td>${r.cache_hits} / ${r.cache_queries}</td></tr>`)).join("");
 $lm("lmStatus").textContent=list.map(m=>{const r=runs[m];return `${MODES[m]} ${r.run_id} · ${r.rows.length} 批次 · ${r.evidence_status==="REPORTED_PASS"?"REPORTED PASS":"完成（PASS 檢查結果未見）"}`}).join("　｜　")+"（原始證據待核對）";
}
["lmMode","scenario","lmBatchMetric"].forEach(id=>$lm(id).onchange=()=>{if(lmData)renderLM()});
fetch("data/lmcache-summary.json").then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(data=>{lmData=data;renderLM();renderPoints();renderBaseline();renderReuse();$lm("lmDownload").disabled=false}).catch(()=>{$lm("lmStatus").textContent="資料載入失敗，請重新整理。"});
$lm("lmDownload").onclick=()=>{if(!lmData)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lmData,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="lmcache-extended-summary.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
