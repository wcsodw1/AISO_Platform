"use strict";
/* Troubleshooting section: <section id="secTrouble" data-machine="Intel B60"> ... three framework buttons. */
(function(){
 const root=document.getElementById("secTrouble");if(!root)return;
 const MACHINE=root.dataset.machine,FILE="data/benchmark-troubleshooting/AISO_Troubleshooting_20261104.json";
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const gap=i=>i.stage==="other"&&i.outcome==="OPEN";
 const OUT={OPEN:["未解決","tb-open"],WORKAROUND:["已繞過（根因未解）","tb-work"],RESOLVED:["已解決","tb-ok"]};
 const CAUSE={VERIFIED:["原因已確認","tb-ok"],HYPOTHESIS:["原因為假設，非已確認","tb-hyp"]};
 const STAGE={startup:"啟動","model-load":"載入模型",inference:"推論","benchmark-runner":"測試腳本",network:"網路",other:"其他"};
 let DATA,FW=null;
 const fwOrder=["SGLang","vLLM","llama.cpp"];
 const entry=f=>DATA.entries.find(e=>e.machine===MACHINE&&e.framework===f);
 const badge=(t,c)=>`<span class="tb-badge ${c}">${esc(t)}</span>`;
 function sol(line){const m=/^(.{1,40}?Host)：([\s\S]+)$/.exec(line);
  return m?`<li><small class="tb-host">${esc(m[1])}</small><code class="tb-cmd">${esc(m[2])}</code></li>`:`<li class="tb-text">${esc(line)}</li>`}
 function issue(i){
  const o=gap(i)?["環境待驗（非失敗事件）","tb-hyp"]:(OUT[i.outcome]||[i.outcome,"tb-hyp"]),c=CAUSE[i.cause_status]||[i.cause_status,"tb-hyp"];
  return `<article class="tb-issue"><header><b>${esc(i.id)}</b><h4>${esc(i.title)}</h4><div class="tb-badges">${badge(o[0],o[1])}${badge(c[0],c[1])}${badge(STAGE[i.stage]||i.stage,"tb-stage")}${(i.models||[]).map(m=>badge(m,"tb-model")).join("")}</div></header>
  <dl><dt>現象 Symptom</dt><dd>${esc(i.symptom)}</dd><dt>錯誤訊息 Error</dt><dd><pre class="tb-err">${esc(i.error)}</pre></dd><dt>原因 Root cause</dt><dd>${esc(i.root_cause)}</dd><dt>排查與解法 Steps</dt><dd><ol class="tb-sol">${(i.solution||[]).map(sol).join("")}</ol></dd><dt>佐證 Evidence</dt><dd>${esc(i.evidence)}</dd><dt>備註 Notes</dt><dd>${esc(i.notes)}</dd></dl></article>`}
 function render(){
  const tabs=fwOrder.map(f=>{const e=entry(f),n=e?e.issues.length:0;return `<button type="button" role="tab" class="${f===FW?"on":""}" aria-selected="${f===FW}" data-fw="${esc(f)}">${esc(f)}<small>${n?n+" 項":"無紀錄"}</small></button>`}).join("");
  const e=entry(FW);let body;
  if(!e)body='<p class="v2-fine">尚無此框架的疑難排解資料。</p>';
  else{
   const head=`<p class="v2-fine tb-rt">Runtime：${esc(e.runtime)}</p>`;
   body=head+(e.issues.length?e.issues.map(issue).join(""):`<div class="tb-empty"><b>${esc(e.status||"無已知問題")}（尚無可驗證日誌，不代表已通過）</b><p>${esc(e.notes||"")}</p></div>`);
  }
  root.querySelector(".tb-body").innerHTML=body;
  root.querySelector(".tb-tabs").innerHTML=tabs;
  root.querySelectorAll(".tb-tabs button").forEach(b=>b.onclick=()=>{FW=b.dataset.fw;render()});
 }
 root.innerHTML=`<header><h2>Troubleshooting · ${esc(MACHINE)}<span class="zh">疑難排解</span></h2><div class="st-tabs tb-tabs" role="tablist" aria-label="Framework"></div></header><div class="tb-sum"></div><div class="tb-body"></div><p class="v2-fn">由執行 benchmark 的 session 提供，依實際日誌整理；標示「假設」的原因不是已確認的根因，「未解決」表示目前沒有已驗證的修復方式。不要把「已繞過」讀成已修復。</p>`;
 fetch(FILE,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
  DATA=d;FW=(fwOrder.find(f=>{const e=entry(f);return e&&e.issues.length})||"SGLang");
  const all=DATA.entries.filter(e=>e.machine===MACHINE).flatMap(e=>e.issues),cnt=k=>all.filter(i=>i.outcome===k&&!gap(i)).length,gaps=all.filter(gap).length;
  root.querySelector(".tb-sum").innerHTML=all.length?`<p class="v2-fine">共 ${all.length} 項：${badge("未解決 "+cnt("OPEN"),"tb-open")} ${badge("已繞過 "+cnt("WORKAROUND"),"tb-work")} ${badge("已解決 "+cnt("RESOLVED"),"tb-ok")} ${badge("環境待驗 "+gaps,"tb-hyp")}　資料日期 ${esc(DATA.received_on)}</p>`:`<p class="v2-fine">${esc(MACHINE)} 尚無可驗證的日誌，三個框架皆無紀錄（不代表已通過或無法啟動）。資料日期 ${esc(DATA.received_on)}</p>`;
  render();
 }).catch(()=>{root.querySelector(".tb-body").textContent="載入失敗："+FILE});
})();
