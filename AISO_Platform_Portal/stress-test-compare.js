"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const val=(k,v)=>k==="ttft_s"&&v<10?num(v,2):num(v,1);
let REG,DATA={},FW,MODEL,NP;   // DATA[machine][framework] = dataset
const runsOf=(mach,fw)=>{const ds=DATA[mach]&&DATA[mach][fw];return ds?ds.runs:[]};
const get=(mach,fw,m,np,i)=>runsOf(mach,fw).find(r=>r.model===m&&r.np===np&&r.input===i);
const fwLabel=k=>REG.frameworks.find(f=>f.key===k).label;
const modelName=k=>REG.models.find(m=>m.key===k).name;
const sel=()=>runsOf; 
const cellRuns=(mach)=>runsOf(mach,FW).filter(r=>r.model===MODEL&&r.np===NP);
const inputsNow=()=>{const s=new Set(REG.machines.flatMap(m=>cellRuns(m.key).map(r=>r.input)));return s.size?[...s].sort((a,b)=>a-b):[4096,8192,16384]};
const npsAll=()=>[...new Set(REG.machines.flatMap(m=>REG.frameworks.flatMap(f=>runsOf(m.key,f.key).map(r=>r.np))))].sort((a,b)=>a-b);

function niceStep(range){const raw=(range||1)/4,mag=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].find(s=>s*mag>=raw)*mag}
function chart(k,width){
 const d=METRICS[k],ins=inputsNow(),n=ins.length,ser=REG.machines,L=64,R=12,T=34,B=48,H=300,ih=H-T-B,W=Math.max(width,n*150+L+R),gw=(W-L-R)/n,bw=Math.min(40,(gw-12)/ser.length);
 const vals=ins.flatMap(i=>ser.map(s=>get(s.key,FW,MODEL,NP,i)).filter(Boolean).map(r=>r[k]));
 if(!vals.length)return '<p class="v2-fine st-empty">此框架、模型、NP 三台機器都還沒有資料。</p>';
 const top=Math.max(...vals),step=niceStep(top),y=v=>T+ih-v/top*ih;
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){const yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="${v===0?"gl0":"gl"}"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${num(v,step<1?1:0)}</text>`}
 g+=`<text transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${d.unit}</text>`;
 ins.forEach((inp,q)=>{
  const x0=L+gw*q+(gw-bw*ser.length-2*(ser.length-1))/2;
  ser.forEach((s,j)=>{const r=get(s.key,FW,MODEL,NP,inp),x=x0+j*(bw+2);
   if(!r){g+=`<text class="bl up2" x="${x+bw/2}" y="${y(0)-6}" text-anchor="middle">—</text>`;return}
   const v=r[k],y1=y(v),red=k==="ttft_s"&&r.ttft_over_180s;
   g+=`<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1,y(0)-y1)}" rx="2" fill="${s.color}"><title>${esc(s.label)} · ${fwLabel(FW)} · ${esc(modelName(MODEL))} · NP${NP} · ${tok(inp)}: ${val(k,v)} ${d.unit}</title></rect><text class="bl ${red?"dn":"up2"}" x="${x+bw/2}" y="${y1-5}" text-anchor="middle">${v>=100?num(v,0):val(k,v)}</text>`});
  g+=`<text x="${L+gw*q+gw/2}" y="${H-24}" text-anchor="middle" class="xl">${kn(inp)}</text><text x="${L+gw*q+gw/2}" y="${H-8}" text-anchor="middle" class="xl2">${tok(inp)}</text>`;
 });
 return `<div class="v2-chartwrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${d.short}">${g}</svg></div>`;
}
const availability=()=>REG.machines.map(m=>{const n=cellRuns(m.key).length;return n?`<span><i style="background:${m.color}"></i>${esc(m.label)}（${n} 筆）</span>`:`<span class="st-wait"><i style="background:${m.color};opacity:.35"></i>${esc(m.label)}：此組合無資料</span>`}).join("");
function btn(group,items,cur){return items.map(([k,l,has])=>`<button type="button" role="tab" class="${String(k)===String(cur)?"on":""}${has?" has":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join("")}
const anyData=(fw,m,np)=>REG.machines.some(x=>runsOf(x.key,fw).some(r=>(!m||r.model===m)&&(!np||r.np===np)));
function renderControls(){
 $s("cmpFw").innerHTML=btn("fw",REG.frameworks.map(f=>[f.key,f.label,anyData(f.key)]),FW);
 $s("cmpModel").innerHTML=btn("model",REG.models.map(m=>[m.key,m.name,anyData(FW,m.key)]),MODEL);
 $s("cmpNp").innerHTML=btn("np",npsAll().map(n=>["" +n,"NP"+n,anyData(FW,MODEL,n)]),NP);
 document.querySelectorAll("#secPick button").forEach(b=>b.onclick=()=>{const g=b.dataset.g;if(g==="fw")FW=b.dataset.k;if(g==="model")MODEL=b.dataset.k;if(g==="np")NP=+b.dataset.k;renderAll()});
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100);
 $s("stNote").textContent=`目前選擇：${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP}`;
 $s("stMetrics").innerHTML=`<p class="v2-fine cmp-av">${availability()}</p>`+Object.entries(METRICS).map(([k,d])=>`<article class="v2-chart"><h3>${d.short}<small>${d.zh} · ${d.higher?"越高越好 ↑":"越低越好 ↓"}</small></h3><div class="v2-legend2">${REG.machines.map(m=>`<span><i style="background:${m.color}"></i>${esc(m.label)}</span>`).join("")}</div>${chart(k,w)}</article>`).join("");
}
function renderTable(){
 const ins=inputsNow(),c=(r,k)=>`<td>${r?(k==="aggregate_tps"?num(r[k],1):val(k,r[k])):"—"}</td>`;
 const sub=`<th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th>`;
 const rows=ins.map(i=>`<tr><td>${kn(i)}</td>${REG.machines.map(m=>{const r=get(m.key,FW,MODEL,NP,i);return ["ttft_s","tpot_ms","norm_tps","aggregate_tps"].map(k=>c(r,k)).join("")}).join("")}</tr>`).join("");
 $s("stTable").innerHTML=`<thead><tr><th rowspan="2">Input</th>${REG.machines.map(m=>`<th colspan="4" class="l">${esc(m.label)}</th>`).join("")}</tr><tr>${REG.machines.map(()=>sub).join("")}</tr></thead><tbody>${rows}</tbody>`;
 $s("stTableSub").textContent=`${fwLabel(FW)} · ${modelName(MODEL)} · NP${NP} · 3 次重複平均；「—」= 該機器此組合沒有資料。`;
}
function renderCover(){
 const desc=(mach,fw,m)=>{const rs=runsOf(mach,fw).filter(r=>r.model===m);if(!rs.length)return '<span class="st-wait">無資料</span>';
  const nps=[...new Set(rs.map(r=>r.np))].sort((a,b)=>a-b),ins=rs.map(r=>r.input);return `NP${nps.join("/")} · ${kn(Math.min(...ins))}–${kn(Math.max(...ins))} · ${rs.length} 筆`};
 const rows=REG.frameworks.flatMap(f=>REG.models.map((m,i)=>`<tr>${i===0?`<td rowspan="${REG.models.length}" class="st-model">${esc(f.label)}</td>`:""}<td>${esc(m.name)}</td>${REG.machines.map(x=>`<td>${desc(x.key,f.key,m.key)}</td>`).join("")}</tr>`)).join("");
 $s("stCover").innerHTML=`<thead><tr><th>Framework</th><th>Model</th>${REG.machines.map(m=>`<th class="l">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}
function renderCmp(){
 const b60=DATA.b60&&(DATA.b60.sglang||DATA.b60.vllm),b70=DATA.b70&&DATA.b70.llamacpp,a=b60?b60.profile:null,b=b70?b70.profile:null,wait='<span class="st-wait">待核</span>';
 const r=(k,x,y,z)=>`<tr><td class="st-model">${k}</td><td>${x}</td><td>${y}</td><td class="st-pending">${z||wait}</td></tr>`;
 const fwHas=m=>REG.frameworks.filter(f=>runsOf(m,f.key).length).map(f=>f.label).join(" / ")||"—";
 $s("stCmp").innerHTML=`<thead><tr><th>項目</th><th class="l">Intel B60</th><th class="l">Intel B70</th><th class="a">AISO1 AMD</th></tr></thead><tbody>
 ${r("NP 並發",a.np.join(" / "),b.np.join(" / "))}
 ${r("Input 輸入",a.input_tokens.map(kn).join(" / "),b.input_tokens.map(kn).join(" / "))}
 ${r("Output / Repeat",`${tok(a.output_tokens)} / ${a.repeat} 次平均`,`${tok(b.output_tokens)} / ${b.repeat} 次平均`)}
 ${r("硬體配備",`${a.vram_total_gb} GB（${a.vram_layout.replace(" x "," × ")}）· TP${a.tp}`,`${b.vram_total_gb} GB（${b.vram_layout.replace(" x "," × ")}）`)}
 ${r("Context 上限",`${tok(a.context_length)} tokens`,`${tok(b.context_per_request)} tokens / request`)}
 ${r("已有成績的框架",fwHas("b60"),fwHas("b70"),fwHas("aiso1")==="—"?"尚無成績":fwHas("aiso1"))}</tbody>`;
}
function renderAll(){renderControls();renderMetrics();renderTable()}
Promise.all([fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry "+r.status);return r.json()})]).then(([reg])=>{
 REG=reg;
 return Promise.all(reg.datasets.map(x=>fetch(x.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(x.file+" "+r.status);return r.json()}).then(d=>{
  const runs=(d[x.runs_key]||[]).map(r=>({...r,norm_tps:r.aggregate_tps/r.np}));
  (DATA[x.machine]=DATA[x.machine]||{})[x.framework]={profile:d.profile,runs,evidence_until:d.evidence_until};
 })));
}).then(()=>{
 // default: a combination that at least two machines share, else the first one with any data
 const combos=REG.frameworks.flatMap(f=>REG.models.flatMap(m=>npsAll().map(n=>[f.key,m.key,n])));
 const cnt=([f,m,n])=>REG.machines.filter(x=>runsOf(x.key,f).some(r=>r.model===m&&r.np===n)).length;
 const best=combos.find(c=>cnt(c)>=2)||combos.find(c=>cnt(c)>=1)||combos[0];
 [FW,MODEL,NP]=best;
 renderCmp();renderCover();renderAll();
 const last=Object.values(DATA).flatMap(o=>Object.values(o)).map(d=>d.evidence_until).sort().pop();
 $s("stFoot").textContent=`資料更新至 ${last}；新增資料集只需在 data/benchmark-registry.json 登錄，本頁自動帶入。`;
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
