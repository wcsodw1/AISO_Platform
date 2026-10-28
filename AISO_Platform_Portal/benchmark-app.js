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

const tseen={};
let tlast="";
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
  $("machineCard").innerHTML=`<header><div><small>${esc(item.vendor.toUpperCase())} / ${esc(item.gpu_model)}</small><h3>${esc(item.display_name)}</h3></div><b class="gpu-count">${item.gpu_count}<small> × GPU</small></b></header><dl><div><dt>VRAM</dt><dd>${item.vram_gb?`${item.vram_gb} GB each`:"Unified / not recorded"}</dd></div><div><dt>RAM</dt><dd>${item.ram_gb?`${item.ram_gb} GB`:"Not recorded"}</dd></div><div><dt>OS</dt><dd>${esc(item.os)}</dd></div><div><dt>Benchmark Root</dt><dd>${esc(item.paths.benchmark_root)}</dd></div></dl><p class="memory-note">${esc(item.memory_note||"")}</p>`;
  const ssh=item.ssh;
  $("connectionDetails").innerHTML=`<div><dt>Target</dt><dd>${ssh.configured?`${esc(ssh.user)}@${esc(ssh.host)}:${ssh.port}`:"Not configured (placeholder profile)"}</dd></div><div><dt>Authentication</dt><dd>Key only · profile ${esc(ssh.auth_profile||"—")}</dd></div><div><dt>Host Key</dt><dd>${ssh.host_key_pinned?"Pinned":"Not pinned — required before P1"}</dd></div><div><dt>Executor</dt><dd>Mock (P0)</dd></div>`;
  const models=item.frameworks[framework()]?.models||[];
  $("modelSelect").innerHTML=models.map(id=>`<option value="${id}">${esc(modelName(id))}</option>`).join("");
  updateFramework();
  renderLiveServices();
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
  $("systemNotice").textContent=state.token?"已登入本機管理。選擇服務並偵測模型後，即可執行實機測試。":"請使用頁面上方的本機 Bearer Token 登入，以偵測服務與執行實機測試。";
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
const tokenStore={get(){try{return localStorage.getItem("aiso_bm_token")||""}catch{return ""}},set(v){try{v?localStorage.setItem("aiso_bm_token",v):localStorage.removeItem("aiso_bm_token")}catch{}}};
$("connectButton").onclick=async()=>{
  state.token=$("tokenInput").value.trim()||state.token;if(!state.token)return;
  try{
    const [status,meta,machines]=await Promise.all([api("/status"),api("/frameworks"),api("/machines")]);
    state.meta=meta;state.machines=machines.machines;
    $("accessBadge").textContent="LOCAL ADMIN / TOKEN";$("tokenInput").value="";tokenStore.set(state.token);
    $("runStatus").textContent=`Authenticated. ${status.executor.toUpperCase()} executor available; SSH executor is not implemented in P0.`;
    renderVendors();renderMachines();renderWizard();refreshJobs();
  }catch(error){state.token="";tokenStore.set("");$("accessBadge").textContent="AUTH FAILED";$("runStatus").textContent=error.message;if(typeof tlog==="function")tlog("連線失敗："+error.message,"err")}
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

/* Live measurements use configured HTTP targets; prompts and generated text are not persisted. */
let liveSnapshot={jobs:[],active:null};
let liveTicket=0;
const knownCatalog={
  "intel-b70":{
    vllm:{service:"B70 vLLM XPU · port 18090 · TP 2",models:["Gemma 4 26B","Gemma 4 31B","Nemotron","Laguna FP8"]},
    sglang:{service:"B70 SGLang XPU · port 18091 · TP 2",models:["Gemma 4 31B"]},
    llamacpp:{service:"B70 llama.cpp SYCL · 未設定埠",models:[]}
  }
};
function renderLiveServices(){
  liveTicket++;
  const services=machine()?.live_services?.[framework()]||[];
  const known=knownCatalog[machine()?.machine_id]?.[framework()];
  if(services.length){
    $("liveService").innerHTML=services.map(s=>`<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    $("liveModel").innerHTML="";
  }else if(known){
    $("liveService").innerHTML=`<option value="">${esc(known.service)}（待連線）</option>`;
    $("liveModel").innerHTML=known.models.length?known.models.map(m=>`<option value="">${esc(m)}（待偵測）</option>`).join(""):'<option value="">尚無已驗證模型</option>';
  }else{
    $("liveService").innerHTML="";$("liveModel").innerHTML="";
  }
  $("liveDiscover").classList.toggle("is-idle",!!(!state.token||!services.length));
  $("liveStart").classList.toggle("is-idle",!!(true));
  $("liveStatus").textContent=!state.token?"請先於上方輸入本機 Bearer Token 並按 Connect。":services.length?"請偵測模型，再開始實機測試。":known?"清單為 B70 已測過的服務與模型；需先在 machines.local.json 設定 B70 位址後才能偵測並執行。":"此機器／Framework 尚未設定可連線的實機服務。";
  tlog($("liveStatus").textContent,"");
}
$("liveService").onchange=()=>{liveTicket++;$("liveModel").innerHTML="";$("liveStart").classList.toggle("is-idle",!!(true));};
$("liveDiscover").onclick=async()=>{
  if(!liveReady("discover"))return;
  const ticket=++liveTicket;
  $("liveStart").classList.toggle("is-idle",!!(true));
  $("liveStatus").textContent="正在查詢實機模型…";
  try{
    const result=await post("/live/discover",{machine_id:machine().machine_id,framework:framework(),service:$("liveService").value});
    if(ticket!==liveTicket)return;
    $("liveModel").innerHTML=result.models.map(m=>`<option value="${esc(m.id)}">${esc(m.id)}</option>`).join("");
    $("liveStart").classList.toggle("is-idle",!!(!result.models.length||!!liveSnapshot.active));
    $("liveStatus").textContent=`已連接服務，找到 ${result.models.length} 個模型。`;tlog(`discover ${$("liveService").value}: ${result.models.map(m=>m.id).join(", ")||"no models"}`,"ok");
  }catch(error){if(ticket===liveTicket)$("liveStatus").textContent=error.message}
};
async function refreshLive(){
  if(!state.token)return;
  try{
    liveSnapshot=await api("/live/jobs");
    $("liveStop").disabled=!liveSnapshot.active;
    $("liveExport").disabled=!liveSnapshot.jobs.length;
    $("liveStart").classList.toggle("is-idle",!!(!$("liveModel").value||!!liveSnapshot.active));
    liveSnapshot.jobs.slice().reverse().forEach(job=>{
      const seen=tseen[job.id]||(tseen[job.id]={rows:job.rows.length,status:job.status,fresh:false});
      if(seen.fresh===false&&!seen.init){seen.init=true;seen.rows=job.status==="running"?0:job.rows.length}
      job.rows.slice(seen.rows).forEach(r=>tlog(`repeat ${r.repeat} req ${r.request}: ${r.valid?"OK":"FAIL"} · in ${r.input_tokens_actual??"-"} · out ${r.output_tokens_actual??"-"} · TTFT ${num(r.ttft_ms)} ms · TPOT ${num(r.tpot_ms)} ms · agg ${num(r.aggregate_tps)} tok/s${r.error?" · "+r.error:""}`,r.valid?"":"err"));
      seen.rows=job.rows.length;
      if(job.status!==seen.status){tlog(`job ${job.id.slice(0,8)} ${job.status}`,job.status==="completed"?"ok":job.status==="running"?"":"err");seen.status=job.status}
    });
    $("termState").textContent=liveSnapshot.active?"running":"idle";
    $("liveJobs").innerHTML=liveSnapshot.jobs.filter(job=>job.machine_id===machine()?.machine_id&&job.framework===framework()).map(job=>`<article class="job-card"><b>${esc(job.machine_id)} · ${esc(job.config.model)} · ${esc(job.status)}</b><p>MEASURED EXPLORATORY · ${job.rows.length}/${job.total_requests} requests</p>${job.rows.map(r=>`<p>Repeat ${r.repeat} / Request ${r.request}: ${r.valid?"Measured":"Failed"} · Input ${r.input_tokens_actual??"—"} · Output ${r.output_tokens_actual??"—"} · TTFT ${num(r.ttft_ms)} ms · TPOT ${num(r.tpot_ms)} ms · Aggregate ${num(r.aggregate_tps)} tok/s${r.error?` · ${esc(r.error)}`:""}</p>`).join("")}</article>`).join("");
  }catch(error){$("liveStatus").textContent=error.message}
}
$("liveStart").onclick=async()=>{
  if(!liveReady("start"))return;
  $("liveStart").classList.toggle("is-idle",!!(true));
  termOpen(true);tlog(`$ start  ${machine().machine_id} · ${framework()} · ${$("liveModel").value} · NP${$("liveNp").value} · out ${$("liveOutput").value} · repeat ${$("liveRepeat").value}`);
  try{
    const result=await post("/live/start",{machine_id:machine().machine_id,framework:framework(),config:{service:$("liveService").value,model:$("liveModel").value,prompt:$("livePrompt").value,np:Number($("liveNp").value),output_tokens:Number($("liveOutput").value),repeat:Number($("liveRepeat").value)}});
    $("liveStatus").textContent=`實機測試 ${result.id} 已啟動。`;termOpen(true);tlog(`job ${result.id.slice(0,8)} started`,"ok");
  }catch(error){$("liveStatus").textContent=error.message;tlog(error.message,"err")}
  await refreshLive();
};
$("liveStop").onclick=async()=>{try{const result=await post("/live/stop");$("liveStatus").textContent=result.message}catch(error){$("liveStatus").textContent=error.message}};
$("liveExport").onclick=()=>saveBlob("live-benchmark-results.json",new Blob([JSON.stringify(liveSnapshot,null,2)],{type:"application/json"}));
setInterval(refreshLive,1500);

// Public-safe navigation catalog; real service details arrive only after authentication.
const unitCatalog=[
  {id:"pro6000-tpi",vendor:"nvidia",name:"NVIDIA RTX PRO6000",tier:"Server-Workstation",detail:"TPI · 8 × RTX PRO 6000 Blackwell · 96 GB / GPU",gpu:"RTX PRO 6000 Blackwell Server Edition",count:8,vram:96,frameworks:["vllm","llamacpp"]},
  {id:"aiso1-amd",vendor:"amd",name:"AISO1",tier:"Mini-workstation",detail:"AMD Ryzen AI Max+ 395 · 服務連線待設定",gpu:"Radeon iGPU (gfx1151)",count:1,vram:null,frameworks:["llamacpp","vllm","sglang"]},
  {id:"intel-b70",vendor:"intel",name:"Intel Arc Pro B70",tier:"Mini-workstation",detail:"2 × Arc Pro B70 · 32 GB / GPU",gpu:"Arc Pro B70",count:2,vram:32,frameworks:["vllm","sglang","llamacpp"]}
];
if(!state.meta){
  state.meta={vendors:[{id:"nvidia",label:"NVIDIA"},{id:"amd",label:"AMD"},{id:"intel",label:"Intel"}],frameworks:[{name:"vllm",label:"vLLM"},{name:"llamacpp",label:"llama.cpp"},{name:"sglang",label:"SGLang"}]};
  state.machines=unitCatalog.map(u=>({machine_id:u.id,display_name:u.name,vendor:u.vendor,gpu_model:u.gpu,gpu_count:u.count,vram_gb:u.vram,os:"請連線確認",paths:{benchmark_root:"本機設定"},ssh:{configured:false},frameworks:Object.fromEntries(u.frameworks.map(f=>[f,{status:"not_verified"}])),framework_status:Object.fromEntries(u.frameworks.map(f=>[f,{status:"not_verified",label:"未連線 · 按 Connect 載入"}]))}));
}
const scalePresets={
  consumer:{np:1,out:128,rep:1,note:"Consumer 正式預設待設定；暫用快速測試 NP1／128 tokens／Repeat 1。"},
  mini:{np:2,out:1024,rep:3,note:"Mini-workstation 正式預設：NP2（再測 NP4）、Output 1024、Repeat 3。"},
  server:{np:1,out:128,rep:1,note:"Server-Workstation 正式預設待設定；暫用快速測試 NP1／128 tokens／Repeat 1。"}
};
function setManual(on){
  $("presetState").textContent=on?"手動調整中（按 Default 還原）":"目前使用：規模預設";
}
function resetQuickPreset(){
  const p=scalePresets[pickedScale]||scalePresets.server;
  $("liveNp").value=p.np;$("liveOutput").value=p.out;$("liveRepeat").value=p.rep;
  $("livePrompt").value="Explain how a local language model processes a prompt, step by step.";
  setManual(false);
}
const scales={consumer:"Consumer",mini:"Mini-workstation",server:"Server-Workstation"};
const scaleDescriptions={consumer:"Consumer 正式預設參數待設定；目前可使用快速連線測試。",mini:"Mini-workstation 正式預設：NP2／NP4、Input 4K–64K、Output 1024、Repeat 3。正式測試須由 Runner 驗證；快速連線測試另外提供。",server:"Server-Workstation 正式預設參數待設定；目前可使用快速連線測試。"};
let pickedUnit="pro6000-tpi",pickedScale="server";
const defaultScale=unit=>unit.tier==="Mini-workstation"?"mini":"server";
function renderSelection(){
  const unit=unitCatalog.find(u=>u.id===pickedUnit);
  document.querySelectorAll("[data-unit]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.unit===pickedUnit)));
  $("machineScale").value=pickedScale;
  $("scaleNote").textContent=scaleDescriptions[pickedScale];
  $("selectionSummary").innerHTML=`<small>已選擇</small><b>${esc(unit.name)}</b><span>${esc(scales[pickedScale])}</span>`;
  document.querySelectorAll("[data-scale]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.scale===pickedScale)));
}
function renderWizard(){
  const parts=location.hash.slice(1).split("/").filter(Boolean);
  const vendor=["nvidia","amd","intel"].includes(parts[1])?parts[1]:"nvidia";
  const unit=unitCatalog.find(u=>u.vendor===vendor&&u.id===parts[2]);
  $("vendorPage").hidden=!!unit;$("parameterPage").hidden=!unit;
  $("stepVendors").setAttribute("aria-current",unit?"false":"step");
  $("stepParams").setAttribute("aria-current",unit?"step":"false");
  document.querySelectorAll("[data-vendor]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.vendor===vendor)));
  $("unitTitle").textContent=`${vendor.toUpperCase()} / 機器項目`;
  const choices=unitCatalog.filter(u=>u.vendor===vendor);
  if(!choices.some(u=>u.id===pickedUnit)){pickedUnit=choices[0].id;pickedScale=defaultScale(choices[0])}
  $("unitChoices").innerHTML=choices.map(u=>`<button type="button" class="pc-unit-card" data-unit="${u.id}"><b>${esc(u.name)}</b><span>${esc(u.detail)}</span><em>${esc(u.tier)}</em></button>`).join("");
  if(unit){
    pickedUnit=unit.id;pickedScale=Object.hasOwn(scales,parts[3])?parts[3]:defaultScale(unit);
    document.querySelectorAll("#parameterPage .report-section:not(#livePanel), #parameterPage .job-section").forEach(section=>{section.hidden=unit.vendor==="nvidia"});
    renderVendors();$("vendorSelect").value=vendor;renderMachines();$("machineSelect").value=unit.id;renderFrameworks();
    $("selectedUnitTitle").textContent=unit.name;$("unitTier").textContent=scales[pickedScale];
    resetQuickPreset();$("presetDescription").textContent=scalePresets[pickedScale].note;
  }
  renderSelection();
}
$("vendorPage").onclick=event=>{const button=event.target.closest("[data-vendor]");if(button)location.hash=`/pick/${button.dataset.vendor}`};
$("unitChoices").onclick=event=>{const button=event.target.closest("[data-unit]");if(button){pickedUnit=button.dataset.unit;pickedScale=defaultScale(unitCatalog.find(u=>u.id===pickedUnit));renderSelection()}};
$("machineScale").onchange=()=>{pickedScale=$("machineScale").value;renderSelection()};
$("configureUnit").onclick=()=>{const unit=unitCatalog.find(u=>u.id===pickedUnit);resetQuickPreset();location.hash=`/pick/${unit.vendor}/${unit.id}/${pickedScale}`};
$("stepVendors").onclick=()=>{location.hash=`/pick/${unitCatalog.find(u=>u.id===pickedUnit).vendor}`};
["liveNp","liveOutput","liveRepeat","livePrompt"].forEach(id=>$(id).addEventListener("input",()=>setManual(true)));
$("resetLivePreset").onclick=()=>{resetQuickPreset();tlog("Default 預設值已套用："+$("liveNp").value+" NP / "+$("liveOutput").value+" tokens / "+$("liveRepeat").value+" repeat")};

window.addEventListener("hashchange",()=>{renderWizard();document.querySelector(".wizard-page:not([hidden]) h2, #parameterPage:not([hidden]) h2")?.focus()});
renderWizard();

document.addEventListener("click",event=>{
  const pop=$("infoPop"),button=event.target.closest(".info");
  if(!button){if(!event.target.closest("#infoPop"))pop.hidden=true;return}
  event.preventDefault();event.stopPropagation();
  pop.textContent=button.dataset.info;pop.hidden=false;
  const box=button.getBoundingClientRect();
  pop.style.top=`${window.scrollY+box.bottom+8}px`;
  pop.style.left=`${Math.max(12,Math.min(window.scrollX+box.left,window.innerWidth-pop.offsetWidth-12))}px`;
});
document.addEventListener("keydown",event=>{if(event.key==="Escape")$("infoPop").hidden=true});

$("scaleOptions").onclick=event=>{const b=event.target.closest("[data-scale]");if(b){pickedScale=b.dataset.scale;$("machineScale").value=pickedScale;renderSelection()}};

function tlog(text,cls=""){
  if(text===tlast)return;tlast=text;
  const body=$("termBody"),t=new Date().toTimeString().slice(0,8);
  body.insertAdjacentHTML("beforeend",`<span class="tl ${cls}"><i>${t}</i> ${esc(text)}</span>\n`);
  body.scrollTop=body.scrollHeight;
}
function termOpen(on){$("termPanel").hidden=!on;$("terminalToggle").setAttribute("aria-expanded",String(on))}
$("terminalToggle").onclick=()=>termOpen($("termPanel").hidden);
$("termClear").onclick=()=>{$("termBody").textContent=""};
const helpHtml=`<h4>參數說明</h4><dl>
<dt>Service</dt><dd>已設定的模型服務（vLLM／llama.cpp）。TP、Context、Batch 由服務啟動參數決定，此處不會修改。</dd>
<dt>Model</dt><dd>偵測服務後列出的模型。</dd>
<dt>Concurrency (NP)</dt><dd>同時送出的請求數。越高總吞吐量通常越高，但每個請求延遲變長。</dd>
<dt>Output tokens</dt><dd>每個請求產生的長度。越長，TPOT／Decode 越準，但耗時越久。</dd>
<dt>Repeats</dt><dd>每組重複次數。越多平均越穩定，但耗時越長。</dd>
<dt>Prompt</dt><dd>送給模型的文字。輸入 token 數以服務實際回報為準。</dd>
<dt>Default</dt><dd>Mini-workstation：NP2、Output 1024、Repeat 3；Consumer／Server：NP1、Output 128、Repeat 1（暫定）。</dd></dl>`;
$("paramHelp").addEventListener("click",event=>{
  event.stopPropagation();const pop=$("infoPop");
  if(!pop.hidden&&pop.dataset.owner==="help"){pop.hidden=true;return}
  pop.innerHTML=helpHtml;pop.dataset.owner="help";pop.hidden=false;
  const b=event.currentTarget.getBoundingClientRect();
  pop.style.top=`${window.scrollY+b.bottom+10}px`;
  pop.style.left=`${Math.max(12,window.scrollX+b.right-pop.offsetWidth)}px`;
});

function syncFwSeg(){
  const sel=$("frameworkSelect");
  $("fwSeg").innerHTML=[...sel.options].map(o=>{const [name,status]=o.textContent.split(" — ");return `<button type="button" role="radio" class="fw-opt" data-fw="${esc(o.value)}" aria-checked="${o.value===sel.value}"><b>${esc(name)}</b><span>${esc(status||"")}</span></button>`}).join("");
}
new MutationObserver(syncFwSeg).observe($("frameworkSelect"),{childList:true,characterData:true,subtree:true});
$("frameworkSelect").addEventListener("change",syncFwSeg);
$("fwSeg").onclick=e=>{const b=e.target.closest("[data-fw]");if(!b)return;$("frameworkSelect").value=b.dataset.fw;$("frameworkSelect").dispatchEvent(new Event("change",{bubbles:true}))};
syncFwSeg();

function liveReady(kind){
  const msg=text=>{termOpen(true);tlog(text,"err");$("liveStatus").textContent=text;return false};
  if(!state.token)return msg("尚未連線：請在頁面上方輸入本機 Bearer Token 並按 Connect。");
  if(!(machine()?.live_services?.[framework()]||[]).length)return msg(`${machine()?.display_name||"此機器"} 的 ${framework()} 服務位址尚未設定（machines.local.json 的 live_services）。`);
  if(kind==="start"&&!$("liveModel").value)return msg("請先按「偵測實機模型」，再選模型。");
  return true;
}
if(tokenStore.get()){state.token=tokenStore.get();$("connectButton").click()}
