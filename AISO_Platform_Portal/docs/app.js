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
function machineMarkup(variant){
  const slots=variant==="server-eight"?8:variant==="server-dual"?2:4;
  return `<span class="projection-field"></span><span class="holo-machine machine-${esc(variant)}"><span class="machine-top"></span><span class="machine-front" style="--slot-count:${slots}">${Array.from({length:slots},()=>"<i></i>").join("")}</span><span class="machine-side"></span><span class="machine-core"></span></span><span class="projection-base"></span>`;
}
function hologramMedia(product){return `<div class="product-media product-hologram" role="img" aria-label="${esc(product.visual_alt||product.name)}">${machineMarkup(product.visual_variant)}<span class="product-media-note">${esc(product.visual_note||"SYSTEM CONCEPT · CHASSIS MODEL PENDING")}</span></div>`}
function depthPreviewMedia(product){
  const preview=product.preview_3d;
  return `<div class="product-media has-image product-depth-preview" data-depth-preview role="img" aria-label="${esc(preview.alt||`${product.name} interactive 3D preview`)}"><span class="depth-grid" aria-hidden="true"></span><span class="depth-orbit depth-orbit-back" aria-hidden="true"></span><span class="depth-orbit depth-orbit-front" aria-hidden="true"></span><span class="depth-glow" aria-hidden="true"></span><span class="depth-shadow" aria-hidden="true"></span><span class="depth-product-rig"><img class="depth-product-image" src="${esc(preview.image)}" alt="" loading="lazy" draggable="false"></span><span class="depth-glare" aria-hidden="true"></span><span class="depth-preview-badge"><i></i>${esc(preview.label||"3D PREVIEW")}</span><span class="depth-interaction-hint" aria-hidden="true">${esc(preview.hint||"MOVE CURSOR")}</span>${product.image_note?`<span class="product-media-note">${esc(product.image_note)}</span>`:""}</div>`;
}
function productMedia(product,category){
  if(product.preview_3d?.image)return depthPreviewMedia(product);
  if(product.image)return `<div class="product-media has-image${product.image_count?" multi-gpu":""}"><img src="${esc(product.image)}" alt="${esc(product.image_alt||product.name)}" loading="lazy">${product.image_count?`<strong class="product-media-count">× ${esc(product.image_count)}</strong>`:""}${product.image_note?`<span class="product-media-note">${esc(product.image_note)}</span>`:""}</div>`;
  if(product.visual_variant)return hologramMedia(product);
  const code=String(product.name||product.id).replace(/[^A-Za-z0-9+]/g,"").slice(0,12)||"AISO";
  return `<div class="product-media product-media-placeholder"><span>${esc(category?.name||product.category)}</span><strong>${esc(code)}</strong><small>PRODUCT IMAGE PENDING</small></div>`;
}
function bindProductDepth(root=document){
  root.querySelectorAll("[data-depth-preview]:not([data-depth-ready])").forEach(stage=>{
    stage.dataset.depthReady="true";
    const host=stage.closest(".device-card")||stage;
    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    if(host===stage){stage.tabIndex=0}
    let activePointer=null,startX=0,startY=0,dragging=false,frame=null,pendingPoint=null;
    let keyboardX=0,keyboardY=0,suppressClickUntil=0;

    function applyNormalized(nx,ny,px=(nx+.5)*100,py=(ny+.5)*100){
      if(reducedMotion.matches)return;
      stage.style.setProperty("--depth-ry",`${(nx*28).toFixed(2)}deg`);
      stage.style.setProperty("--depth-rx",`${(-ny*18).toFixed(2)}deg`);
      stage.style.setProperty("--depth-tx",`${(nx*28).toFixed(1)}px`);
      stage.style.setProperty("--depth-ty",`${(ny*12).toFixed(1)}px`);
      stage.style.setProperty("--depth-shadow-x",`${(-nx*24).toFixed(1)}px`);
      stage.style.setProperty("--depth-shadow-y",`${(-ny*5).toFixed(1)}px`);
      stage.style.setProperty("--depth-glare-x",`${px.toFixed(1)}%`);
      stage.style.setProperty("--depth-glare-y",`${py.toFixed(1)}%`);
    }
    function applyPoint(clientX,clientY){
      const box=stage.getBoundingClientRect();
      const px=Math.min(1,Math.max(0,(clientX-box.left)/box.width));
      const py=Math.min(1,Math.max(0,(clientY-box.top)/box.height));
      applyNormalized(px-.5,py-.5,px*100,py*100);
    }
    function queuePoint(clientX,clientY){
      pendingPoint=[clientX,clientY];
      if(frame)return;
      frame=requestAnimationFrame(()=>{frame=null;if(pendingPoint){applyPoint(...pendingPoint);pendingPoint=null}});
    }
    function activate(){if(!reducedMotion.matches)stage.classList.add("is-depth-active")}
    function reset(){
      stage.classList.remove("is-depth-active");
      keyboardX=0;keyboardY=0;
      ["--depth-ry","--depth-rx"].forEach(name=>stage.style.setProperty(name,"0deg"));
      ["--depth-tx","--depth-ty","--depth-shadow-x","--depth-shadow-y"].forEach(name=>stage.style.setProperty(name,"0px"));
      stage.style.setProperty("--depth-glare-x","50%");stage.style.setProperty("--depth-glare-y","35%");
    }
    function releasePointer(event){
      if(stage.hasPointerCapture?.(event.pointerId))stage.releasePointerCapture(event.pointerId);
      activePointer=null;
    }

    stage.addEventListener("pointerenter",event=>{if(event.pointerType!=="touch"){activate();queuePoint(event.clientX,event.clientY)}});
    stage.addEventListener("pointermove",event=>{
      if(event.pointerType==="touch"){
        if(activePointer!==event.pointerId)return;
        const dx=event.clientX-startX,dy=event.clientY-startY;
        if(!dragging&&Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){dragging=true;activate()}
        if(!dragging)return;
        if(event.cancelable)event.preventDefault();
      }else activate();
      queuePoint(event.clientX,event.clientY);
    });
    stage.addEventListener("pointerleave",event=>{if(event.pointerType!=="touch")reset()});
    stage.addEventListener("pointerdown",event=>{
      if(event.pointerType!=="touch"||reducedMotion.matches)return;
      activePointer=event.pointerId;startX=event.clientX;startY=event.clientY;dragging=false;
      stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener("pointerup",event=>{
      if(activePointer!==event.pointerId)return;
      if(dragging){if(event.cancelable)event.preventDefault();suppressClickUntil=Date.now()+450;window.setTimeout(reset,280)}
      releasePointer(event);dragging=false;
    });
    stage.addEventListener("pointercancel",event=>{if(activePointer===event.pointerId)releasePointer(event);dragging=false;reset()});
    host.addEventListener("click",event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
    host.addEventListener("focus",activate);
    host.addEventListener("blur",reset);
    host.addEventListener("keydown",event=>{
      const delta=.2;
      if(event.key==="Escape"){reset();return}
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)||reducedMotion.matches)return;
      event.preventDefault();activate();
      if(event.key==="ArrowLeft")keyboardX=Math.max(-.5,keyboardX-delta);
      if(event.key==="ArrowRight")keyboardX=Math.min(.5,keyboardX+delta);
      if(event.key==="ArrowUp")keyboardY=Math.max(-.5,keyboardY-delta);
      if(event.key==="ArrowDown")keyboardY=Math.min(.5,keyboardY+delta);
      applyNormalized(keyboardX,keyboardY);
    });
    function syncMotionPreference(){stage.toggleAttribute("data-reduced-motion",reducedMotion.matches);if(reducedMotion.matches)reset()}
    reducedMotion.addEventListener?.("change",syncMotionPreference);syncMotionPreference();
  });
}
function categoryVisual(category,products){
  if(category.id==="consumer"||category.id==="workstation"){
    const images=products.filter(product=>product.image).slice(0,2);
    return `<div class="category-visual category-visual-${esc(category.id)}-products" aria-hidden="true">${images.map((product,index)=>`<img class="category-product-image image-${index+1}" src="${esc(product.image)}" alt="" loading="lazy">`).join("")}<span class="category-projection-base"></span></div>`;
  }
  if(category.id==="server"){
    const seen=new Set();
    const images=products.filter(product=>product.image&&!seen.has(product.image)&&seen.add(product.image)).slice(0,3);
    if(images.length)return `<div class="category-visual category-visual-server-products" aria-hidden="true">${images.map((product,index)=>`<img class="category-product-image image-${index+1}" src="${esc(product.image)}" alt="" loading="lazy">`).join("")}<span class="category-projection-base"></span></div>`;
    return `<div class="category-visual category-visual-server" aria-hidden="true"><span class="category-machine machine-one">${machineMarkup("server-dual")}</span><span class="category-machine machine-two">${machineMarkup("server-eight")}</span></div>`;
  }
  const product=products.find(item=>item.image);
  if(product)return `<div class="category-visual category-visual-${esc(category.id)}-image" aria-hidden="true"><img class="category-product-image" src="${esc(product.image)}" alt="" loading="lazy"><span class="category-projection-base"></span></div>`;
  return `<div class="category-visual category-visual-workstation" aria-hidden="true">${machineMarkup("workstation")}<span class="category-projection-base"></span></div>`;
}
function show(view,scroll=true){["homeView","categoryView","modelListView","resourcesView","aboutView","deviceView","searchView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));if(scroll)window.scrollTo({top:0,behavior:"smooth"})}
function setSiteNav(active){document.querySelectorAll("[data-site-nav]").forEach(item=>item.toggleAttribute("aria-current",item.dataset.siteNav===active))}
function previousViewId(){return {home:"homeView",category:"categoryView",models:"modelListView",resources:"resourcesView",about:"aboutView",device:"deviceView"}[state.previousView]||"homeView"}

function renderHome(scroll=true){
  state.category=null;state.product=null;state.previousView="home";
  setSiteNav("home");
  const grid=$("categoryGrid");grid.innerHTML="";
  state.catalog.categories.forEach(category=>{
    const products=productsFor(category.id);
    const card=document.createElement("article");card.className="category-card";
    card.innerHTML=`<button class="category-card-main" type="button" aria-expanded="false"><span class="category-order">${esc(category.order)}</span>${categoryVisual(category,products)}<h2>${esc(category.name)}</h2><h3>${esc(category.name_zh)}</h3><p>${esc(category.description)}</p><div class="category-foot"><span>${products.length} Products</span><span>Models ↓</span></div></button><div class="category-product-drawer" aria-label="${esc(category.name)} 機型">${products.map(product=>`<button class="category-product-link" type="button" data-product-id="${esc(product.id)}"><span class="category-product-thumb">${product.image?`<img src="${esc(product.image)}" alt="" loading="lazy">`:""}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.positioning||product.status)}</small></span><em>View →</em></button>`).join("")}</div>`;
    const main=card.querySelector(".category-card-main");
    main.onclick=()=>renderCategory(category.id);
    card.onmouseenter=()=>main.setAttribute("aria-expanded","true");
    card.onmouseleave=()=>main.setAttribute("aria-expanded","false");
    card.querySelectorAll("[data-product-id]").forEach(button=>button.onclick=()=>renderDevice(button.dataset.productId));
    grid.appendChild(card);
  });
  show("homeView",scroll);
}

function renderCategory(id){
  const category=categoryFor(id);state.category=category;state.product=null;state.previousView="category";
  setSiteNav("products");
  $("categoryEyebrow").textContent=`PRODUCT LINE · ${category.order}`;
  $("categoryTitle").textContent=category.name;
  $("categoryTitleZh").textContent=category.name_zh;
  $("categoryDescription").textContent=category.description;
  const grid=$("deviceGrid");grid.innerHTML="";
  const products=productsFor(id);
  if(!products.length){grid.innerHTML='<div class="empty-state">這個類型目前沒有設備。</div>'}
  products.forEach(product=>{
    const card=document.createElement("button");card.className="device-card";
    card.innerHTML=`${productMedia(product,category)}<div class="device-card-body"><p class="eyebrow">${esc(category.name)}</p><h3>${esc(product.name)}</h3><p>${esc(product.summary||product.positioning)}</p><div class="device-meta"><span>${esc(product.status)}</span><span>View Product →</span></div></div>`;
    card.onclick=()=>renderDevice(product.id);grid.appendChild(card);
  });
  bindProductDepth(grid);
  show("categoryView");
}

function renderModelList(){
  state.category=null;state.product=null;state.previousView="models";
  setSiteNav("models");
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

function renderResources(){
  state.category=null;state.product=null;state.previousView="resources";setSiteNav("resources");
  const grid=$("resourceProductGrid");grid.innerHTML="";
  state.catalog.products.forEach(product=>{
    const category=categoryFor(product.category)||{name:product.category};
    const button=document.createElement("button");button.className="resource-product-card";
    button.innerHTML=`<span>${esc(category.name)}</span><strong>${esc(product.name)}</strong><small>${esc(product.status||product.positioning)}</small><em>Open Resources →</em>`;
    button.onclick=()=>renderDevice(product.id);grid.appendChild(button);
  });
  show("resourcesView");
}

function renderAbout(){state.category=null;state.product=null;state.previousView="about";setSiteNav("about");show("aboutView")}

function availableTabs(){return ["Overview","Hardware","Models","SOP","Benchmark","Scripts"]}

function renderDevice(id,tab="Overview"){
  const product=state.catalog.products.find(item=>item.id===id);state.product=product;state.category=categoryFor(product.category);state.tab=tab;state.previousView="device";
  setSiteNav("products");
  $("deviceType").textContent=state.category.name;
  $("deviceTypeZh").textContent=state.category.name_zh;
  $("deviceName").textContent=product.name;$("deviceSummary").textContent="查看本產品的規格、模型、SOP、Benchmark 與 Scripts";$("deviceStatus").textContent="";
  $("deviceMedia").innerHTML=productMedia(product,state.category);
  bindProductDepth($("deviceMedia"));
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
function normalizedFolder(path){return String(path||"").replace(/\\/g,"/").replace(/^\/+|\/+$/g,"").toLowerCase()}
async function runSearch(query){
  const normalized=query.trim().toLowerCase();if(normalized.length<2){show(previousViewId());return}
  const hits=state.catalog.products.filter(product=>searchableText(product).includes(normalized));
  let fileHits=[];if(state.mode==="local"){try{fileHits=(await request(`/api/search?q=${encodeURIComponent(normalized)}`)).items||[]}catch(error){fileHits=[]}}
  const productFolders=new Set(state.catalog.products.map(product=>normalizedFolder(product.folder)));
  fileHits=fileHits.filter(file=>file.type!=="directory"||!productFolders.has(normalizedFolder(file.path)));
  const rows=[...hits.map(product=>({title:product.name,description:product.positioning,action:"device",value:product.id})),...fileHits.map(file=>({title:file.name,description:file.path,action:"file",value:file.path}))];
  $("searchResults").innerHTML=rows.length?rows.map(row=>`<div class="search-result"><div><strong>${esc(row.title)}</strong><p>${esc(row.description)}</p></div><button class="button secondary" data-result-action="${row.action}" data-result-value="${esc(row.value)}">開啟</button></div>`).join(""):empty("沒有符合的設備或檔案");
  document.querySelectorAll("[data-result-action]").forEach(button=>button.onclick=()=>button.dataset.resultAction==="device"?renderDevice(button.dataset.resultValue):request("/api/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:button.dataset.resultValue})}));show("searchView");
}

document.querySelectorAll("[data-back]").forEach(button=>button.onclick=()=>{if(button.dataset.back==="home")renderHome();else if(button.dataset.back==="category")renderCategory(state.category.id);else if(button.dataset.back==="search")show(previousViewId())});
function goProducts(){renderHome(false);setSiteNav("products");const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior="auto";$("productsSection").scrollIntoView({block:"start"});root.style.scrollBehavior=previous}
$("homeBrandLink").addEventListener("click",event=>{event.preventDefault();renderHome()});
$("homeLink").onclick=renderHome;
$("productsLink").onclick=goProducts;
$("modelListLink").onclick=renderModelList;
$("resourcesLink").onclick=renderResources;
$("aboutLink").onclick=renderAbout;
$("heroProductsLink").onclick=goProducts;
$("heroModelsLink").onclick=renderModelList;
$("homeResourcesLink").onclick=renderResources;
document.querySelectorAll("[data-footer-route]").forEach(button=>button.onclick=()=>({products:goProducts,models:renderModelList,resources:renderResources,about:renderAbout}[button.dataset.footerRoute]||renderHome)());
let searchTimer;$("globalSearch").addEventListener("input",event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>runSearch(event.target.value),220)});
init().catch(error=>{$("categoryGrid").innerHTML=`<div class="note">AISO Platform 載入失敗：${esc(error.message)}</div>`;$("modeBadge").textContent="載入失敗"});

/* v1.18.7 - homepage cursor depth */
(() => {
  const cardSelector = ".brand-site .category-card";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeCard = null;
  let animationFrame = 0;
  let pendingPoint = null;

  function resetCard(card) {
    if (!card) return;
    card.classList.remove("is-home-depth-active");
    card.style.setProperty("--home-depth-tx", "0px");
    card.style.setProperty("--home-depth-ty", "0px");
    card.style.setProperty("--home-depth-tx-soft", "0px");
    card.style.setProperty("--home-depth-ty-soft", "0px");
    card.style.setProperty("--home-depth-rx", "0deg");
    card.style.setProperty("--home-depth-ry", "0deg");
  }

  function updateCard(card, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height - 0.5) * 2));

    card.style.setProperty("--home-depth-tx", `${(x * 13).toFixed(2)}px`);
    card.style.setProperty("--home-depth-ty", `${(y * 8).toFixed(2)}px`);
    card.style.setProperty("--home-depth-tx-soft", `${(x * 7).toFixed(2)}px`);
    card.style.setProperty("--home-depth-ty-soft", `${(y * 4).toFixed(2)}px`);
    card.style.setProperty("--home-depth-rx", `${(-y * 3.5).toFixed(2)}deg`);
    card.style.setProperty("--home-depth-ry", `${(x * 5).toFixed(2)}deg`);
    card.classList.add("is-home-depth-active");
  }

  document.addEventListener("pointermove", (event) => {
    if (reduceMotion.matches || event.pointerType === "touch") return;

    const target = event.target instanceof Element ? event.target : null;
    const card = target ? target.closest(cardSelector) : null;

    if (!card) {
      if (activeCard) resetCard(activeCard);
      activeCard = null;
      return;
    }

    if (activeCard && activeCard !== card) resetCard(activeCard);
    activeCard = card;
    pendingPoint = { card, clientX: event.clientX, clientY: event.clientY };

    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      if (!pendingPoint) return;
      updateCard(pendingPoint.card, pendingPoint.clientX, pendingPoint.clientY);
      pendingPoint = null;
    });
  }, { passive: true });

  document.addEventListener("pointerout", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const card = target ? target.closest(cardSelector) : null;
    if (!card || card.contains(event.relatedTarget)) return;
    resetCard(card);
    if (activeCard === card) activeCard = null;
  }, { passive: true });

  window.addEventListener("blur", () => {
    resetCard(activeCard);
    activeCard = null;
  });
})();
