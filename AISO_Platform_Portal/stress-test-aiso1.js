"use strict";
/* AISO1 single-machine page. Data: data/benchmark-aiso1/AISO_AISO1_vLLM_20261015.json (historical diagnostic, unverified). */
const $s=id=>document.getElementById(id);
const FILE="data/benchmark-aiso1/AISO_AISO1_vLLM_20261015.json",COLOR="#8f9bff";
const METRICS={
 ttft_s:{short:"TTFT",zh:"首字延遲",unit:"s",higher:false},
 tpot_ms:{short:"TPOT",zh:"每個字的間隔",unit:"ms/token",higher:false},
 norm_tps:{short:"TPS (Normalized)",zh:"每請求每秒輸出 token（含首字等待）",unit:"tok/s",higher:true},
 aggregate_tps:{short:"TPS (Aggregate)",zh:"NP 個請求合計每秒輸出 token（含首字等待）",unit:"tok/s",higher:true}};
const kn=n=>`${n/1024}K`,tok=n=>n.toLocaleString("en-US");
const num=(v,d=1)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
let D,RUNS;
function renderSetup(){
 const p=D.profile,r=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 $s("stSetup").innerHTML=`<section class="v2-pane"><h2>實驗目的<span>Purpose</span></h2><p class="v2-goal">呈現 <b>AISO1（AMD Ryzen AI MAX+ 395）</b> 目前僅有的 vLLM 歷史實測：<b>TTFT</b>、<b>TPOT</b>、<b>TPS</b>。</p></section>`;
 $s("stParams").innerHTML=`${r("Machine 機器","AISO1 · Radeon 8060S 統一記憶體")}${r("Framework","vLLM ROCm")}${r("Model 模型","Gemma 4 31B（Repo 未核實）")}${r("Input 輸入","4K / 8K / 16K")}${r("Output 輸出","1,024 tokens")}${r("NP 並發","2")}${r("Repeat 重複","3 次取平均")}${r("TP / Context / Batch","未核實")}`;
 $s("stNote").textContent=`2026-10-15 ROCm 歷史診斷；模型 Repo／SHA、TP、Context、Batch 皆未核實；32K 僅 1 次重複（GPU reset），不計入。`;
}
function renderMetrics(){
 const w=Math.max(320,($s("stMetrics").clientWidth||860)-100),groups=[4096,8192,16384].map(i=>({label:kn(i),sub:tok(i),i}));
 $s("stMetrics").innerHTML=Object.entries(METRICS).map(([k,d])=>BV.block({k,def:d,groups,series:[{key:"aiso1",label:"AISO1 AMD",color:COLOR}],get:(mk,g)=>RUNS.find(r=>r.input===g.i),baseline:null,width:w,context:"vLLM ROCm · Gemma 4 31B · NP2",message:"歷史診斷・未核實；單機數值，不與其他機器計算差異",tableNote:"單機數值"})).join("");
}
function renderTable(){
 const c=(v,d=1)=>`<td>${num(v,d)}</td>`,over=r=>r.ttft_over_180s?' class="st-over"':"";
 const rows=RUNS.map(r=>`<tr><td>${kn(r.input)}</td><td${over(r)}>${num(r.ttft_s,r.ttft_s<10?2:1)}</td>${c(r.tpot_ms)}${c(r.norm_tps)}${c(r.aggregate_tps)}${c(r.decode_only_tps)}${c(r.e2e_s)}${c(r.prompt_tps)}<td>${r.successful} requests</td></tr>`).join("");
 const part=(D.partial_runs||[]).map(r=>`<tr class="st-part"><td>${kn(r.input)}</td><td>${num(r.ttft_s)}</td>${c(r.tpot_ms)}<td>—</td>${c(r.aggregate_tps)}<td>—</td><td>—</td><td>—</td><td>部分 ${r.repeat_observed}/${r.repeat_target} 次，不計入（${r.note}）</td></tr>`).join("");
 $s("stTableSub").textContent="NP2 · 4K / 8K / 16K 為 3 次重複平均；32K 為部分結果。TTFT ≥ 180 秒以紅字標示，仍為 Technical PASS。";
 $s("stTable").innerHTML=`<thead><tr><th>Input</th><th class="l">TTFT<small>s</small></th><th class="l">TPOT<small>ms</small></th><th class="l">TPS Norm<small>tok/s/請求</small></th><th class="l">Aggregate<small>tok/s</small></th><th class="l">Decode<small>tok/s，不含首字</small></th><th class="l">E2E<small>s</small></th><th class="l">Prompt<small>tok/s</small></th><th>狀態</th></tr></thead><tbody>${rows}${part}</tbody>`;
}
fetch(FILE,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
 D=d;RUNS=d.aiso1_runs.map(r=>({...r,norm_tps:r.aggregate_tps/r.np}));
 renderSetup();renderMetrics();renderTable();
 window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderMetrics,150)});
}).catch(()=>{$s("stErr").textContent="載入失敗："+FILE});
