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
let DS,NP,OUT;
const runs=()=>DS.gb10_runs;
const npKey=r=>(r.phase==="smoke"?"s":"")+r.np;
const nps=()=>[...new Set(runs().map(npKey))].sort((a,b)=>(a[0]==="s")-(b[0]==="s")||parseInt(a.replace("s",""))-parseInt(b.replace("s","")));
const outs=k=>[...new Set(runs().filter(r=>npKey(r)===k).map(r=>r.output))].sort((a,b)=>a-b);
const sel=()=>runs().filter(r=>npKey(r)===NP&&r.output===OUT);
const ctxs=()=>[...new Set(sel().map(r=>r.context))].sort((a,b)=>a-b);
// several repeats of one context are averaged; a context with no PASS shows as empty
function cell(ctx){
 const ok=sel().filter(r=>r.context===ctx&&r.status==="PASS");if(!ok.length)return null;
 const avg=k=>ok.reduce((s,r)=>s+r[k],0)/ok.length;
 return Object.fromEntries(Object.keys(METRICS).map(k=>[k,avg(k)]));
}
function pick(list,cur){return list.includes(cur)?cur:list[0]}
function card(group,items,cur){return items.map(([k,l])=>`<button type="button" role="tab" class="has${String(k)===String(cur)?" on":""}" aria-selected="${String(k)===String(cur)}" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join("")}
function controls(){
 NP=pick(nps(),NP);OUT=pick(outs(NP),OUT);
 $s("pNp").innerHTML=card("np",nps().map(k=>[k,k[0]==="s"?`Smoke NP${k.slice(1)}`:`NP${k}`]),NP);
 $s("pOut").innerHTML=card("out",outs(NP).map(o=>[o,"Output "+o]),OUT);
 document.querySelectorAll("#secPick .cmp-tabs button").forEach(b=>b.onclick=()=>{if(b.dataset.g==="np")NP=b.dataset.k;else OUT=+b.dataset.k;render()});
 const kv=[...new Map(sel().filter(r=>r.kv_cache_tokens).map(r=>[r.gpu_memory_utilization,r.kv_cache_tokens])).entries()];
 const bad=sel().filter(r=>r.status!=="PASS");
 $s("pKv").innerHTML=(kv.length?`KV cache capacity<small class="zhs">KV cache 實測容量</small>：${kv.map(([u,t])=>`${t.toLocaleString("en-US")} tokens（memory ${u}）`).join("；")}`:"")
  +(bad.length?`<br>⚠ ${bad.map(r=>`${kn(r.context)} ${esc(r.status)}${r.error?"："+esc(r.error):""}`).join("；")}`:"");
}
function metrics(){
 const w=Math.max(320,($s("pMetrics").clientWidth||860)-100);
 const label=NP[0]==="s"?`Smoke NP${NP.slice(1)}`:`NP${NP}`;
 $s("pMetrics").innerHTML=BV.blocks(Object.entries(METRICS).map(([k,d])=>({k,def:d,groups:ctxs().map(c=>({label:kn(c),sub:c.toLocaleString("en-US"),c})),series:SERIES,
  get:(mk,g)=>{const r=cell(g.c);return r&&Number.isFinite(r[k])?{[k]:r[k]}:null},
  baseline:null,width:w,context:`${DS.profile.model.split("/").pop()} · Output ${OUT} · ${label}`,message:"",rowHead:"Context",tableNote:"context = 輸入 + 輸出 token"})));
}
function requests(){
 const rows=sel().flatMap(r=>r.requests.map((q,i)=>`<tr><td>${kn(r.context)}<small class="bv-sub">r${r.repeat}</small></td><td>#${i+1}</td><td>${esc(q.status)}</td><td>${Number.isFinite(q.ttft_s)?q.ttft_s.toFixed(2):"—"}</td><td>${Number.isFinite(q.tpot_ms)?q.tpot_ms.toFixed(1):"—"}</td><td>${Number.isFinite(q.e2e_s)?q.e2e_s.toFixed(1):"—"}</td></tr>`)).join("");
 $s("pReq").innerHTML=rows?`<div class="table-wrap"><table class="v2-table v2-sc"><thead><tr><th>Context</th><th>Request<small>請求</small></th><th>Status</th><th>TTFT<small>s</small></th><th>TPOT<small>ms/token</small></th><th>E2E<small>s</small></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="v2-fine">沒有逐請求資料。</p>';
}
function notes(){
 const p=DS.profile,u=[...new Set(runs().map(r=>r.gpu_memory_utilization))].join(" / ");
 $s("pNotes").innerHTML=`<dl class="v2-params">
  <div><dt>Machine<small class="zhs">機器</small></dt><dd>${esc(p.machine)}</dd></div>
  <div><dt>Framework<small class="zhs">框架</small></dt><dd>${esc(p.framework)} · ${esc(p.image||"")}</dd></div>
  <div><dt>Model<small class="zhs">模型</small></dt><dd>${esc(p.model)} · KV ${esc(p.kv_cache_dtype||"")} · prefix caching ${p.prefix_caching?"on":"off"}</dd></div>
  <div><dt>Memory share<small class="zhs">記憶體比例</small></dt><dd>${esc(u)}<small class="zhs">GB10 為統一記憶體，需留空間給系統</small></dd></div>
  <div><dt>vLLM args<small class="zhs">額外參數</small></dt><dd>${esc((p.extra_vllm_args||[]).join(" "))}</dd></div>
  <div><dt>Metrics<small class="zhs">算法</small></dt><dd>${Object.entries(p.metrics||{}).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join("<br>")}</dd></div>
  <div><dt>Source<small class="zhs">來源</small></dt><dd>${esc(DS.dataset)} · ${[...new Set(runs().map(r=>r.source_dir))].map(esc).join("<br>")}</dd></div></dl>
  <p class="v2-fine">${esc(DS.note)}</p><p class="v2-fine">${esc(DS.comparability.text)}</p>`;
}
/* one conclusion on top (PF_UI): the longest context this condition completed, and what a user gets there */
function concl(){
 const cs=ctxs().filter(c=>cell(c));const el=$s("pConcl");
 if(!cs.length){el.innerHTML="";return}
 const top=Math.max(...cs),m=cell(top),label=NP[0]==="s"?`Smoke NP${NP.slice(1)}`:`NP${NP}`;
 el.innerHTML=`<b class="gb-k">Conclusion<small class="zhs">結論</small></b><span class="gb-big">${esc(label)} runs up to <b>${kn(top)}</b> context</span><span class="gb-big">First word <b>${m.ttft_s.toFixed(1)} s</b></span><span class="gb-big"><b>${m.normalized_tps.toFixed(1)} tok/s</b> per request</span>`;
}
function render(){controls();concl();metrics();requests();notes()}
fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>r.json()).then(reg=>{
 const e=(reg.single_machines||[]).find(x=>x.machine==="gb10");if(!e)throw new Error("registry: gb10 missing");
 return fetch(e.file,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(e.file+" "+r.status);return r.json()})
}).then(d=>{DS=d;render()}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
