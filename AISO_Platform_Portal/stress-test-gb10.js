"use strict";
/* GB10 single-machine page. Data: data/benchmark-gb10 (registry key "single_machines", machine "gb10").
   Long-context vLLM runs (8K–256K) written by scripts/ingest_gb10_longctx.py. One series (GB10); the x axis is the session context. */
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 normalized_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token",unit:"tok/s",higher:true}};
const SERIES=[{key:"gb10",label:"GB10 · vLLM",sum:"GB10",color:"#76b900"}];
const kn=n=>n>=1024?Math.round(n/1024)+"K":String(n);
let DS,NP,OUT,SET="ctx";   // SET: "ctx" = long-context runs (context = input + output); "ryan" = Ryan matrix (context = exact INPUT tokens)
const hasRyan=()=>DS.gb10_runs.some(r=>r.set==="ryan");
const runs=()=>DS.gb10_runs.filter(r=>(r.set||"ctx")===SET);
const npKey=r=>(r.phase==="smoke"?"s":"")+r.np;
const nps=()=>[...new Set(runs().map(npKey))].sort((a,b)=>(b[0]==="s")-(a[0]==="s")||parseInt(a.replace("s",""))-parseInt(b.replace("s","")));   // Smoke first (leftmost), then NP1, NP5 ... in test order
const outs=k=>[...new Set(runs().filter(r=>npKey(r)===k).map(r=>r.output))].sort((a,b)=>a-b);
const CMP="cmp";                       // "Compare outputs" view (David 2026-11-18): one chart, one line per output length (64 / 512 / 1024)
const OUTCOLORS=["#76b900","#8ab4ff","#d8c779","#e0a040"];
const sel=()=>runs().filter(r=>npKey(r)===NP&&(OUT===CMP||r.output===OUT));
const okRuns=(o,c)=>runs().filter(r=>npKey(r)===NP&&r.output===o&&r.context===c&&r.status==="PASS");
const ctxs=()=>[...new Set(sel().map(r=>r.context))].sort((a,b)=>a-b);
// several repeats of one context are averaged; a context with no PASS shows as empty
function cell(ctx,o){
 const ok=(o!=null?okRuns(o,ctx):sel().filter(r=>r.context===ctx&&r.status==="PASS"));if(!ok.length)return null;
 const avg=k=>ok.reduce((s,r)=>s+r[k],0)/ok.length;
 return Object.fromEntries(Object.keys(METRICS).map(k=>[k,avg(k)]));
}
function pick(list,cur){return list.includes(cur)?cur:list[0]}
function card(group,items,cur){return items.map(([k,l])=>`<button type="button" role="tab" class="has${String(k)===String(cur)?" on":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join("")}
function controls(){
 $s("pSetRow").style.display=hasRyan()?"":"none";$s("pSet").innerHTML=card("set",[["ctx","Context tests 長上下文"],["ryan","Ryan conditions Input 64K / 128K"]],SET);
 NP=nps().includes(NP)?NP:(nps().includes("5")?"5":(nps().find(k=>k[0]!=="s")||nps()[0]));   // opens on NP5 (David 2026-11-18), else the first real run - never on Smoke
 const os=outs(NP),keys=(os.length>1?[CMP]:[]).concat(os);OUT=keys.includes(OUT)?OUT:keys[0];
 $s("pNp").innerHTML=card("np",nps().map(k=>[k,k[0]==="s"?`Smoke NP${k.slice(1)}`:`NP${k}`]),NP);
 $s("pOut").innerHTML=card("out",keys.map(k=>k===CMP?[CMP,"Compare outputs 輸出比較"]:[k,"Output "+k]),OUT);
 document.querySelectorAll("#secPick .cmp-tabs button").forEach(b=>b.onclick=()=>{if(b.dataset.g==="set"){SET=b.dataset.k;NP=undefined;OUT=undefined}else if(b.dataset.g==="np"){NP=b.dataset.k;OUT=undefined}else OUT=b.dataset.k===CMP?CMP:+b.dataset.k;render()});
 const kv=[...new Map(sel().filter(r=>r.kv_cache_tokens).map(r=>[r.gpu_memory_utilization,r.kv_cache_tokens])).entries()];
 const bad=sel().filter(r=>r.status!=="PASS");
 $s("pKv").innerHTML=(kv.length?`KV cache capacity<small class="zhs">KV cache 實測容量</small>：${kv.map(([u,t])=>`${t.toLocaleString("en-US")} tokens（memory ${u}）`).join("；")}`:"")
  +(bad.length?`<br>⚠ ${bad.map(r=>`${kn(r.context)} · out ${r.output} ${esc(r.status)}${r.error?"："+esc(r.error):""}`).join("；")}`:"");
}
function metrics(){
 const w=Math.max(320,($s("pMetrics").clientWidth||860)-100);
 const label=NP[0]==="s"?`Smoke NP${NP.slice(1)}`:`NP${NP}`,model=DS.profile.model.split("/").pop();
 const cmp=OUT===CMP,os=outs(NP);
 const series=cmp?os.map((o,i)=>({key:String(o),label:"Output "+o,sum:"Out "+o,color:OUTCOLORS[i%OUTCOLORS.length]})):SERIES;
 $s("pMetrics").innerHTML=BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups:ctxs().map(c=>({label:kn(c),sub:c.toLocaleString("en-US"),c})),series,
  get:(mk,g)=>{const r=cmp?cell(g.c,+mk):cell(g.c);return r&&Number.isFinite(r[k])?{[k]:r[k]}:null},
  baseline:null,width:w,dodge:cmp,skip:cmp?(mk,g)=>runs().some(r=>npKey(r)===NP&&r.output===+mk&&r.context===g.c&&r.status!=="PASS"):null,context:`${model} · Output ${cmp?os.join(" / "):OUT} · ${label}`,message:"",rowHead:SET==="ryan"?"Input":"Context",tableNote:SET==="ryan"?"Input = 精確輸入 token（輸出另計，session = 輸入 + 輸出）":"context = 輸入 + 輸出 token"})))+(cmp?statusGrid():"");
}
/* which output lengths ran at which context: PASS / FAIL / SKIP (reason on hover) - a cell that did not run is marked, not left blank */
function statusGrid(){
 const cs=ctxs(),os=outs(NP);
 const st=(o,c)=>{const rs=runs().filter(r=>npKey(r)===NP&&r.output===o&&r.context===c);if(!rs.length)return["na","—",""];const ok=rs.some(r=>r.status==="PASS");const bad=rs.find(r=>r.status!=="PASS");return ok?["ok","PASS",rs.some(r=>r.kv_tight)?"KV capacity was below the estimate; sent anyway":""]:[bad.status==="SKIP"?"skip":"fail",bad.status,bad.error||""]};
 return `<div class="gb-grid" role="table" aria-label="Output length by context"><div class="gb-gh"><span></span>${cs.map(c=>`<b>${kn(c)}</b>`).join("")}</div>${os.map(o=>`<div class="gb-gr"><b>Output ${o}</b>${cs.map(c=>{const[k,t,e]=st(o,c);return `<span class="gb-${k}"${e?` title="${esc(e)}"`:""}>${t==="PASS"?"✓ PASS":t==="—"?"—":"✕ "+esc(t)}</span>`}).join("")}</div>`).join("")}</div>`;
}
function requests(){
 const rows=sel().flatMap(r=>r.requests.map((q,i)=>`<tr><td>${kn(r.context)}<small class="bv-sub">out ${r.output} · r${r.repeat}</small></td><td>#${i+1}</td><td>${esc(q.status)}</td><td>${Number.isFinite(q.ttft_s)?q.ttft_s.toFixed(2):"—"}</td><td>${Number.isFinite(q.tpot_ms)?q.tpot_ms.toFixed(1):"—"}</td><td>${Number.isFinite(q.e2e_s)?q.e2e_s.toFixed(1):"—"}</td></tr>`)).join("");
 $s("pReq").innerHTML=rows?`<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>${SET==="ryan"?"Input":"Context"}</th><th>Request<small>請求</small></th><th>Status</th><th>TTFT<small>s</small></th><th>TPOT<small>ms/token</small></th><th>E2E<small>s</small></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="v2-fine">沒有逐請求資料。</p>';
}
function notes(){
 const p=DS.profile,u=[...new Set(runs().map(r=>r.gpu_memory_utilization))].join(" / ");
 $s("pNotes").innerHTML=`<dl class="v2-params">
  <div><dt>Machine<small class="zhs">機器</small></dt><dd>${esc(p.machine)}</dd></div>
  <div><dt>Framework<small class="zhs">框架</small></dt><dd>${esc(p.framework)} · ${esc(p.image||"")}</dd></div>
  <div><dt>Model<small class="zhs">模型</small></dt><dd>${esc(p.model)} · KV ${esc(p.kv_cache_dtype||"")} · prefix caching ${p.prefix_caching?"on":"off"}</dd></div>
  <div><dt>Memory share<small class="zhs">記憶體比例</small></dt><dd>${esc(u)}<small class="zhs">GB10 為統一記憶體，需留空間給系統</small></dd></div>
  ${SET==="ryan"&&DS.profile_ryan?`<div><dt>Weights<small class="zhs">模型權重</small></dt><dd>${esc(DS.profile_ryan.weights||"")} · KV ${esc(DS.profile_ryan.kv_cache_dtype||"")} · max-model-len ${esc(DS.profile_ryan.max_model_len)} · max-num-seqs ${esc(DS.profile_ryan.max_num_seqs)}</dd></div>`:""}
  <div><dt>vLLM args<small class="zhs">額外參數</small></dt><dd>${esc((p.extra_vllm_args||[]).join(" "))}</dd></div>
  <div><dt>Metrics<small class="zhs">算法</small></dt><dd>${Object.entries(p.metrics||{}).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join("<br>")}</dd></div>
  <div><dt>Short outputs<small class="zhs">短輸出</small></dt><dd>TPOT / TPS include the input queueing of the 5 requests<small class="zhs">短輸出的 TPOT、TPS 受輸入排隊影響，以 TTFT 為準</small></dd></div>
  <div><dt>Source<small class="zhs">來源</small></dt><dd>${esc(DS.dataset)} · ${[...new Set(runs().map(r=>r.source_dir))].map(esc).join("<br>")}</dd></div></dl>
  <p class="v2-fine">${esc(SET==="ryan"&&DS.note_ryan?DS.note_ryan:DS.note)}</p><p class="v2-fine">${esc(DS.comparability.text)}</p>`;
}
/* one conclusion on top (PF_UI): the longest context this condition completed, and what a user gets there */
function concl(){
 const el=$s("pConcl"),label=NP[0]==="s"?`Smoke NP${NP.slice(1)}`:`NP${NP}`,K='<b class="gb-k">Conclusion<small class="zhs">結論</small></b>';
 if(OUT===CMP){
  const os=outs(NP),cs=ctxs(),pass=os.filter(o=>cs.some(c=>cell(c,o))),fails=[];
  os.forEach(o=>cs.forEach(c=>{const rs=runs().filter(r=>npKey(r)===NP&&r.output===o&&r.context===c);if(rs.length&&!rs.some(r=>r.status==="PASS"))fails.push(`${o} @ ${kn(c)}`)}));
  const common=cs.filter(c=>pass.length>1&&pass.every(o=>cell(c,o))).pop();let speed="";
  /* short outputs: TPOT / TPS are dragged down by the 5 requests queueing on the input, so the comparison sentence uses TTFT */
  if(common){const lo=Math.min(...pass),hi=Math.max(...pass),a=cell(common,lo).ttft_s,b=cell(common,hi).ttft_s;speed=`<span class="gb-big">First word at <b>${kn(common)}</b>: out ${lo} <b>${a.toFixed(1)} s</b> · out ${hi} <b>${b.toFixed(1)} s</b></span>`}
  el.innerHTML=K+`<span class="gb-big">${esc(label)} runs output <b>${pass.join(" · ")||"—"}</b></span>`+speed;return}
 const cs=ctxs().filter(c=>cell(c));
 if(!cs.length){el.innerHTML="";return}
 const top=Math.max(...cs),m=cell(top);
 el.innerHTML=K+`<span class="gb-big">${esc(label)} runs up to <b>${kn(top)}</b> context</span><span class="gb-big">First word <b>${m.ttft_s.toFixed(1)} s</b></span><span class="gb-big"><b>${m.normalized_tps.toFixed(1)} tok/s</b> per request</span>`;
}
/* What was tested (David 2026-11-18): numbered steps with a status. The test session writes "progress" into the data file ([{label, detail, status: done|ongoing|todo|fail}]);
   without it the steps are derived from the runs (only done / todo - "ongoing" cannot be known from results alone). */
function derivedProgress(){
 const R=runs(),has=f=>R.filter(f),ok=l=>l.some(r=>r.status==="PASS"),ctxs=l=>[...new Set(l.map(r=>r.context))].sort((a,b)=>a-b).map(kn).join(" · "),outsOf=l=>[...new Set(l.map(r=>r.output))].sort((a,b)=>a-b).join(" / ");
 const sm=has(r=>r.phase==="smoke"),n1=has(r=>r.phase!=="smoke"&&r.np===1),n5=has(r=>r.phase!=="smoke"&&r.np===5);
 const st=l=>!l.length?"todo":ok(l)&&l.every(r=>r.status==="PASS")?"done":"fail";
 return [
  {label:"Preflight",zh:"預檢",detail:"",status:R.length?"done":"todo"},
  {label:"Smoke",zh:"冒煙",detail:sm.length?`np=${sm[0].np}, input=${ctxs(sm)} context, output=${outsOf(sm)}`:"",status:st(sm)},
  {label:"Standard NP1",zh:"標準測試",detail:n1.length?`np=1, input=${ctxs(n1)} context, output=${outsOf(n1)}`:"",status:st(n1)},
  {label:"NP5",zh:"並發 5",detail:n5.length?`np=5, input=${ctxs(n5)} context, output: ${outsOf(n5)}`:"output: 64 / 512 / 1024",status:n5.length?st(n5):"todo"}];
}
let TERM_RUNNING=false;   // data/terminal/gb10.json says completed=false while a run is still going: the last step then shows Running even if every listed condition has a result
function progress(){
 const base=SET==="ryan"?DS.progress_ryan:DS.progress,list=(base&&base.length?base:derivedProgress()).map(x=>({...x}));
 if(SET!=="ryan"&&TERM_RUNNING&&list.length&&list[list.length-1].status==="done")list[list.length-1].status="ongoing";
 const _unused=null,ico={done:"✓",ongoing:"●",todo:"○",fail:"✕"},word={done:"Done 完成",ongoing:"Running 執行中",todo:"To do 待測",fail:"Failed 未通過"};
 $s("pProgress").innerHTML=list.map((x,i)=>{const st=ico[x.status]?x.status:"todo";return `<li class="gb-st gb-${st}"><i aria-hidden="true">${ico[st]}</i><div><b>${esc(x.label)}${x.zh?`<small class="zhs">${esc(x.zh)}</small>`:""}</b>${x.detail?`<span>${esc(x.detail)}</span>`:""}</div><em>${word[st]}</em></li>`}).join("");
}
function render(){controls();concl();metrics();requests();notes();progress()}
fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>r.json()).then(reg=>{
 const e=(reg.single_machines||[]).find(x=>x.machine==="gb10");if(!e)throw new Error("registry: gb10 missing");
 return fetch(e.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(e.file+" "+r.status);return r.json()})
}).then(d=>{DS=d;if(hasRyan())SET="ryan";render();fetch("data/terminal/gb10.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(t=>{if(t&&t.completed===false){TERM_RUNNING=true;progress()}}).catch(()=>{})}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
