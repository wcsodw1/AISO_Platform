"use strict";
const $s=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kn=n=>`${n/1024}K`;
fetch("data/benchmark-registry.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("registry");return r.json()}).then(reg=>{
 const ds=reg.datasets.filter(x=>x.machine==="b60");
 return Promise.all(ds.map(x=>fetch(x.file,{cache:"no-store"}).then(r=>r.json())));
}).then(list=>{
 const items=list.filter(d=>d.retry&&(d.failures||[]).length);
 if(!items.length){$s("secRetry").hidden=true;return}
 $s("stRetry").innerHTML=items.map(D=>{const f=D.failures[0],r=D.retry;
  return `<b>原始 Full</b>（${esc(f.run_id)}）：Gemma 4 31B NP${f.np} / ${kn(f.input)} — ${esc(f.status)}。${esc(f.reason)}<br><b>重跑</b>（${esc(r.run_id)}）：僅重跑 NP5 的 8K / 16K，exit code ${r.exit_code}，failed models ${r.failed_models}，兩個情境均 PASS。${esc(r.note)}<br>原始失敗紀錄保留，不被重跑覆蓋；原始 R1 的 3.33 TPS 仍不可當作有效成績。`}).join("<hr>");
}).catch(e=>{$s("stErr").textContent="載入失敗："+e.message});
