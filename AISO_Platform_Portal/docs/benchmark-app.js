const $=id=>document.getElementById(id);
const API="/api/v1/benchmark";
const INPUTS=[4096,8192,16384,32768,65536];
const COLORS={2:"#d8c779",4:"#7edcff"};
const state={seq:0,token:"",meta:null,machines:[],overview:null,report:null,jobs:[],active:null,logs:{}};
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const badge=status=>`<span class="badge ${String(status).toLowerCase().replaceAll("_","-")}">${esc(String(status).replaceAll("_"," "))}</span>`;
const kfmt=tokens=>tokens>=1024?`${tokens/1024}K`:String(tokens);
const num=(value,digits=2)=>typeof value==="number"?value.toFixed(digits):"—";

async function request(path,options={}){
  const headers={...(options.headers||{})};
  if(state.token)headers.Authorization=`Bearer ${state.token}`;
  const response=await fetch(path,{...options,headers});
  if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||`HTTP ${response.status}`)}
  return response;
}
const api=async(path,options)=>(await request(API+path,options)).json();
const post=(path,body={})=>api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
function saveBlob(name,blob){const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
async function downloadApi(path,name){saveBlob(name,await (await request(API+path)).blob())}

const machine=()=>state.machines.find(item=>item.machine_id===$("machineSelect").value);
const framework=()=>$("frameworkSelect").value;
const frameworkInfo=()=>machine()?.framework_status?.[framework()];
const frameworkLabel=id=>state.meta?.frameworks.find(item=>item.name===id)?.label||id;
const reportQuery=()=>`machine=${encodeURIComponent(machine()?.machine_id||"")}&framework=${encodeURIComponent(framework())}&source=${$("sourceSelect").value}`;

function renderVendors(){
  const keep=$("vendorSelect").value;
  $("vendorSelect").innerHTML=state.meta.vendors.map(vendor=>{const count=state.machines.filter(item=>item.vendor===vendor.id).length;return `<option value="${vendor.id}" ${count?"":"disabled"}>${esc(vendor.label)}${count?"":" (no machines yet)"}</option>`}).join("");
  $("vendorSelect").value=state.machines.some(item=>item.vendor===keep)?keep:(state.machines[0]?.vendor||"");
}
function renderMachines(){
  const options=state.machines.filter(item=>item.vendor===$("vendorSelect").value);
  $("machineSelect").innerHTML=options.length?options.map(item=>`<option value="${esc(item.machine_id)}">${esc(item.display_name)}</option>`).join(""):"<option>No machines yet</option>";
  renderFrameworks();
}
function renderFrameworks(){
  const item=machine();
  if(!item){$("frameworkSelect").innerHTML="";$("machineCard").innerHTML="<p>Connect to load machine profiles.</p>";$("connectionDetails").innerHTML="";return}
  const keep=$("frameworkSelect").value;
  $("frameworkSelect").innerHTML=Object.entries(item.framework_status).map(([id,info])=>`<option value="${id}">${esc(frameworkLabel(id))} — ${esc(info.label)}</option>`).join("");
  if(item.framework_status[keep])$("frameworkSelect").value=keep;
  $("machineCard").innerHTML=`<header><div><small>${esc(item.vendor.toUpperCase())} / ${esc(item.gpu_model)}</small><h3>${esc(item.display_name)}</h3></div><b class="gpu-count">${item.gpu_count}×</b></header><dl><div><dt>VRAM</dt><dd>${item.vram_gb?`${item.vram_gb} GB each`:"Unified / not recorded"}</dd></div><div><dt>RAM</dt><dd>${item.ram_gb?`${item.ram_gb} GB`:"Not recorded"}</dd></div><div><dt>OS</dt><dd>${esc(item.os)}</dd></div><div><dt>Benchmark Root</dt><dd>${esc(item.paths.benchmark_root)}</dd></div></dl><p class="memory-note">${esc(item.memory_note||"")}</p>`;
  const ssh=item.ssh;
  $("connectionDetails").innerHTML=`<div><dt>Target</dt><dd>${ssh.configured?`${esc(ssh.user)}@${esc(ssh.host)}:${ssh.port}`:"Not configured (placeholder profile)"}</dd></div><div><dt>Authentication</dt><dd>Key only · profile ${esc(ssh.auth_profile||"—")}</dd></div><div><dt>Host Key</dt><dd>${ssh.host_key_pinned?"Pinned":"Not pinned — required before P1"}</dd></div><div><dt>Executor</dt><dd>Mock (P0)</dd></div>`;
  const models=item.frameworks[framework()]?.models||[];
  $("modelSelect").innerHTML=models.map(id=>`<option value="${id}">${esc(modelName(id))}</option>`).join("");
  updateFramework();
  loadReports();
}
const modelName=id=>state.overview?.models.find(model=>model.model===id)?.name||id;

function updateFramework(){
  const info=frameworkInfo();if(!info)return;
  const ready=info.status==="verified";
  $("frameworkStatus").textContent=info.label;
  $("frameworkStatus").className=`status-chip ${ready?"":"warn"}`;
  $("startMock").disabled=!state.token||!ready||!!state.active;
  $("preflightButton").disabled=!state.token;
  const note={verified:"P0 uses a safe Mock Executor. No SSH command or GPU workload is started. Mock output is always UNVERIFIED.",
    runtime_unverified:`${frameworkLabel(framework())} is Runtime Unverified on this machine. Execution stays disabled until real machine logs are imported; recorded results below are UNVERIFIED.`,
    not_verified:`${frameworkLabel(framework())} is not verified on this machine; execution is disabled.`,
    unavailable:`${frameworkLabel(framework())} is unavailable on this machine.`}[info.status];
  $("systemNotice").textContent=note;
}

/* ---------- reports ---------- */
async function loadReports(){
  if(!state.token){$("reportNotice").textContent="Enter the local Bearer Token and press Connect to load recorded results.";return}
  if(!machine())return;
  const ticket=++state.seq;
  try{
    const overview=await api(`/reports/overview?${reportQuery()}&format=${encodeURIComponent($("formatSelect").value)}`);
    if(ticket!==state.seq)return;
    state.overview=overview;
    renderOverview();
    const chosen=$("modelSelect").value;
    $("modelSelect").innerHTML=(machine().frameworks[framework()]?.models||[]).map(id=>`<option value="${id}">${esc(modelName(id))}</option>`).join("");
    if(chosen)$("modelSelect").value=chosen;
    const keep=$("reportModelSelect").value;
    $("reportModelSelect").innerHTML=state.overview.models.map(model=>`<option value="${model.model}">${esc(model.name)}</option>`).join("");
    const withNumbers=state.overview.models.find(model=>model.np_compare.some(point=>point.np2!=null||point.np4!=null));
    $("reportModelSelect").value=state.overview.models.some(model=>model.model===keep)?keep:(withNumbers?.model||state.overview.models[0]?.model||"");
    await loadModel();
  }catch(error){$("reportNotice").textContent=error.message}
}
function renderOverview(){
  const {models,totals}=state.overview;
  $("summaryCards").innerHTML=[[totals.models,"MODELS"],[totals.cells,"CASES"],[totals.pass,"PASS"],[totals.fail,"FAIL"],[totals.partial,"PARTIAL"],[totals.unverified,"UNVERIFIED"],[totals.blocked,"BLOCKED"],[totals.not_run,"NOT RUN"]].map(([n,label])=>`<span><b>${n}</b><small>${label}</small></span>`).join("");
  $("reportNotice").textContent=models.length?(state.overview.source==="mock"?"Mock jobs only — simulated numbers, never evidence.":"Recorded results are imported records. PASS is granted only when logs verify the run; today every recorded case is UNVERIFIED, FAIL or BLOCKED."):"No results for this machine, framework and source.";
  const compliance=value=>({non_compliant:"Non-compliant",unknown:"Not recorded",compliant:"Compliant"}[value]||value);
  $("overviewBody").innerHTML=models.map(model=>`<tr><th>${esc(model.name)}<br><small>${esc(model.summary)}</small></th><td>${esc(model.model_format)}<br><small>${esc(model.quantization)}</small></td><td>${esc(compliance(model.source_compliance))}<br><small>${esc(model.source_note)}</small></td><td>${badge(model.np2)}</td><td>${badge(model.np4)}</td><td>${badge(model.overall)}</td><td>${model.max_verified_pass_input?kfmt(model.max_verified_pass_input):"—"}</td><td>${model.max_recorded_ok_input?`${kfmt(model.max_recorded_ok_input)} <small>(unverified)</small>`:"—"}</td></tr>`).join("");
}
async function loadModel(){
  const id=$("reportModelSelect").value;
  if(!id){state.report=null;$("modelReportTitle").textContent="—";$("chartGrid").innerHTML="";$("detailBody").innerHTML="";$("modelFacts").innerHTML="";$("issuePanel").innerHTML="";$("integrityPanel").innerHTML="";return}
  const ticket=++state.seq;
  try{const report=await api(`/reports/model?${reportQuery()}&model=${encodeURIComponent(id)}`);if(ticket!==state.seq)return;state.report=report;renderModel()}catch(error){$("reportNotice").textContent=error.message}
}
function lineChart(series,unit,label){
  const w=360,h=190,left=46,right=12,top=14,bottom=26;
  const values=series.lines.flatMap(line=>line.points.map(point=>point.y)).filter(value=>typeof value==="number");
  const marks=series.lines.flatMap(line=>line.points.filter(point=>point.y==null&&["FAIL","BLOCKED"].includes(point.status)));
  if(!values.length&&!marks.length)return `<p class="empty">No numeric results for this metric.</p>`;
  const max=(Math.max(...values,0)||1)*1.1;
  const x=index=>left+index*(w-left-right)/(INPUTS.length-1),y=value=>top+(1-value/max)*(h-top-bottom);
  const tick=value=>value>=100?value.toFixed(0):value>=10?value.toFixed(1):value.toFixed(2);
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" font-family="sans-serif">`;
  for(const t of [0,.5,1]){const v=max*t;svg+=`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(244,239,228,.12)"/><text x="${left-6}" y="${y(v)+3}" text-anchor="end" font-size="9" fill="#9197a3">${tick(v)}</text>`}
  INPUTS.forEach((tokens,index)=>{svg+=`<text x="${x(index)}" y="${h-8}" text-anchor="middle" font-size="9" fill="#9197a3">${kfmt(tokens)}</text>`});
  for(const line of series.lines){
    const color=COLORS[line.np];let run=[];
    const flush=()=>{if(run.length>1)svg+=`<polyline points="${run.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`;run=[]};
    line.points.forEach((point,index)=>{
      if(typeof point.y!=="number"){flush();if(["FAIL","BLOCKED"].includes(point.status))svg+=`<path d="M${x(index)-4},${y(0)-8}l8,8m0,-8l-8,8" stroke="#ed786f" stroke-width="2" fill="none"><title>NP ${line.np} · ${kfmt(INPUTS[index])}: ${point.status}</title></path>`;return}
      run.push(`${x(index)},${y(point.y)}`);
      svg+=`<circle cx="${x(index)}" cy="${y(point.y)}" r="3.4" stroke="${color}" stroke-width="1.6" fill="${point.status==="PASS"?color:"#0a0e15"}"><title>NP ${line.np} · ${kfmt(INPUTS[index])}: ${tick(point.y)} ${esc(unit)} (${point.status})</title></circle>`;
    });
    flush();
  }
  return svg+"</svg>";
}
function renderModel(){
  const report=state.report,item=report.machine;
  $("modelReportTitle").textContent=report.model.name;
  $("modelReportSub").textContent=`${item.display_name} · ${frameworkLabel(report.framework)} · ${report.source==="mock"?"MOCK (simulated)":"Recorded (imported)"}`;
  const config=report.config_snapshot||{},snap=report.hardware_snapshot||{};
  const facts=[["Model repo",report.model.repo||"Not recorded"],["Quantization / format",`${report.model.quantization} · ${report.model.model_format}`],["Source compliance",report.model.source_note],["GPUs",`${item.gpu_count}× ${item.gpu_model}${item.vram_gb?` (${item.vram_gb} GB each)`:""}`],["Framework",`${frameworkLabel(report.framework)} · ${report.framework_spec.backend||"—"}`],["Container / version",config.container||report.framework_spec.container||config.framework_version||"Not recorded"],["TP · port",`${config.tp??"—"} · ${config.port??report.framework_spec.port??"—"}`],["Max length · batched tokens",`${config.max_model_len??"—"} · ${config.max_batched_tokens??"—"}`],["GPU memory util · prefix cache",`${config.gpu_memory_utilization??"—"} · ${config.prefix_cache==null?"Not recorded":config.prefix_cache?"ON":"OFF"}`],["Host RAM · OS",`${snap.ram_gb??"—"} GB · ${snap.os??"—"}`]];
  $("modelFacts").innerHTML=facts.map(([k,v])=>`<div><small>${esc(k.toUpperCase())}</small><b>${esc(v)}</b></div>`).join("");
  const titles={ttft_s:"TTFT",tpot_ms:"TPOT",aggregate_tps:"Aggregate TPS",norm_tps_per_request:"Normalized TPS / request",norm_tps_per_gpu:"Normalized TPS / GPU",e2e_s:"E2E latency"};
  $("chartGrid").innerHTML=report.series.filter(series=>series.metric!=="e2e_s").map(series=>`<article><header><b>${esc(titles[series.metric]||series.label)}</b><span>${esc(series.unit)}</span></header><div class="chart" data-chart="${series.metric}">${lineChart(series,series.unit,series.label)}</div></article>`).join("");
  const rows=[];
  for(const cell of [...report.matrix].sort((a,b)=>a.np-b.np||a.input_tokens-b.input_tokens)){
    const mean=cell.raw.length?`Mean of ${cell.raw.length}`:cell.repeats_recorded?`Recorded mean (${cell.repeats_recorded} runs)`:"—";
    rows.push(`<tr class="detail-summary"><td>${cell.np}</td><td>${kfmt(cell.input_tokens)}</td><td>${mean}</td><td>${num(cell.ttft_s,2)}</td><td>${num(cell.tpot_ms,1)}</td><td>${num(cell.aggregate_tps,2)}</td><td>${num(cell.norm_tps_per_request,2)}</td><td>${num(cell.norm_tps_per_gpu,2)}</td><td>${num(cell.e2e_s,1)}</td><td>${badge(cell.status)}<br><small>${esc(cell.error_message||cell.note||cell.reason||"")}</small></td></tr>`);
    for(const raw of cell.raw){
      const detail=raw.requests?.length?`<details><summary>${raw.requests.length} requests</summary><pre>${raw.requests.map(r=>`#${r.request}  TTFT ${num(r.ttft_s,3)} s · TPOT ${num(r.tpot_ms,2)} ms · E2E ${num(r.e2e_s,2)} s`).join("\n")}</pre></details>`:"";
      rows.push(`<tr class="detail-repeat"><td></td><td></td><td>R${raw.repeat}</td><td>${num(raw.ttft_s,2)}</td><td>${num(raw.tpot_ms,1)}</td><td>${num(raw.aggregate_tps,2)}</td><td>${num(raw.norm_tps_per_request,2)}</td><td>${num(raw.norm_tps_per_gpu,2)}</td><td>${num(raw.e2e_s,1)}</td><td>${badge(raw.status)} <small>${raw.successful_requests??"—"}/${raw.expected_requests??"—"} requests</small>${detail}</td></tr>`);
    }
  }
  $("detailBody").innerHTML=rows.join("");
  const issues=new Map();
  for(const cell of report.matrix.filter(item=>["FAIL","BLOCKED"].includes(item.status))){
    const key=[cell.status,cell.error_type,cell.error_message].join("|");
    if(!issues.has(key))issues.set(key,{cell,spots:[]});
    issues.get(key).spots.push(`NP${cell.np} · ${kfmt(cell.input_tokens)}`);
  }
  $("issuePanel").innerHTML=[...issues.values()].map(({cell,spots})=>`<div class="issue-card"><h4>${badge(cell.status)} ${esc(cell.error_type||"")}</h4><p>${esc(cell.error_message||"")}</p><p><small>${esc(spots.join(" · "))}${cell.raw_error_pending?" · Original error text pending import.":""}</small></p></div>`).join("");
  const integrity=report.integrity;
  const pending=report.evidence_pending?.length?`<h4>NEEDED TO VERIFY PASS</h4><ul>${report.evidence_pending.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:"";
  $("integrityPanel").innerHTML=(integrity?`<div class="integrity-card ${integrity.consistent?"ok":""}"><h4>IMPORT CHECK · ${integrity.consistent?"RAW AND SUMMARY AGREE":"MISMATCH FOUND"}</h4><p>${integrity.raw_rows} raw requests recomputed against ${integrity.summary_rows} summary rows (TTFT, TPOT, Decode TPS, E2E, Aggregate TPS). ${esc(integrity.scope)}</p>${integrity.problems.length?`<ul>${integrity.problems.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>`:""}<h4>ORIGINAL FILES (SHA256)</h4>${Object.entries(integrity.source_files).map(([name,info])=>`<code>${esc(name)} · ${info.data_rows} rows · ${esc(info.sha256)}</code>`).join("")}</div>`:"")+(pending?`<div class="integrity-card">${pending}</div>`:"");
}

/* ---------- jobs ---------- */
function formConfig(){
  return {model:$("modelSelect").value,test_mode:$("modeSelect").value,np:[Number($("npInput").value)],tp:Number($("tpInput").value),
    input_tokens:[...$("inputTokens").querySelectorAll("input:checked")].map(input=>Number(input.value)),output_tokens:Number($("outputInput").value),repeat:Number($("repeatInput").value),
    max_model_len:Number($("maxModelInput").value),max_num_seqs:Number($("maxSeqInput").value),max_num_batched_tokens:Number($("maxBatchInput").value),
    gpu_memory_utilization:Number($("gpuUtilInput").value),prefix_caching:$("prefixInput").checked};
}
async function refreshJobs(){
  if(!state.token)return;
  try{
    state.jobs=(await api("/jobs")).jobs;
    const latest=state.jobs[0];
    if(latest)state.logs[latest.job_id]=(await api(`/jobs/${encodeURIComponent(latest.job_id)}/log`)).lines.map(line=>line.text);
    renderJobs();
  }catch(error){$("runStatus").textContent=error.message}
}
function renderJobs(){
  state.active=state.jobs.find(job=>job.state==="running")?.job_id||null;
  $("stopMock").disabled=!state.active;
  $("startMock").disabled=!state.token||!!state.active||frameworkInfo()?.status!=="verified";
  $("exportLogs").disabled=!state.jobs.length;
  $("exportLogs").textContent=state.jobs.length?"Log Archive (latest mock job)":"Log Archive — awaiting import";
  $("jobList").innerHTML=state.jobs.length?state.jobs.map(job=>`<article class="job-card"><div><b>${esc(job.job_id)}</b><p>${esc(job.model)} · ${esc(job.framework)} · MOCK · ${esc(job.state)} · ${esc(job.profile)}${job.retry_of?` · retry of ${esc(job.retry_of)}`:""}</p></div>${badge(job.result_status)}<progress max="${job.progress.total||1}" value="${job.progress.done||0}"></progress><pre>${esc((state.logs[job.job_id]||["Mock job metadata only."]).slice(-6).join("\n"))}\nEvidence: ${esc(job.result_status)} — mock data is never promoted to PASS.</pre><div class="job-actions">${job.state==="failed"?`<button type="button" data-retry="${esc(job.job_id)}">Retry failed cases</button>`:""}<button type="button" data-log="${esc(job.job_id)}">Download logs</button></div></article>`).join(""):"<p>No Mock Jobs yet. P0 never overwrites existing Benchmark evidence.</p>";
}

/* ---------- exports ---------- */
async function exportCharts(){
  const cards=[...$("chartGrid").querySelectorAll("article")].filter(card=>card.querySelector("svg"));
  if(!cards.length){$("reportNotice").textContent="No chart data to export.";return}
  const cw=380,ch=240,cols=2,rowsCount=Math.ceil(cards.length/cols),canvas=document.createElement("canvas");
  canvas.width=cw*cols;canvas.height=ch*rowsCount+34;
  const ctx=canvas.getContext("2d");ctx.fillStyle="#0a0e15";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#f4efe4";ctx.font="14px sans-serif";ctx.fillText(`${$("modelReportTitle").textContent} · ${$("modelReportSub").textContent}`,12,22);
  await Promise.all(cards.map((card,index)=>new Promise(resolve=>{
    const svg=new XMLSerializer().serializeToString(card.querySelector("svg"));
    const image=new Image();
    image.onload=()=>{const col=index%cols,row=Math.floor(index/cols);ctx.fillStyle="#f4efe4";ctx.font="12px sans-serif";ctx.fillText(card.querySelector("b").textContent+" ("+card.querySelector("span").textContent+")",col*cw+12,34+row*ch+16);ctx.drawImage(image,col*cw+10,34+row*ch+22);resolve()};
    image.onerror=resolve;image.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
  })));
  canvas.toBlob(blob=>saveBlob(`${machine().machine_id}-${framework()}-${$("reportModelSelect").value}-charts.png`,blob));
}

/* ---------- wiring ---------- */
$("connectButton").onclick=async()=>{
  state.token=$("tokenInput").value.trim();if(!state.token)return;
  try{
    const [status,meta,machines]=await Promise.all([api("/status"),api("/frameworks"),api("/machines")]);
    state.meta=meta;state.machines=machines.machines;
    $("accessBadge").textContent="LOCAL ADMIN / TOKEN";$("tokenInput").value="";
    $("runStatus").textContent=`Authenticated. ${status.executor.toUpperCase()} executor available; SSH executor is not implemented in P0.`;
    renderVendors();renderMachines();refreshJobs();
  }catch(error){state.token="";$("accessBadge").textContent="AUTH FAILED";$("runStatus").textContent=error.message}
};
$("vendorSelect").onchange=renderMachines;$("machineSelect").onchange=renderFrameworks;
$("frameworkSelect").onchange=()=>{renderFrameworks()};
$("sourceSelect").onchange=loadReports;$("formatSelect").onchange=loadReports;$("reportModelSelect").onchange=loadModel;
$("prefixInput").onchange=()=>{$("prefixInput").nextElementSibling.textContent=$("prefixInput").checked?"ON":"OFF"};
$("benchmarkForm").onsubmit=async event=>{event.preventDefault();try{const result=await post("/jobs",{machine_id:machine().machine_id,framework:framework(),config:formConfig()});$("runStatus").textContent=`${result.job_id} started in MOCK mode — evidence remains UNVERIFIED.`;await refreshJobs()}catch(error){$("runStatus").textContent=error.message}};
$("stopMock").onclick=async()=>{if(!state.active)return;try{await post(`/jobs/${encodeURIComponent(state.active)}/stop`);$("runStatus").textContent="Stop requested for this job only."}catch(error){$("runStatus").textContent=error.message}};
$("jobList").onclick=async event=>{
  const retry=event.target.closest("[data-retry]"),log=event.target.closest("[data-log]");
  try{
    if(retry){await post(`/jobs/${encodeURIComponent(retry.dataset.retry)}/retry-failed`);$("runStatus").textContent="Retry started for failed cases only (new run).";await refreshJobs()}
    if(log)await downloadApi(`/exports/logs?job_id=${encodeURIComponent(log.dataset.log)}`,`${log.dataset.log}-logs.zip`);
  }catch(error){$("runStatus").textContent=error.message}
};
$("preflightButton").onclick=async()=>{try{const result=await post(`/machines/${encodeURIComponent(machine().machine_id)}/preflight`,{framework:framework()});$("preflightResult").innerHTML=`<p><small>${esc(result.message)}</small></p>${result.checks.map(check=>`<p><span>${esc(check.name)}</span>${badge(check.status)}</p>`).join("")}`}catch(error){$("preflightResult").textContent=error.message}};
$("downloadConfig").onclick=()=>saveBlob(`${machine()?.machine_id||"machine"}-${framework()}-config.json`,new Blob([JSON.stringify({machine_id:machine()?.machine_id,framework:framework(),config:formConfig()},null,2)],{type:"application/json"}));
$("exportJson").onclick=()=>state.report&&downloadApi(`/exports/json?${reportQuery()}&model=${encodeURIComponent($("reportModelSelect").value)}`,`${machine().machine_id}-${framework()}-${$("reportModelSelect").value}.json`).catch(error=>{$("reportNotice").textContent=error.message});
$("exportCsv").onclick=()=>state.report&&downloadApi(`/exports/csv?${reportQuery()}&model=${encodeURIComponent($("reportModelSelect").value)}`,`${machine().machine_id}-${framework()}-${$("reportModelSelect").value}.csv`).catch(error=>{$("reportNotice").textContent=error.message});
$("exportPng").onclick=()=>exportCharts();
$("exportPdf").onclick=()=>window.print();
$("exportLogs").onclick=()=>state.jobs[0]&&downloadApi(`/exports/logs?job_id=${encodeURIComponent(state.jobs[0].job_id)}`,`${state.jobs[0].job_id}-logs.zip`).catch(error=>{$("runStatus").textContent=error.message});
document.addEventListener("click",event=>{const button=event.target.closest(".tip");if(!button){$("tooltip").hidden=true;return}const box=button.getBoundingClientRect();$("tooltip").textContent=button.dataset.tip;$("tooltip").style.left=`${Math.min(innerWidth-300,box.left)}px`;$("tooltip").style.top=`${box.bottom+8}px`;$("tooltip").hidden=false});
setInterval(()=>{if(state.token&&!document.hidden)refreshJobs()},1500);
(function placeholders(){
  const defaults=[4096,8192,16384,32768,65536];
  $("inputTokens").innerHTML=defaults.map(token=>`<label><input type="checkbox" value="${token}" checked>${token/1024}K</label>`).join("");
  $("vendorSelect").innerHTML="<option>Connect to load</option>";$("machineSelect").innerHTML="";$("frameworkSelect").innerHTML="";
  $("machineCard").innerHTML="<p>Connect to load machine profiles and recorded results.</p>";
  $("startMock").disabled=true;
})();

/* hover glow: publish the cursor position to every glow region under the pointer */
(function glow(){
  const regions=".bm-side,.bm-workspace,.report-section,.job-section,.machine-card,.connection-card,.model-facts div,.chart-grid article,.issue-card,.integrity-card,.job-card,.summary-cards span,.bm-notice";
  document.addEventListener("pointermove",event=>{
    for(let node=event.target instanceof Element?event.target:null;node;node=node.parentElement){
      if(!node.matches(regions))continue;
      const box=node.getBoundingClientRect();
      node.style.setProperty("--mx",`${event.clientX-box.left}px`);
      node.style.setProperty("--my",`${event.clientY-box.top}px`);
    }
  },{passive:true});
})();
