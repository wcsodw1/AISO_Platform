const state={catalog:null,mode:"public",category:null,product:null,tab:"SOP",previousView:"home"};
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

async function request(path,options={}){
  const response=await fetch(path,{cache:"no-store",...options});
  const type=response.headers.get("content-type")||"";
  const body=type.includes("json")?await response.json():await response.text();
  if(!response.ok)throw new Error(body.error||body||response.statusText);
  return body;
}

async function init(){
  try{
    const health=await request("/api/health");
    state.mode="local";
    state.catalog=await request("/api/products");
    $("modeBadge").textContent=health.data_root_ready?"本機管理版":"本機版 · 尚未建立資料夾";
    $("manageLink").classList.remove("hidden");
  }catch(error){
    state.mode="public";
    state.catalog=await request("data/products.json");
    $("modeBadge").textContent="公開唯讀版";
    $("modeBadge").classList.add("public");
  }
  $("productCount").textContent=state.catalog.products.length;
  $("updatedAt").textContent=`Updated ${state.catalog.updated_at||"-"}`;
  renderHome();
}

const productsFor=category=>state.catalog.products.filter(product=>product.category===category);
const categoryFor=id=>state.catalog.categories.find(category=>category.id===id);
function show(view){["homeView","categoryView","modelListView","deviceView","searchView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));window.scrollTo({top:0,behavior:"smooth"})}

function renderHome(){
  state.category=null;state.product=null;state.previousView="home";
  const grid=$("categoryGrid");grid.innerHTML="";
  state.catalog.categories.forEach(category=>{
    const products=productsFor(category.id);
    const button=document.createElement("button");
    button.className="category-card";
    button.innerHTML=`<span class="category-order">${esc(category.order)}</span><h2>${esc(category.name)}</h2><h3>${esc(category.name_zh)}</h3><p>${esc(category.description)}</p><div class="category-foot"><span>${products.length} 台設備</span><span>Detail →</span></div>`;
    button.onclick=()=>renderCategory(category.id);grid.appendChild(button);
  });
  show("homeView");
}

function renderCategory(id){
  const category=categoryFor(id);state.category=category;state.product=null;state.previousView="category";
  $("categoryEyebrow").textContent=`EQUIPMENT CATEGORY · ${category.order}`;
  $("categoryTitle").textContent=category.name;
  $("categoryTitleZh").textContent=category.name_zh;
  $("categoryDescription").textContent=category.description;
  const grid=$("deviceGrid");grid.innerHTML="";
  const products=productsFor(id);
  if(!products.length){grid.innerHTML='<div class="empty-state">這個類型目前沒有設備。</div>'}
  products.forEach(product=>{
    const card=document.createElement("button");card.className="device-card";
    card.innerHTML=`<p class="eyebrow">${esc(category.name)}</p><h3>${esc(product.name)}</h3><p>${esc(product.summary||product.positioning)}</p><div class="device-meta"><span>${esc(product.status)}</span><span>Detail →</span></div>`;
    card.onclick=()=>renderDevice(product.id);grid.appendChild(card);
  });
  show("categoryView");
}

function renderModelList(){
  state.category=null;state.product=null;state.previousView="models";
  const grid=$("modelListGrid");grid.innerHTML="";
  const matrix=state.catalog.model_matrix||[];
  if(!matrix.length){grid.innerHTML=empty("尚未建立 Model List");show("modelListView");return}
  matrix.forEach(group=>{
    const category=categoryFor(group.category)||{name:group.category,name_zh:group.category,order:"--"};
    const section=document.createElement("section");section.className=`model-group model-group-${esc(group.category)}`;
    section.innerHTML=`<header class="model-group-head"><span>${esc(category.order)}</span><div><h3>${esc(category.name)}</h3><p class="model-group-zh">${esc(category.name_zh)}</p><p class="model-group-summary">${esc(group.summary||"")}</p></div><strong>${(group.models||[]).length}</strong></header><div class="model-cards">${(group.models||[]).map(model=>`<article class="model-card"><div><h4>${esc(model.name)}</h4><p>${esc(model.use||"")}</p></div><span>${esc(model.status||"Recommended")}</span></article>`).join("")}</div>`;
    grid.appendChild(section);
  });
  show("modelListView");
}

function availableTabs(){
  return ["SOP","Benchmark","Scripts"];
}

function renderDevice(id){
  const product=state.catalog.products.find(item=>item.id===id);state.product=product;state.category=categoryFor(product.category);state.tab="SOP";state.previousView="device";
  $("deviceType").textContent=state.category.name;
  $("deviceTypeZh").textContent=state.category.name_zh;
  $("deviceName").textContent=product.name;$("deviceSummary").textContent="選擇 SOP、Benchmark 或 Scripts";$("deviceStatus").textContent="";
  renderTabs();show("deviceView");
}

function renderTabs(){
  const tabs=$("tabs");tabs.innerHTML="";
  availableTabs().forEach(name=>{const button=document.createElement("button");button.className=`tab-button${state.tab===name?" active":""}`;button.textContent=name;button.onclick=()=>{state.tab=name;renderTabs()};tabs.appendChild(button)});
  renderTabPanel();
}

function metricGrid(object){
  const entries=Object.entries(object||{});if(!entries.length)return empty("尚未填寫資料");
  return `<div class="metric-grid">${entries.map(([key,value])=>`<div class="metric"><label>${esc(key)}</label><strong>${esc(value||"待補充")}</strong></div>`).join("")}</div>`;
}
function empty(message="目前沒有資料"){return `<div class="empty-state">${esc(message)}</div>`}
function modelTable(models=[]){if(!models.length)return empty("尚未登錄模型");return `<table class="model-table"><thead><tr><th>Model</th><th>Status</th><th>Notes</th></tr></thead><tbody>${models.map(model=>`<tr><td>${esc(model.name)}</td><td>${esc(model.status)}</td><td>${esc(model.notes||"")}</td></tr>`).join("")}</tbody></table>`}

function benchmarkSummary(benchmark={}){
  const results=benchmark.results||[];
  if(!results.length)return empty("尚未登錄結構化 Benchmark 結果");
  const overview=metricGrid({
    "Test date":benchmark.date||"待確認",
    "Comparison":benchmark.comparison||"待確認",
    "Metrics":(benchmark.metrics||[]).join(" · ")||"待確認"
  });
  const cards=results.map(result=>`<article class="benchmark-card">
    <div class="benchmark-card-head"><div><p class="eyebrow">BENCHMARK RESULT</p><h4>${esc(result.model)}</h4></div><span>${esc(result.scope||"")}</span></div>
    <div class="benchmark-highlights">${(result.highlights||[]).map(item=>`<div class="benchmark-highlight"><label>${esc(item.metric)}</label><strong>${esc(item.result)}</strong><small>${esc(item.condition||"")}</small></div>`).join("")}</div>
    ${result.report?`<p class="report-reference">Report: ${esc(result.report)}</p>`:""}
  </article>`).join("");
  return `<section class="benchmark-overview">${overview}<div class="benchmark-results">${cards}</div></section>`;
}

function renderPublishedFiles(files=[],type){
  const label={documents:"SOP",benchmark:"Benchmark",scripts:"Scripts"}[type]||"檔案";
  if(!files.length)return empty(`尚未發布 ${label}`);
  return `<div class="file-list">${files.map(file=>`<div class="file-row"><span class="file-name">${esc(file.name)}</span><span class="file-type">${esc(file.extension||file.type)}</span><a class="file-link" href="${esc(encodeURI(file.url))}" target="_blank" rel="noopener">開啟</a></div>`).join("")}</div>`;
}

async function renderLocalFiles(kind,prefix=""){
  const panel=$("tabPanel");panel.innerHTML=prefix+empty("掃描資料夾中…");
  try{
    const data=await request(`/api/scan?product=${encodeURIComponent(state.product.id)}&kind=${encodeURIComponent(kind)}`);
    if(!data.items.length){panel.innerHTML=prefix+empty("資料夾目前沒有檔案");return}
    panel.innerHTML=prefix+`<div class="action-row"><button class="button secondary" data-open-folder="${esc(data.folder)}">開啟資料夾</button></div><div class="file-list">${data.items.map(file=>`<div class="file-row"><span class="file-name" title="${esc(file.path)}">${esc(file.name)}</span><span class="file-type">${esc(file.type)}</span><span><button class="button secondary" data-open-path="${esc(file.path)}">開啟</button></span></div>`).join("")}</div>`;
    bindLocalActions();
  }catch(error){panel.innerHTML=prefix+`<div class="note">${esc(error.message)}</div>`}
}

function renderTabPanel(){
  const product=state.product,panel=$("tabPanel");
  if(state.tab==="Overview"){panel.innerHTML=`<h3 class="content-title">設備概覽</h3>${metricGrid({Device:product.name,Type:state.category.name,Positioning:product.positioning,Status:product.status})}`;return}
  if(state.tab==="Hardware"){panel.innerHTML=`<h3 class="content-title">硬體規格</h3>${metricGrid(product.hardware)}`;return}
  if(state.tab==="Models"){panel.innerHTML=`<h3 class="content-title">模型清單</h3>${modelTable(product.models)}`;return}
  if(state.tab==="SOP"){
    panel.innerHTML='<h3 class="content-title">SOP</h3>';
    if(state.mode==="local")renderLocalFiles("documents");else panel.innerHTML+=renderPublishedFiles(product.published?.documents,"documents");return;
  }
  if(state.tab==="Benchmark"){
    const prefix=`<h3 class="content-title">Benchmark</h3>${benchmarkSummary(product.benchmark)}<h3 class="content-title report-title">Benchmark Reports</h3>`;
    if(state.mode==="local")renderLocalFiles("benchmark",prefix);else panel.innerHTML=prefix+renderPublishedFiles(product.published?.benchmark,"benchmark");return;
  }
  if(state.tab==="Scripts"){
    panel.innerHTML='<h3 class="content-title">Scripts</h3>';
    if(state.mode==="local")renderLocalFiles("scripts");else panel.innerHTML+=renderPublishedFiles(product.published?.scripts,"scripts");return;
  }
  if(state.tab==="Operations"){
    panel.innerHTML=`<div class="note"><strong>本機管理資訊</strong><br>${esc(product.operations?.notes||"尚未填寫操作資訊")}</div><div class="action-row" style="margin-top:16px"><button class="button secondary" data-copy="${esc(product.operations?.ssh||"")}" ${product.operations?.ssh?"":"disabled"}>複製 SSH 指令</button><a class="button secondary" href="manage.html?id=${encodeURIComponent(product.id)}">編輯設備</a></div>`;bindLocalActions();return;
  }
  if(state.tab==="Local Files"){renderLocalFiles("all");return}
}

function bindLocalActions(){
  document.querySelectorAll("[data-open-path],[data-open-folder]").forEach(button=>button.onclick=async()=>{try{await request("/api/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:button.dataset.openPath||button.dataset.openFolder})})}catch(error){alert(error.message)}});
  document.querySelectorAll("[data-copy]").forEach(button=>button.onclick=async()=>{await navigator.clipboard.writeText(button.dataset.copy);button.textContent="已複製"});
}

function searchableText(product){return JSON.stringify(product).toLowerCase()}
async function runSearch(query){
  const normalized=query.trim().toLowerCase();if(normalized.length<2){show(state.previousView==="device"?"deviceView":state.previousView==="category"?"categoryView":"homeView");return}
  const hits=state.catalog.products.filter(product=>searchableText(product).includes(normalized));
  let fileHits=[];if(state.mode==="local"){try{fileHits=(await request(`/api/search?q=${encodeURIComponent(normalized)}`)).items||[]}catch(error){fileHits=[]}}
  const rows=[...hits.map(product=>({title:product.name,description:product.positioning,action:"device",value:product.id})),...fileHits.map(file=>({title:file.name,description:file.path,action:"file",value:file.path}))];
  $("searchResults").innerHTML=rows.length?rows.map(row=>`<div class="search-result"><div><strong>${esc(row.title)}</strong><p>${esc(row.description)}</p></div><button class="button secondary" data-result-action="${row.action}" data-result-value="${esc(row.value)}">開啟</button></div>`).join(""):empty("沒有符合的設備或檔案");
  document.querySelectorAll("[data-result-action]").forEach(button=>button.onclick=()=>button.dataset.resultAction==="device"?renderDevice(button.dataset.resultValue):request("/api/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:button.dataset.resultValue})}));show("searchView");
}

document.querySelectorAll("[data-back]").forEach(button=>button.onclick=()=>{if(button.dataset.back==="home")renderHome();else if(button.dataset.back==="category")renderCategory(state.category.id);else if(button.dataset.back==="search")show(state.previousView==="device"?"deviceView":state.previousView==="category"?"categoryView":state.previousView==="models"?"modelListView":"homeView")});
$("modelListLink").onclick=renderModelList;
let searchTimer;$("globalSearch").addEventListener("input",event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>runSearch(event.target.value),220)});
init().catch(error=>{$("categoryGrid").innerHTML=`<div class="note">AISO Platform 載入失敗：${esc(error.message)}</div>`;$("modeBadge").textContent="載入失敗"});
