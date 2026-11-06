"use strict";
/* Grafana-style dashboard for the B60 Stress Test page.
   Data-only view: nothing is estimated; a missing framework/model/scenario stays blank. */
window.BD=(function(){
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const FWCOL={sglang:"#4fd1b0",vllm:"#8f9bff",llamacpp:"#ff8a4c"};
const fmt=(k,v)=>!Number.isFinite(v)?"—":(k==="ttft_s"&&v<10?v.toFixed(2):v>=1000?Math.round(v).toLocaleString("en-US"):v.toFixed(1));
const kn=n=>`${n/1024}K`;
const MET={
 ttft_s:{t:"TTFT 首字延遲",u:"s",tip:"第一個非空文字 SSE 到達時間 − 請求開始；越低越好。≥180 s 仍為 Technical PASS。"},
 tpot_ms:{t:"TPOT 字間隔",u:"ms/token",tip:"1000×(stream_done − first_content)/(輸出 token − 1)；越低越好。"},
 decode_tps:{t:"TPS (Normalized) 每請求輸出速度",u:"tok/s",tip:"Aggregate ÷ NP，每個請求自己的速度；越高越好。"},
 aggregate_tps:{t:"TPS (Aggregate) 合計輸出速度",u:"tok/s",tip:"總輸出 token ÷（最後 stream_done − 第一個 request_start），含首字等待；越高越好。"}};
let S=null,model=null,hooks=[];

function nice(max){
 const raw=(max||1)/4,mag=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/mag,step=(n<=1?1:n<=2?2:n<=5?5:10)*mag,top=Math.ceil((max||1)/step)*step,ticks=[];
 for(let v=0;v<=top+step/1e6;v+=step)ticks.push(v);
 return{top,ticks};
}
const runs=(fk,mk)=>(S.DATA[fk]?S.DATA[fk].b60_runs:[]).filter(r=>r.model===mk);

function statusRow(){
 const tiles=S.REG.models.flatMap(m=>S.REG.frameworks.map(f=>{
  const rs=runs(f.key,m.key),nr=((S.DATA[f.key]||{}).not_run||[]).find(x=>x.model===m.key),total=9;
  let cls="gd-ok",txt=`${rs.length}/${total} PASS`;
  if(rs.length<total){const r=(nr&&nr.reason)||"待測";const skip=/^SKIP/i.test(r),fail=!skip&&/STARTUP|FAIL/i.test(r);cls=fail?"gd-bad":"gd-off";txt=fail?"STARTUP_FAIL":skip?"SKIP_SOURCE":"待測"}
  return `<div class="gd-tile ${cls}" title="${esc(nr?nr.reason:txt)}"><b>${esc(f.label)}</b><span>${esc(m.name)}</span><em>${esc(txt)}</em></div>`}));
 return `<section class="gd-panel gd-wide"><header><h3>測試狀態（框架 × 模型）</h3><i class="gd-info" title="綠 = 9/9 個情境 PASS；紅 = 啟動失敗，沒有成績；灰 = 跳過或待測。">ⓘ</i></header><div class="gd-tiles">${tiles.join("")}</div></section>`;
}

function barPanel(k,title,tip,thr){
 const list=S.REG.models.flatMap(m=>S.REG.frameworks.map(f=>{const rs=runs(f.key,m.key);return rs.length?{name:`${m.name} (${f.label})`,fk:f.key,v:Math.max(...rs.map(r=>r[k]))}:null})).filter(Boolean).sort((a,b)=>b.v-a.v);
 const max=Math.max(...list.map(x=>x.v),1);
 const rows=list.map(x=>{const red=thr&&x.v>=thr;return `<div class="gd-bar"><span class="gd-bl" title="${esc(x.name)}">${esc(x.name)}</span><div class="gd-bt"><i style="width:${Math.max(1,x.v/max*100)}%;background:${red?"#c4162a":FWCOL[x.fk]}"></i></div><b style="color:${red?"#ff7383":"#f2f4f8"}">${fmt(k,x.v)}<small>${k==="ttft_s"?"s":"tok/s"}</small></b></div>`}).join("");
 return `<section class="gd-panel"><header><h3>${esc(title)}</h3><i class="gd-info" title="${esc(tip)}">ⓘ</i></header><div class="gd-bars">${rows||'<p class="gd-empty">無資料</p>'}</div></section>`;
}

function tsPanel(k,scen,series,id){
 const m=MET[k],get=(fk,s)=>{const r=(S.DATA[fk]?S.DATA[fk].b60_runs:[]).find(r=>r.model===model&&r.np===s.np&&r.input===s.i);return r?r[k]:null};
 const vals=series.map(s=>scen.map(sc=>get(s.key,sc)));
 const all=vals.flat().filter(Number.isFinite),W=620,H=250,L=52,R=14,T=14,B=52,n=scen.length;
 const {top,ticks}=nice(Math.max(...all,0.0001));
 const x=i=>L+(W-L-R)*(n>1?i/(n-1):.5),y=v=>T+(H-T-B)*(1-v/top);
 let g=ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" class="gd-grid"/><text x="${L-8}" y="${y(t)+4}" class="gd-ax" text-anchor="end">${t>=1000?(t/1000)+"K":+t.toFixed(2)}</text>`).join("");
 let xl="",prev=null;
 scen.forEach((sc,i)=>{xl+=`<text x="${x(i)}" y="${H-B+16}" class="gd-ax" text-anchor="middle">${kn(sc.i)}</text>`;if(sc.np!==prev){const grp=scen.map((q,j)=>q.np===sc.np?j:-1).filter(j=>j>=0);xl+=`<text x="${(x(grp[0])+x(grp[grp.length-1]))/2}" y="${H-B+34}" class="gd-ax gd-np" text-anchor="middle">NP${sc.np}</text>`;if(prev!==null)xl+=`<line x1="${(x(i)+x(i-1))/2}" x2="${(x(i)+x(i-1))/2}" y1="${T}" y2="${H-B}" class="gd-sep"/>`;prev=sc.np}});
 let lines="";
 series.forEach((s,si)=>{let seg=[];const flush=()=>{if(seg.length)lines+=`<polyline points="${seg.map(p=>p.join(",")).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;seg=[]};
  vals[si].forEach((v,i)=>{if(Number.isFinite(v)){seg.push([x(i).toFixed(1),y(v).toFixed(1)]);lines+=`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}"/>`}else flush()});flush()});
 hooks.push({id,scen,series,vals,k,x:i=>x(i),W,H,L,R});
 const legend=series.map((s,si)=>{const v=vals[si].filter(Number.isFinite);return `<tr><td><i class="gd-sw" style="background:${s.color}"></i>${esc(s.label)}</td><td>${v.length?fmt(k,v[v.length-1]):"—"}</td><td>${v.length?fmt(k,Math.max(...v)):"—"}</td></tr>`}).join("");
 const empty=!all.length;
 return `<section class="gd-panel"><header><h3>${esc(m.t)}<small>${esc(m.u)}</small></h3><i class="gd-info" title="${esc(m.tip)}">ⓘ</i></header>
 <div class="gd-body"><div class="gd-plotwrap">${empty?'<p class="gd-empty">此模型在這三個框架都沒有成績</p>':`<svg id="${id}" class="gd-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.t)}">${g}${xl}${lines}<line class="gd-cross" y1="${T}" y2="${H-B}" x1="0" x2="0" style="display:none"/></svg><div class="gd-tip" hidden></div>`}</div>
 <table class="gd-leg"><thead><tr><th>Name</th><th>Last *</th><th>Max</th></tr></thead><tbody>${legend}</tbody></table></div></section>`;
}

function wire(){
 hooks.forEach(h=>{const svg=document.getElementById(h.id);if(!svg)return;const tip=svg.parentNode.querySelector(".gd-tip"),cross=svg.querySelector(".gd-cross");
  const hide=()=>{tip.hidden=true;cross.style.display="none"};
  svg.addEventListener("mouseleave",hide);
  svg.addEventListener("mousemove",e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*h.W;let bi=0,bd=1e9;h.scen.forEach((s,i)=>{const d=Math.abs(h.x(i)-px);if(d<bd){bd=d;bi=i}});
   const sc=h.scen[bi];cross.setAttribute("x1",h.x(bi));cross.setAttribute("x2",h.x(bi));cross.style.display="";
   tip.innerHTML=`<b>NP${sc.np} · ${kn(sc.i)}</b>`+h.series.map((s,si)=>`<div><i class="gd-sw" style="background:${s.color}"></i>${esc(s.label)}<em>${fmt(h.k,h.vals[si][bi])}</em></div>`).join("");
   tip.hidden=false;const wrap=svg.parentNode.getBoundingClientRect(),left=(e.clientX-wrap.left)+14;tip.style.left=Math.min(left,wrap.width-tip.offsetWidth-4)+"px";tip.style.top=Math.max(0,e.clientY-wrap.top-20)+"px"})});
}

function render(){
 hooks=[];
 const p=(S.DATA.sglang||S.DATA.vllm||S.DATA.llamacpp).profile;
 const scen=p.np.flatMap(np=>p.input_tokens.map(i=>({np,i})));
 const series=S.REG.frameworks.map(f=>({key:f.key,label:f.label,color:FWCOL[f.key]}));
 const mname=(S.REG.models.find(m=>m.key===model)||{}).name||model;
 const vars=S.REG.models.map(m=>`<button type="button" class="${m.key===model?"on":""}" data-m="${m.key}">${esc(m.name)}</button>`).join("");
 const html=`<div class="gd-top"><nav class="gd-crumb" aria-label="Dashboard path">Home <i>›</i> Dashboards <i>›</i> Stress Test <i>›</i> <b>Intel B60 · V4</b></nav><div class="gd-vars"><span>Model</span>${vars}</div></div>
 <div class="gd-grid2">${statusRow()}${barPanel("aggregate_tps","TPS (Aggregate) 峰值（各模型 × 框架）","每個模型 × 框架在 9 個情境中的最高 Aggregate TPS；越高越好。")}${barPanel("ttft_s","TTFT 最大值（各模型 × 框架）","每個模型 × 框架在 9 個情境中最長的首字延遲；紅色為 ≥ 180 秒，仍為 Technical PASS。",180)}</div>
 <h3 class="gd-row">${esc(mname)} · 同機器、同 NP／Input／Output／Repeat · 橫軸 = 情境（NP × Input）</h3>
 <div class="gd-grid2">${Object.keys(MET).map((k,i)=>tsPanel(k,scen,series,"gdp"+i)).join("")}</div>
 <p class="gd-foot">Last * = 最後一個有成績的情境（NP5 / 16K）；Max = 9 個情境中的最大值。沒有成績的框架不畫線也不補值。這是各情境的平均值（3 次重複），不是時間序列。</p>`;
 S.el.innerHTML=html;
 S.el.querySelectorAll(".gd-vars button").forEach(b=>b.onclick=()=>{model=b.dataset.m;render()});
 wire();
}
return{init(o){S=o;model=S.REG.models.some(m=>m.key==="Gemma31")?"Gemma31":S.REG.models[0].key;render()}};
})();
