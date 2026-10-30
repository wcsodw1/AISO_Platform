const state={catalog:null,mode:"public",access:"public",category:null,product:null,tab:"SOP",previousView:"home"};
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

const EN_COPY = {
  "半導體製造龍頭 POC：於 PRO6000 8 GPU 系統中啟用 4 張 GPU，完成 GPT-OSS-120B 與 Llama-3.3-70B Benchmark。": "Leading semiconductor manufacturer POC: 4 of the 8 GPUs enabled on the PRO6000 system; GPT-OSS-120B and Llama-3.3-70B benchmarks completed.",
  "把模型與算力，": "Turn models and compute",
  "轉化為真正可用的企業 AI 能力。": "into enterprise AI that works.",
  "從 Consumer AI PC、AI Workstation 到 AI Server，依模型規模、工作負載與部署需求，選擇經過實測驗證的本地 AI 系統。": "Choose local AI systems for your models, workloads and deployment needs—from personal AI PCs to enterprise servers.",
  "輕量模型，直接對話。": "Local models. Direct conversations.",
  "你好，請用一句話介紹你自己。": "Hi, introduce yourself in one sentence.",
  "你好！我是你的 AI 助理，可以協助你解答問題、整理資訊與撰寫內容。": "Hi! I can help you answer questions, organize information and write content.",
  "內建聊天介面，直接與本地模型對話。": "Chat directly with a local model using the built-in interface.",
  "同一個介面，多種推論引擎。": "One workspace. Multiple inference engines.",
  "比較這兩份部署方案。": "Compare these two deployment plans.",
  "我會從模型需求、硬體容量與服務方式整理差異，協助後續驗證。": "I will compare model requirements, hardware capacity and serving options.",
  "透過 OpenAI-compatible 連線串接 llama.cpp、vLLM 或 SGLang，讓使用者從統一聊天介面操作。": "Connect llama.cpp, vLLM or SGLang through an OpenAI-compatible API in one chat workspace.",
  "推論服務與使用介面，各司其職。": "An inference engine behind a familiar chat interface.",
  "幫我列出 POC 驗證項目。": "List the validation steps for this POC.",
  "建議確認模型可用性、回應品質、延遲與併發能力，並保留每次測試條件。": "Check model availability, response quality, latency and concurrency. Record the conditions for every test.",
  "SGLang 提供推論 API，可搭配 Open WebUI；也能串接自建聊天介面、Gradio 或 Streamlit 應用。": "Use SGLang with Open WebUI, or build a custom frontend with Gradio or Streamlit.",
  "把算力變成真正能用的 AI 應用": "From compute to everyday applications.",
  "每個應用都在 AISO 驗證過的硬體上執行。將滑鼠移到下方展開目前的應用，點選即可開啟公開安全的互動展示。": "Explore a curated Blender demo and two planned applications, each organized around domain-specific skills.",
  "從自然語言到可編輯的 3D 場景": "Turn a prompt into an editable 3D scene.",
  "室內設計 Agent：一句話生成可編輯的 3D 空間提案": "Plan spaces, furniture and finishes.",
  "UI 美感設計 Agent：從需求到有質感、可直接使用的介面": "From a brief to a coherent, responsive interface.",
  "以對話描述場景需求，由本地 AI 產生 Blender Python、執行並根據 traceback 自動修復。此為公開安全的錄製展示，不連接內網模型。": "Describe a scene, generate Blender Python and review the repair workflow. This curated demo does not connect to a private model endpoint.",
  "依工作需求選擇合適算力": "Match the system to the workload.",
  "將滑鼠移至 Consumer、Workstation 或 Server，即可展開該類別的現有機型；不同設備對應不同模型規模、使用人數、Context 與部署情境。": "Explore systems by category, then compare model capacity, concurrency, context and deployment fit.",
  "從需求定義到 AI 真正進入應用": "From requirements to working AI.",
  "AISO 不只提供硬體。": "More than hardware.",
  "從需求到上線，六個階段全程帶你；右側為真實專案的每一步。": "Six stages connect requirements, validation and delivery. Follow the project examples below.",
  "定義工作負載": "Define the workload",
  "選擇適用方案": "Select the right system",
  "設計架構與初步 BOM": "Design architecture and BOM",
  "驗證設計後定案": "Validate before commitment",
  "建置整合交付": "Build, integrate and deliver",
  "導入 OrientAI 軟體服務": "Launch OrientAI services",
  "企業級 AI 知識庫參考架構": "Enterprise knowledge infrastructure",
  "千人規模地端知識庫": "On-premises knowledge services for 1,000+ users",
  "AMD 3+1 算力池 ＋ 獨立 NVIDIA 節點": "AMD 3+1 compute pool with a separate NVIDIA node",
  "分兩期 · Master/Worker 同機 · 持續規劃中": "Two phases · Co-located master/worker · Planning in progress",
  "AMD / NVIDIA 不同配置的 Benchmark，驗證設計": "Validate AMD and NVIDIA configurations through benchmarks",
  "第一期 X1 先上線；第二期加入 X2–X4": "Phase 1: X1 goes live. Phase 2: add X2–X4.",
  "知識庫 · RAG · Agent 服務上線": "Launch knowledge, RAG and agent services",
  "半導體晶圓龍頭": "Leading Semiconductor Foundry",
  "從模型驗證到現場部署，以分階段 POC 確認模型可用性、量化效能與後續導入條件。": "A phased POC from model validation to on-site deployment, covering usability, quantization and deployment readiness.",
  "選定驗證模型": "Selected for validation",
  "驗證模型可用性與推論效能": "Validate model availability and inference performance",
  "比較不同量化版本": "Compare quantization variants",
  "評估多 Token 預測的生成加速效果": "Evaluate generation speed with multi-token prediction",
  "評估推測解碼的延遲與吞吐表現": "Evaluate speculative decoding latency and throughput",
  "評估更低精度下的品質與顯存需求": "Evaluate quality and memory use at lower precision",
  "依測試結果建議機器與硬體規格": "Size hardware based on test results",
  "現場環境建置與服務啟動": "Prepare the environment and launch services on site",
  "問題排除與效能優化": "Troubleshoot issues and optimize performance",
  "確認模型可用性與效能 → 驗證 aiDAPTIVE 加速能力 → 完成客戶指定進階測試 → 支援客戶現場導入": "Validate models → Verify acceleration → Complete advanced tests → Support on-site deployment",
  "目前已完成模型選擇；後續階段依驗證結果推進。加速效果、模型相容性與部署規格以實測確認。": "Model selection is complete. Later stages depend on validation; acceleration, compatibility and system sizing remain subject to testing.",
  "盤點 use case、使用人數、模型、效能、容量、預算與既有環境。": "Define use cases, users, models, performance, capacity, budget and existing infrastructure.",
  "選擇 Consumer、Workstation、Server 或 Data Center，以及適合的軟硬體組合。": "Select the system tier and software stack that fit the workload.",
  "在真實硬體與使用情境中取得可比較的答案。": "Produce comparable evidence on real hardware and workloads.",
  "模型、框架與硬體相容性": "Model, framework and hardware compatibility",
  "TTFT、TPOT、Throughput 與 Context": "TTFT, TPOT, throughput and context",
  "併發、記憶體與壓力邊界": "Concurrency, memory and capacity limits",
  "vLLM／Open WebUI／llama.cpp 應用驗證": "Application validation with vLLM, Open WebUI and llama.cpp",
  "OUTPUT · PoC 驗證報告與適用邊界": "OUTPUT · POC report and operating limits",
  "把已驗證方案轉換成可採購、可擴充的落地架構。": "Turn validated configurations into deployable, scalable architecture.",
  "服務、節點與資料流": "Services, nodes and data flows",
  "依負載推算運算容量": "Size compute capacity for the workload",
  "頻寬、容量、HA 與隔離": "Bandwidth, capacity, HA and isolation",
  "建議規格與方案提案": "Recommended specifications and solution proposal",
  "OUTPUT · Solution Architecture 與 BOM": "OUTPUT · Solution architecture and BOM",
  "將通過驗證的架構建置到正式環境並完成移交。": "Deploy the validated architecture and hand over the production environment.",
  "硬體、驅動與環境建置": "Hardware, drivers and environment setup",
  "模型服務與 Endpoint": "Model serving and endpoints",
  "平台、權限與應用整合": "Platform, access and application integration",
  "驗收、SOP 與知識移轉": "Acceptance, operating procedures and knowledge transfer",
  "將能力接入 RAG、Agent、Blender、Enterprise AI 與客戶工作流程。": "Integrate RAG, agents, Blender and enterprise AI into customer workflows.",
  "依機器類型整理的適用模型": "Model options by system tier",
  "依目前已收錄的 Benchmark、Scripts 與 Prepared 紀錄整理；實際效能仍取決於量化、Context 與併發設定。": "Based on available benchmarks, scripts and preparation records. Performance depends on quantization, context and concurrency.",
  "已有正式實測結果": "Formal measurements available",
  "已備妥測試腳本，尚不等於效能驗證": "Test scripts available; performance not yet validated",
  "已建立模型或環境準備紀錄": "Model or environment preparation recorded",
  "產品與技術資源": "Product and technical resources",
  "資源以產品為單位整理，避免文件脫離硬體、模型與測試條件。先選擇設備，再查看對應的 SOP、Benchmark 與 Scripts。": "Resources stay tied to their hardware and test conditions. Select a system to find its guides, benchmarks and scripts.",
  "操作與部署指南": "Operation and deployment guides",
  "安裝、啟動、環境準備與標準操作流程，讓團隊能以一致方式重現環境。": "Installation, startup and operating procedures for reproducible environments.",
  "效能驗證結果": "Performance evidence",
  "保留測試條件、模型版本與核心指標，協助比較不同設備和工作負載。": "Compare systems and workloads using recorded conditions, model versions and metrics.",
  "測試與驗證工具": "Test and validation tools",
  "提供可重現的 Benchmark、Quick Test 與 Multi-NP 腳本，支援實機驗證。": "Reproducible benchmark, quick-test and multi-concurrency scripts.",
  "選擇產品後即可查看該設備實際可用的技術資源。": "Choose a system to view its available technical resources.",
  "讓企業在投入部署前，先看見可執行的答案。": "Make deployment decisions with actionable evidence.",
  "模型清單與硬體規格很容易取得，真正困難的是判斷一套系統在特定 Context、併發與工作流程中是否值得部署。AISO 的角色，是把這些不確定性轉化成可檢查的技術依據。": "Specifications alone cannot show how a system behaves at a given context length, concurrency or workflow. AISO turns these questions into testable evidence.",
  "我們以實機條件連結設備、模型、推論框架與應用環境；每項建議都回到測試證據、可重現流程與部署邊界，讓選型不只停在規格表，而能進入真實工作。": "We connect hardware, models, inference frameworks and applications through real-system testing, reproducible procedures and clear deployment limits.",
  "保留設備、模型、日期、Context、併發與指標，讓結論可追溯。": "Record the system, model, date, context, concurrency and metrics behind each conclusion.",
  "以 SOP、Scripts 與版本紀錄，使環境與結果能被團隊重現。": "Keep procedures, scripts and versions so teams can reproduce the environment and results.",
  "依實際工作負載選擇系統，不以最高規格取代需求判斷。": "Size the system for its workload rather than choosing by specifications alone.",
  "從需求盤點、選型到部署，歡迎直接與我們聯繫。": "Talk with us about requirements, system selection and deployment.",
  "跨硬體、跨 Backend 的可重現效能驗證": "Reproducible testing across hardware and backends",
  "固定模型、量化、Prompt、Input／Output 與測試次數，只讓硬體與 Backend 成為主要變因。從 Smoke Test 到 Multi-NP 壓力測試，保留完整環境與結果證據。": "Keep models, quantization, prompts and workloads consistent. Compare hardware and backends with complete environment and result records.",
  "每一次實測，都要留下可以重現與比較的完整答案。": "Every run leaves a reproducible, comparable record.",
  "測了什麼": "What was tested",
  "在哪裡測": "Where it ran",
  "怎麼測": "How it was tested",
  "效果是多少": "What it delivered",
  "不是顯卡跑分。": "Validate the whole system.",
  "是整台機器能否跑起 AI 服務的效能證明。": "Prove it can serve real AI workloads.",
  "從模型能不能完整載入、Backend 與 Endpoint 能不能穩定啟動，到真實使用者進來後的回應速度、併發吞吐與長時間穩定性，Benchmark 將規格表轉換成可驗收、可部署的服務能力。": "Verify model loading, service startup, response latency, concurrent throughput and sustained stability before deployment.",
  "模型裝得下": "Load the model",
  "VRAM、Memory、Quant 與 Context 不發生 OOM": "Fit model, quantization and context within memory",
  "服務跑得起": "Run the service",
  "Driver、Framework、Backend 與 Endpoint 可穩定運行": "Stable drivers, framework, backend and endpoint",
  "使用者等得起": "Respond in time",
  "TTFT、TPOT 與 E2E 符合互動體驗": "TTFT, TPOT and E2E meet interaction targets",
  "多人撐得住": "Handle concurrency",
  "NP／Concurrency 下仍保有 Aggregate TPS 與成功率": "Maintain aggregate throughput and success rate under load",
  "長時間穩得住": "Sustain the workload",
  "溫度、功耗、錯誤率與輸出正確性通過驗證": "Validate thermals, power, error rates and output quality",
  "可服務的模型 × 精度 × 使用人數 × 效能邊界": "Models × Precision × Users × Operating limits",
  "從需求資料開始規劃 AI Data Center": "Start with your AI infrastructure requirements",
  "從模型、使用人數與服務目標出發，規劃 Compute、Network、Storage、Power、Cooling 與持續擴充能力。": "Plan compute, network, storage, power, cooling and growth around models, users and service targets.",
  "人數、同時使用量與服務模式": "Users, concurrent demand and service model",
  "模型規模、Context、TPS 與 Latency": "Model size, context, throughput and latency",
  "既有機房、Network、Storage 與 HA": "Existing facilities, network, storage and HA",
  "安全隔離、預算與時程": "Security boundaries, budget and schedule",
  "成長預估與擴充策略": "Growth forecasts and scaling strategy",
  "設定、執行、驗證": "Configure. Run. Validate.",
  "1 YAML → 1 Runner → Framework Adapters。連接已啟動的模型服務；每組結果保留測試條件。": "One YAML → One runner → Framework adapters. Connect an existing service and preserve each run's conditions.",
  "最新測試矩陣 · Full @4096": "Baseline status · Full @4096",
  "2026-10-19 使用者提供的 baseline 狀態。DS 驗證不代表 NP2／NP4 Full 已通過；此表不會由未審核測試自動覆寫。": "Baseline snapshot: 2026-10-19. DS validation does not certify NP2/NP4 Full. Unreviewed runs do not overwrite this record.",
  "本機執行紀錄": "Local run history",
  "TTFT／TPOT／Decode TPS 為 client-observed streaming 指標；多 token chunk 會影響估計。Aggregate TPS 依整批完成時間計算，失敗批次不產生正式吞吐。": "TTFT, TPOT and decode TPS use client-observed streaming. Multi-token chunks affect estimates. Aggregate TPS uses complete batch time; failed batches have no formal throughput.",
  "把目標先說清楚，再開始選設備。": "Define the outcome before selecting hardware.",
  "RAG、Agent、生成、訓練或專業應用": "RAG, agents, generation, training or specialist applications",
  "使用人數、併發、模型、Context 與 SLA": "Users, concurrency, models, context and SLA",
  "既有環境、預算、安全與時程": "Existing infrastructure, budget, security and timeline",
  "需求定義與工作負載基準": "Requirements and workload baseline",
  "依需求選擇合適的系統層級與軟硬體組合。": "Match the system tier and software stack to the requirements.",
  "Consumer、Workstation、Server 或 Data Center": "Consumer, workstation, server or data center",
  "GPU、Memory、Storage 與 Network": "GPU, memory, storage and network",
  "選型建議與候選配置": "System recommendations and candidate configurations",
  "以 Benchmark 與 PoC 驗證設計，通過後定案。": "Validate the design through benchmarks and POC before approval.",
  "TTFT、TPOT、Throughput、Context 與併發壓力邊界": "TTFT, TPOT, throughput, context and concurrency limits",
  "驗證報告與定案配置": "Validation report and approved configuration",
  "依需求與選型設計架構與初步 BOM。": "Develop the architecture and initial BOM from requirements.",
  "Solution Architecture 與初步 BOM": "Solution architecture and initial BOM",
  "以 OrientAI 軟體服務，讓 AI 進入日常工作。": "Bring AI into daily work with OrientAI services.",
  "知識問答與文件解析": "Knowledge Q&A and document parsing",
  "跨系統任務自動化與多 Agent 協作": "Cross-system automation and multi-agent collaboration",
  "Agent 管理、權限與 Token 用量監控": "Agent management, permissions and token monitoring",
  "Blender Agent 與專業應用": "Blender Agent and specialist applications",
  "OrientAI 軟體服務上線": "OrientAI services go live",
  "面向個人與團隊的本地 AI 運算產品，適合日常推論、模型驗證與輕量測試。": "Local AI systems for everyday inference, model validation and lightweight testing.",
  "為專業開發與內容工作設計的 AI 工作站，支援更大模型、長 Context 與進階測試。": "Workstations for development and creative work, with larger models and longer context.",
  "面向企業部署與多人服務的 AI Server，提供大型模型、長 Context 與高併發運算能力。": "Enterprise servers for large models, long context and concurrent users.",
  "從需求盤點、容量分析與架構設計，到 BOM、PoC、部署、驗收及後續擴充的完整 AI 基礎設施規劃。": "AI infrastructure planning from requirements and capacity to architecture, validation, deployment and scale.",
  "適合本機單人使用、快速驗證與輕量 Multi-NP 測試；以 Q4 GGUF 為主。": "Primarily Q4 GGUF models for local use, quick validation and light concurrency testing.",
  "適合專業開發、長 Context、程式碼與較大型 Q4 GGUF 模型測試。": "Models for development, long context, coding and larger Q4 GGUF workloads.",
  "適合大型模型、長 Context 與多使用者併發服務；以下模型已有正式 Benchmark。": "Large models for long context and concurrent services, with formal benchmarks recorded.",
  "輕量對話／快速驗證": "Lightweight chat / Quick validation",
  "通用推理／本機助理": "General reasoning / Local assistant",
  "通用生成／文件處理": "General generation / Document processing",
  "進階生成／Multi-NP 測試": "Advanced generation / Concurrency testing",
  "通用生成／高 Context": "General generation / Long context",
  "通用生成／壓力測試": "General generation / Stress testing",
  "程式碼生成／Agent Coding": "Code generation / Agent coding",
  "程式碼理解／軟體開發": "Code understanding / Software development",
  "推理／分析工作": "Reasoning / Analysis",
  "高品質通用生成": "High-quality general generation",
  "大型推理／高階生成": "Large-model reasoning / Advanced generation",
  "高 Context 併發測試": "Long-context concurrency testing",
  "大型推理／多使用者服務": "Large-model reasoning / Multi-user services",
  "企業級通用生成／長 Context": "Enterprise generation / Long context",
  "收錄 Ryzen AI MAX+ 395 的 Benchmark 結果、完整測試與快速驗證腳本。": "Benchmark results, full tests and quick-validation scripts for Ryzen AI MAX+ 395.",
  "收錄 Ryzen AI MAX+ 392 的 Benchmark、Multi-NP 與快速驗證腳本。": "Benchmarks, concurrency tests and quick-validation scripts for Ryzen AI MAX+ 392.",
  "收錄 Ryzen AI MAX+ 395 的單人、進階與 Multi-NP 壓力測試腳本。": "Single-user, advanced and concurrent stress-test scripts for Ryzen AI MAX+ 395.",
  "以 NVIDIA GB10 Grace Blackwell 為核心的桌面 AI 工作站；正式型號、儲存與實測結果將於設備確認後補齊。": "A desktop AI workstation based on NVIDIA GB10 Grace Blackwell. Exact configuration and measurements are pending.",
  "SPARKLE Intel Arc Pro B70（Intel Xe2／Battlemage）AI 工作站 GPU 研究已建立；官方規格與第三方公開 Benchmark 可查閱，AISO 內部正式結果仍待實測。": "SPARKLE Intel Arc Pro B70 research includes official specifications and third-party benchmarks. AISO formal measurements are pending.",
  "目前僅收錄官方規格與第三方公開研究；AISO VERIFIED 結果尚待 formal run。": "Official specifications and third-party research only. AISO VERIFIED results await a formal run.",
  "集中查看 HPE 兩卡設備的 SOP 與操作文件；Benchmark 待後續實機測試補充。": "Operating procedures for the HPE dual-GPU system. Benchmarks await on-device testing.",
  "尚無 HPE 2 GPU 專屬 Benchmark。": "No dedicated HPE dual-GPU benchmark is available yet.",
  "測試設備為 PRO6000 8 GPU；本次 Benchmark 實際啟用其中 4 張 GPU。": "An eight-GPU PRO6000 system with four GPUs active for this benchmark.",
  "面向大型生成式 AI 推論與訓練的 10U 八卡 Blackwell Ultra 系統；正式 AISO 方案與實測結果確認後補齊。": "A 10U, eight-GPU Blackwell Ultra system for large-scale inference and training. AISO configuration and measurements are pending."
};
const ZH_COPY = Object.fromEntries(Object.entries(EN_COPY).map(([zh,en])=>[en.replaceAll("'","’"),zh]));
function bi(value){const raw=String(value??"");const en=EN_COPY[raw];const zh=ZH_COPY[raw];return en?`${esc(en)}<span class="copy-zh" lang="zh-Hant">${esc(raw)}</span>`:zh?`${esc(raw)}<span class="copy-zh" lang="zh-Hant">${esc(zh)}</span>`:esc(raw)}

function mountBenchmarkSection(){
  const productsSection=$("productsSection");
  if(!productsSection||$("benchmarkSection"))return;
  const tier=(order,name,items)=>`<article><header><span>${order}</span><h3>${name}</h3></header><ul>${items.map(([label,vendor])=>`<li class="${vendor}"><i></i>${label}</li>`).join("")}</ul></article>`;
  productsSection.insertAdjacentHTML("afterend",`<section id="benchmarkSection" class="home-section benchmark-hero"><div class="bh-top"><div class="bh-copy"><p class="eyebrow">EVIDENCE ENGINE</p><h2>BENCHMARK</h2><p class="bh-tagline">PROOF, NOT SPECS.</p><p class="bh-lead">Same model. Same workload. Different hardware.<br>Measured, logged and compared across Intel, AMD and NVIDIA.<span class="copy-zh" lang="zh-Hant">同模型、同負載、不同硬體；每筆結果都保留條件與 Log 證據。</span></p><div class="bh-actions"><div class="bh-group"><span class="bh-label">Run benchmark online</span><div class="bh-row"><a id="runBenchmarkButton" class="button primary bh-btn" href="benchmark.html"><b>Run benchmark →</b><small lang="zh-Hant">實測</small></a></div></div><div class="bh-group"><span class="bh-label">Result of Benchmark</span><div class="bh-row"><a class="button bh-btn" href="lmcache.html"><b>Stress Test →</b><small lang="zh-Hant">壓力測試</small></a><a class="button bh-btn" href="gptoss-v2.html"><b>LMCache v.s aiDAPTIV →</b><small lang="zh-Hant">快取效能對照</small></a></div></div><p>Access code required</p></div></div><div class="bh-metrics" aria-label="Metrics we record"><div><b>TTFT</b><small>Time to first token</small></div><div><b>TPOT</b><small>Time per output token</small></div><div><b>TPS</b><small>Prompt · Decode · Aggregate</small></div><div><b>E2E</b><small>End-to-end latency</small></div></div></div><div class="bh-matrix" aria-label="Systems we measure">${tier("01","CONSUMER",[["ROG AI MAX 395","amd"],["TUF AI MAX 392","amd"],["Intel Arc B390","intel"]])}${tier("02","MINI-WORKSTATION",[["AISO1 · AI MAX+ 395","amd"],["AMD ASRock","amd"],["Intel Arc Pro B70","intel"]])}${tier("03","SERVER",[["NVIDIA RTX PRO 6000","nvidia"],["NVIDIA B300","nvidia"],["AMD Instinct MI350X","amd"]])}</div><div class="bh-proof"><article><span>01</span><b>Same model file</b><small>Exact repo, quantization and SHA256</small></article><article><span>02</span><b>Same workload</b><small>Fixed prompts, NP, input and output length</small></article><article><span>03</span><b>Real metrics</b><small>Recorded per request, not estimated</small></article><article><span>04</span><b>Logs before PASS</b><small>Unverified results stay labelled</small></article></div></section>`);
}

mountBenchmarkSection();

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
    state.access=health.access||health.mode||"internal";
    state.mode=state.access==="admin"?"local":"public";
    state.catalog=await request("/api/products");
    if(state.access==="admin"){
      $("modeBadge").textContent=health.data_root_ready?"Local admin":"Local · Data folders pending";
      $("manageLink").classList.remove("hidden");
    }else{
      $("modeBadge").textContent="Internal · Read only";
      $("modeBadge").classList.add("internal");
    }
  }catch(error){
    state.mode="public";
    state.access="public";
    state.catalog=await request("data/products.json");
    $("modeBadge").textContent="Public · Read only";
    $("modeBadge").classList.add("public");
  }
  $("productCount").textContent=state.catalog.products.length;
  $("updatedAt").textContent=`Updated ${(state.catalog.updated_at||"").slice(0,10).replaceAll("-",".")||"-"}`;
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

    function orbitOnce(){
      if(reducedMotion.matches||stage.classList.contains("is-depth-orbiting"))return;
      stage.classList.remove("is-depth-orbiting");
      void stage.offsetWidth;
      stage.classList.add("is-depth-orbiting");
      const rig=stage.querySelector(".depth-product-rig");
      rig?.addEventListener("animationend",()=>stage.classList.remove("is-depth-orbiting"),{once:true});
    }

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

    stage.addEventListener("pointerenter",event=>{if(event.pointerType!=="touch"){activate();orbitOnce();queuePoint(event.clientX,event.clientY)}});
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
    host.addEventListener("focus",()=>{activate();orbitOnce()});
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
  if(category.image)return `<div class="category-visual category-visual-${esc(category.id)}-image" aria-hidden="true"><img class="category-product-image" src="${esc(category.image)}" alt="" loading="lazy"><span class="category-projection-base"></span></div>`;
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
const FILE_MIME={pdf:"application/pdf",md:"text/markdown",csv:"text/csv",json:"application/json",txt:"text/plain",html:"text/html",sh:"text/x-shellscript",ps1:"text/plain",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};
document.addEventListener("click",async event=>{
  const button=event.target.closest("[data-protected]");if(!button)return;
  event.preventDefault();if(button.dataset.busy)return;
  const open=async()=>{
    button.dataset.busy="1";const label=button.textContent;button.textContent="Decrypting…";
    try{
      const bytes=await AISOGate.fetchProtected(button.dataset.protected);
      const ext=(button.dataset.ext||"").toLowerCase(),blob=new Blob([bytes],{type:FILE_MIME[ext]||"application/octet-stream"}),url=URL.createObjectURL(blob);
      if(ext==="pdf"||ext==="html"||ext==="txt"||ext==="png"||ext==="jpg"||ext==="jpeg"||ext==="webp")window.open(url,"_blank","noopener");
      else{const link=document.createElement("a");link.href=url;link.download=button.dataset.name||"download";link.click()}
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){window.alert(error.message)}
    finally{button.textContent=label;delete button.dataset.busy}
  };
  AISOGate.require(open,()=>{});
});
const GATED_VIEWS=new Set(["referenceDetailView","categoryView","modelListView","resourcesView","deviceView","searchView"]);
function show(view,scroll=true){
  if(GATED_VIEWS.has(view)&&window.AISOGate&&!AISOGate.isUnlocked()){
    AISOGate.require(()=>show(view,scroll),()=>setSiteNav(["about","consulting","references"].find(key=>!$(key==="about"?"aboutView":key+"View").classList.contains("hidden"))||"home"));
    return;
  }
  ["homeView","categoryView","modelListView","resourcesView","aboutView","consultingView","referencesView","referenceDetailView","deviceView","searchView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));if(scroll)window.scrollTo({top:0,behavior:"smooth"})}
function setSiteNav(active){const group={capabilities:"home",products:"home",models:"guide",resources:"guide",consulting:"guide",references:"guide"}[active]||active;document.querySelectorAll("[data-site-nav]").forEach(item=>item.toggleAttribute("aria-current",item.dataset.siteNav===group));document.querySelectorAll("[data-guide-tab]").forEach(tab=>tab.toggleAttribute("aria-current",tab.dataset.guideTab===active))}
function previousViewId(){return {home:"homeView",category:"categoryView",models:"modelListView",resources:"resourcesView",about:"aboutView",consulting:"consultingView",references:"referencesView",device:"deviceView"}[state.previousView]||"homeView"}

function orbitHomeCard(card){
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||card.classList.contains("is-home-orbiting"))return;
  card.classList.remove("is-home-orbiting");
  void card.offsetWidth;
  card.classList.add("is-home-orbiting");
  const visual=card.querySelector(".category-visual");
  const lastImage=visual?.querySelector(".category-product-image:last-of-type");
  const finish=()=>card.classList.remove("is-home-orbiting");
  lastImage?.addEventListener("animationend",finish,{once:true});
  window.setTimeout(finish,2200);
}

function renderHome(scroll=true){
  state.category=null;state.product=null;state.previousView="home";
  setSiteNav("home");
  const grid=$("categoryGrid");grid.innerHTML="";
  state.catalog.categories.forEach(category=>{
    const products=productsFor(category.id);
    const card=document.createElement("article");card.className="category-card";
    const isPlanning=category.id==="data-center";
    card.innerHTML=`<button class="category-card-main" type="button" aria-expanded="false"><span class="category-order">${esc(category.order)}</span>${categoryVisual(category,products)}<h2>${esc(category.name)}</h2><h3>${esc(category.name_zh)}</h3><p>${bi(category.description)}</p><div class="category-foot"><span>${isPlanning?"Solution Planning":`${products.length} Products`}</span><span>${isPlanning?"Plan →":"Models ↓"}</span></div></button><div class="category-product-drawer" aria-label="${esc(category.name)} ${isPlanning?"規劃流程":"機型"}">${isPlanning?'<div class="category-planning-link"><strong>REQUIREMENT → ARCHITECTURE → DEPLOYMENT</strong><small>Start with your AI infrastructure requirements</small></div>':products.map(product=>`<button class="category-product-link" type="button" data-product-id="${esc(product.id)}"><span class="category-product-thumb">${product.image?`<img src="${esc(product.image)}" alt="" loading="lazy">`:""}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.positioning||product.status)}</small></span><em>View →</em></button>`).join("")}</div>`;
    const main=card.querySelector(".category-card-main");
    main.onclick=()=>renderCategory(category.id);
    card.onmouseenter=()=>{main.setAttribute("aria-expanded","true");orbitHomeCard(card)};
    card.onmouseleave=()=>main.setAttribute("aria-expanded","false");
    main.onfocus=()=>orbitHomeCard(card);
    card.querySelectorAll("[data-product-id]").forEach(button=>button.onclick=()=>renderDevice(button.dataset.productId));
    grid.appendChild(card);
  });
  renderAccessPolicy();
  show("homeView",scroll);
}

function renderAccessPolicy(){
  const policy=state.catalog.access_policy||{};
  const tierGrid=$("accessTierGrid"),capabilityGrid=$("accessCapabilityGrid");
  if(!tierGrid||!capabilityGrid)return;
  const rank={public:0,internal:1,admin:2};
  const current=rank[state.access]??0;
  tierGrid.innerHTML=(policy.tiers||[]).map((tier,index)=>`<article class="access-tier${tier.id===state.access?" is-current":""}"><span>${String(index+1).padStart(2,"0")} / ${esc(tier.label)}</span><h3>${esc(tier.name)}</h3><p>${esc(tier.description)}</p>${tier.id===state.access?'<strong>YOUR CURRENT ACCESS</strong>':""}</article>`).join("");
  capabilityGrid.innerHTML=(policy.capabilities||[]).map(item=>{
    const planned=item.availability==="planned";
    const allowed=current>=(rank[item.access]??0);
    const status=planned?"PLANNED":allowed?"AVAILABLE":`REQUIRES ${String(item.access).toUpperCase()}`;
    return `<article class="access-capability${allowed&&!planned?" is-available":""}"><div><span>${esc(item.access)}</span><b>${esc(status)}</b></div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p></article>`;
  }).join("");
}

function renderCategory(id){
  const category=categoryFor(id);state.category=category;state.product=null;state.previousView="category";
  setSiteNav("products");
  $("categoryEyebrow").textContent=`PRODUCT LINE · ${category.order}`;
  $("categoryTitle").textContent=category.name;
  $("categoryTitleZh").textContent=category.name_zh;
  $("categoryDescription").innerHTML=bi(category.description);
  const grid=$("deviceGrid");grid.innerHTML="";
  if(id==="data-center"){
    grid.className="data-center-planner";
    grid.innerHTML=`<section class="dc-hero"><div><span>AI INFRASTRUCTURE</span><h3>FROM ONE SYSTEM<br>TO A COMPLETE FACILITY.</h3><p>Plan compute, network, storage, power, cooling and growth around models, users and service targets.</p></div><figure><img src="${esc(category.image)}" alt="三座獨立排列的 AI Data Center 機櫃" loading="eager"></figure></section><section class="dc-intake"><header><span>START HERE</span><h3>BUILD YOUR AI DATA CENTER</h3><p>Tell AISO what you need. We translate the workload into compute, network, storage and an executable infrastructure plan.</p></header><div class="dc-intake-grid"><span><b>AI USE CASE</b>RAG · Agent · Training · Inference</span><span><b>USERS &amp; CONCURRENCY</b>Users, concurrent demand and service model</span><span><b>MODEL &amp; CONTEXT</b>Model size, context, throughput and latency</span><span><b>INFRASTRUCTURE</b>Existing facilities, network, storage and HA</span><span><b>CONSTRAINTS</b>Security boundaries, budget and schedule</span><span><b>FUTURE SCALE</b>Growth forecasts and scaling strategy</span></div></section><section class="dc-pipeline"><header><span>DATA CENTER WORKFLOW</span><h3>FROM REQUIREMENT TO SCALE.</h3></header><ol>${["Requirement Intake","Workload & Capacity Analysis","Compute / GPU Sizing","Architecture Design","Infrastructure Design","BOM & Solution Proposal","PoC / Benchmark Validation","Deployment","Integration & Acceptance","Operation / Scale"].map((step,index)=>`<li><span>${String(index+1).padStart(2,"0")}</span><strong>${step}</strong></li>`).join("")}</ol></section>`;
    show("categoryView");return;
  }
  grid.className="device-grid";
  const products=productsFor(id);
  if(!products.length){grid.innerHTML='<div class="empty-state">No systems in this category yet.</div>'}
  products.forEach(product=>{
    const card=document.createElement("button");card.className="device-card";
    card.innerHTML=`${productMedia(product,category)}<div class="device-card-body"><p class="eyebrow">${esc(category.name)}</p><h3>${esc(product.name)}</h3><p>${bi(product.summary||product.positioning)}</p><div class="device-meta"><span>${esc(product.status)}</span><span>View Product →</span></div></div>`;
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
  if(!matrix.length){grid.innerHTML=empty("No model list available");show("modelListView");return}
  matrix.forEach(group=>{
    const category=categoryFor(group.category)||{name:group.category,name_zh:group.category,order:"--"};
    const section=document.createElement("section");section.className=`model-group model-group-${esc(group.category)}`;
    section.innerHTML=`<header class="model-group-head"><span>${esc(category.order)}</span><div><h3>${esc(category.name)}</h3><p class="model-group-zh">${esc(category.name_zh)}</p><p class="model-group-summary">${bi(group.summary||"")}</p></div><strong>${(group.models||[]).length}</strong></header><div class="model-cards">${(group.models||[]).map(model=>`<article class="model-card"><div><h4>${esc(model.name)}</h4><p>${bi(model.use||"")}</p></div><span>${esc(model.status||"Recommended")}</span></article>`).join("")}</div>`;
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

function renderConsulting(){state.category=null;state.product=null;state.previousView="consulting";setSiteNav("consulting");show("consultingView")}

function renderReferences(){state.category=null;state.product=null;state.previousView="references";setSiteNav("references");show("referencesView")}
function renderReferenceCase(){state.previousView="references";setSiteNav("references");show("referenceDetailView")}

function renderAbout(){state.category=null;state.product=null;state.previousView="about";setSiteNav("about");show("aboutView")}

function availableTabs(){return ["Overview","Hardware","Models","SOP","Benchmark","Scripts"]}

function renderDevice(id,tab="Overview"){
  const product=state.catalog.products.find(item=>item.id===id);state.product=product;state.category=categoryFor(product.category);state.tab=tab;state.previousView="device";
  setSiteNav("products");
  $("deviceType").textContent=state.category.name;
  $("deviceTypeZh").textContent=state.category.name_zh;
  $("deviceName").textContent=product.name;$("deviceSummary").textContent="Explore specifications, models, guides, benchmarks and scripts.";$("deviceStatus").textContent="";
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
  const entries=Object.entries(object||{});if(!entries.length)return empty("No data available");
  return `<div class="metric-grid">${entries.map(([key,value])=>`<div class="metric"><label>${esc(key)}</label><strong>${esc(value||"Pending")}</strong></div>`).join("")}</div>`;
}
function empty(message="No data available",zh=""){return `<div class="empty-state">${esc(message)}${zh?`<span class="copy-zh" lang="zh-Hant">${esc(zh)}</span>`:""}</div>`}
function modelTable(models=[]){if(!models.length)return empty("No models registered");return `<table class="model-table"><thead><tr><th>Model</th><th>Status</th><th>Notes</th></tr></thead><tbody>${models.map(model=>`<tr><td>${esc(model.name)}</td><td>${esc(model.status)}</td><td>${esc(model.notes||"")}</td></tr>`).join("")}</tbody></table>`}

function benchmarkSummary(benchmark={}){
  const results=benchmark.results||[];
  if(!results.length)return empty("No structured benchmark results recorded yet","尚未登錄結構化 Benchmark 結果");
  const overview=metricGrid({
    "Test date":benchmark.date||"Pending confirmation",
    "Comparison":benchmark.comparison||"Pending confirmation",
    "Metrics":(benchmark.metrics||[]).join(" · ")||"Pending confirmation"
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
  return `<div class="file-list">${files.map(file=>`<div class="file-row"><span class="file-name">${esc(file.name)}</span><span class="file-type">${esc(file.extension||file.type)}</span>${file.encrypted?`<button class="file-link" type="button" data-protected="${esc(file.url)}" data-name="${esc(file.name)}" data-ext="${esc(file.extension||"")}">Open</button>`:`<a class="file-link" href="${esc(encodeURI(file.url))}" target="_blank" rel="noopener">Open</a>`}</div>`).join("")}</div>`;
}

async function renderLocalFiles(kind,prefix=""){
  const panel=$("tabPanel");panel.innerHTML=prefix+empty("掃描資料夾中…");
  try{
    const data=await request(`/api/scan?product=${encodeURIComponent(state.product.id)}&kind=${encodeURIComponent(kind)}`);
    if(!data.items.length){panel.innerHTML=prefix+empty("No files in this folder yet","資料夾目前沒有檔案");return}
    panel.innerHTML=prefix+`<div class="action-row"><button class="button secondary" data-open-folder="${esc(data.folder)}">Open folder</button></div><div class="file-list">${data.items.map(file=>`<div class="file-row"><span class="file-name" title="${esc(file.path)}">${esc(file.name)}</span><span class="file-type">${esc(file.type)}</span><span><button class="button secondary" data-open-path="${esc(file.path)}">Open</button></span></div>`).join("")}</div>`;
    bindLocalActions();
  }catch(error){panel.innerHTML=prefix+`<div class="note">${esc(error.message)}</div>`}
}

function renderTabPanel(){
  const product=state.product,panel=$("tabPanel");
  if(state.tab==="Overview"){panel.innerHTML=`<h3 class="content-title">System overview</h3>${metricGrid({Device:product.name,Type:state.category.name,Positioning:product.positioning,Status:product.status})}`;return}
  if(state.tab==="Hardware"){panel.innerHTML=`<h3 class="content-title">Hardware specifications</h3>${metricGrid(product.hardware)}`;return}
  if(state.tab==="Models"){panel.innerHTML=`<h3 class="content-title">Model list</h3>${modelTable(product.models)}`;return}
  if(state.tab==="SOP"){
    panel.innerHTML='<h3 class="content-title">SOP</h3>';
    if(state.mode==="local")renderLocalFiles("documents");else panel.innerHTML+=renderPublishedFiles(product.published?.documents,"documents");return;
  }
  if(state.tab==="Benchmark"){
    const prefix=`<h3 class="content-title">Benchmark</h3>${benchmarkSummary(product.benchmark)}<h3 class="content-title report-title">Benchmark Reports</h3>`;
    if(state.mode==="local")renderLocalFiles("benchmark",prefix);else panel.innerHTML=prefix+renderPublishedFiles(product.published?.benchmark,"benchmark");return;
  }
  if(state.tab==="Scripts"){
    const prefix='<h3 class="content-title">Scripts</h3>';
    panel.innerHTML=prefix;
    if(state.mode==="local")renderLocalFiles("scripts",prefix);else panel.innerHTML+=renderPublishedFiles(product.published?.scripts,"scripts");return;
  }
  if(state.tab==="Operations"){
    panel.innerHTML=`<div class="note"><strong>Local management</strong><br>${esc(product.operations?.notes||"尚未填寫操作資訊")}</div><div class="action-row" style="margin-top:16px"><button class="button secondary" data-copy="${esc(product.operations?.ssh||"")}" ${product.operations?.ssh?"":"disabled"}>Copy SSH command</button><a class="button secondary" href="manage.html?id=${encodeURIComponent(product.id)}">Edit system</a></div>`;bindLocalActions();return;
  }
  if(state.tab==="Local Files"){renderLocalFiles("all");return}
}

function bindLocalActions(){
  document.querySelectorAll("[data-open-path],[data-open-folder]").forEach(button=>button.onclick=async()=>{try{await request("/api/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:button.dataset.openPath||button.dataset.openFolder})})}catch(error){alert(error.message)}});
  document.querySelectorAll("[data-copy]").forEach(button=>button.onclick=async()=>{await navigator.clipboard.writeText(button.dataset.copy);button.textContent="Copied"});
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
  $("searchResults").innerHTML=rows.length?rows.map(row=>`<div class="search-result"><div><strong>${esc(row.title)}</strong><p>${esc(row.description)}</p></div><button class="button secondary" data-result-action="${row.action}" data-result-value="${esc(row.value)}">Open</button></div>`).join(""):empty("No matching systems or files");
  document.querySelectorAll("[data-result-action]").forEach(button=>button.onclick=()=>button.dataset.resultAction==="device"?renderDevice(button.dataset.resultValue):request("/api/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:button.dataset.resultValue})}));show("searchView");
}

document.querySelectorAll("[data-back]").forEach(button=>button.onclick=()=>{if(button.dataset.back==="home")renderHome();else if(button.dataset.back==="category")renderCategory(state.category.id);else if(button.dataset.back==="references")renderReferences();else if(button.dataset.back==="search")show(previousViewId())});
function goProducts(){renderHome(false);setSiteNav("products");const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior="auto";$("productsSection").scrollIntoView({block:"start"});root.style.scrollBehavior=previous}
function goCapabilities(){renderHome(false);setSiteNav("capabilities");const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior="auto";$("capabilitiesSection").scrollIntoView({block:"start"});root.style.scrollBehavior=previous}
function scrollHomeTo(target){const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior="auto";target?.scrollIntoView({block:"start"});root.style.scrollBehavior=previous}
function goBenchmark(){renderHome(false);setSiteNav("benchmark");scrollHomeTo($("benchmarkSection"))}
const homeMenu=$("homeMenu");
const setHomeMenu=open=>{homeMenu.classList.toggle("open",open);$("homeLink").setAttribute("aria-expanded",String(open))};
homeMenu.addEventListener("pointerenter",event=>{if(event.pointerType!=="touch")setHomeMenu(true)});
homeMenu.addEventListener("pointerleave",()=>setHomeMenu(false));
homeMenu.addEventListener("keydown",event=>{if(event.key==="Escape"){setHomeMenu(false);$("homeLink").focus()}});
document.addEventListener("click",event=>{if(!homeMenu.contains(event.target))setHomeMenu(false)});
homeMenu.querySelectorAll(".nav-dropdown button").forEach(button=>button.addEventListener("click",()=>setHomeMenu(false)));
homeMenu.querySelectorAll("[data-home-target]").forEach(button=>button.addEventListener("click",()=>({overview:()=>renderHome()}[button.dataset.homeTarget])()));
$("consultingTeaserButton").onclick=renderConsulting;
$("seeReferencesButton").onclick=renderReferences;
document.querySelectorAll("[data-ref]").forEach(button=>button.onclick=()=>({process:()=>{renderConsulting();selectTier("data-center")},"02":renderReferenceCase,contact:renderAbout}[button.dataset.ref])());
document.querySelectorAll("[data-guide-tab]").forEach(tab=>tab.onclick=()=>({consulting:renderConsulting,references:renderReferences,models:renderModelList,resources:renderResources}[tab.dataset.guideTab])());
function routeHash(){
  const key=location.hash.replace(/^#\/?/,"").toLowerCase();
  const routes={overview:()=>renderHome(),applications:goCapabilities,products:goProducts,consulting:renderConsulting,references:renderReferences,benchmark:goBenchmark,guide:renderConsulting,models:renderModelList,documents:renderResources,resources:renderResources,about:renderAbout,contact:()=>{renderAbout();requestAnimationFrame(()=>$("contactSection")?.scrollIntoView({block:"start"}))}};
  routes[key]?.();
}
window.addEventListener("hashchange",routeHash);
$("homeBrandLink").addEventListener("click",event=>{event.preventDefault();renderHome()});
$("homeLink").onclick=()=>{if(window.matchMedia("(hover: none)").matches&&!homeMenu.classList.contains("open")){setHomeMenu(true);return}setHomeMenu(false);renderHome()};
$("productsLink").onclick=goProducts;
$("capabilitiesLink").onclick=goCapabilities;
$("benchmarkLink").onclick=goBenchmark;
$("guideLink").onclick=renderConsulting;
$("aboutLink").onclick=renderAbout;
$("heroProductsLink").onclick=goProducts;
$("heroModelsLink").onclick=renderModelList;
$("homeResourcesLink").onclick=renderResources;
document.querySelectorAll("[data-footer-route]").forEach(button=>button.onclick=()=>({products:goProducts,capabilities:goCapabilities,models:renderModelList,resources:renderResources,about:renderAbout,contact:()=>{renderAbout();requestAnimationFrame(()=>$("contactSection")?.scrollIntoView({behavior:"smooth",block:"start"}))}}[button.dataset.footerRoute]||renderHome)());

document.querySelector('[data-footer-route="benchmark"]').onclick=goBenchmark;

const agentDemoButton=$("runAgentDemo");
if(agentDemoButton){
  agentDemoButton.onclick=()=>{
    const demo=document.querySelector("[data-agent-demo]");
    const steps=[...document.querySelectorAll("#agentDemoSteps span")];
    const reply=$("agentDemoReply"),result=$("agentDemoResult");
    demo.classList.remove("is-complete");steps.forEach(step=>step.classList.remove("is-active","is-done"));
    result.setAttribute("aria-hidden","true");reply.textContent="Interpreting scene, material, lighting, and camera requirements…";
    agentDemoButton.disabled=true;agentDemoButton.textContent="RUNNING…";
    steps.forEach((step,index)=>window.setTimeout(()=>{
      steps.slice(0,index).forEach(previous=>{previous.classList.remove("is-active");previous.classList.add("is-done")});
      step.classList.add("is-active");
      if(index===steps.length-1)window.setTimeout(()=>{
        step.classList.remove("is-active");step.classList.add("is-done");demo.classList.add("is-complete");
        result.setAttribute("aria-hidden","false");reply.textContent="Scene generated, validated, and delivered as editable Blender geometry.";
        agentDemoButton.disabled=false;agentDemoButton.textContent="REPLAY DEMO ↻";
      },600);
    },index*650));
  };
}

const consultingDetails={
  DEFINE:{intro:"Define the outcome before selecting hardware.",items:[["USE CASE","RAG, agents, generation, training or specialist applications"],["DEMAND","Users, concurrency, models, context and SLA"],["CONSTRAINTS","Existing infrastructure, budget, security and timeline"]],output:"Requirements and workload baseline"},
  SELECT:{intro:"Match the system tier and software stack to the requirements.",items:[["LEVEL","Consumer, workstation, server or data center"],["COMPUTE","GPU, memory, storage and network"],["STACK & COMPATIBILITY","模型、推論框架與硬體相容性"]],output:"System recommendations and candidate configurations"},
  VERIFY:{intro:"Validate the design through benchmarks and POC before approval.",items:[["BENCHMARK & CAPACITY","TTFT, TPOT, throughput, context and concurrency limits"],["POC","Application validation with vLLM, Open WebUI and llama.cpp"]],output:"Validation report and approved configuration"},
  DESIGN:{intro:"Develop the architecture and initial BOM from requirements.",items:[["ARCHITECTURE","Services, nodes and data flows"],["GPU SIZING","Size compute capacity for the workload"],["NETWORK / STORAGE","Bandwidth, capacity, HA and isolation"],["BOM","Recommended specifications and solution proposal"]],output:"Solution architecture and initial BOM"},
  DEPLOY:{intro:"Deploy the validated architecture and hand over the production environment.",items:[["INSTALL","Hardware, drivers and environment setup"],["SERVE","Model serving and endpoints"],["INTEGRATE","Platform, access and application integration"],["ACCEPT","Acceptance, operating procedures and knowledge transfer"]],output:"Production-ready AI System"},
  APPLICATION:{intro:"Bring AI into daily work with OrientAI services.",items:[["RAG & KNOWLEDGE","Knowledge Q&A and document parsing"],["AI AGENT","Cross-system automation and multi-agent collaboration"],["GOVERNANCE","Agent management, permissions and token monitoring"],["CREATIVE / 3D","Blender Agent and specialist applications"]],output:"OrientAI services go live"}
};
document.querySelectorAll(".consulting-flow-six>span").forEach(step=>{
  const name=step.querySelector("strong")?.textContent?.trim();
  const detail=consultingDetails[name];if(!detail)return;
  step.tabIndex=0;step.setAttribute("role","button");step.setAttribute("aria-expanded","false");
  step.insertAdjacentHTML("beforeend",`<div class="flow-step-detail"><p>${bi(detail.intro)}</p><ul style="--flow-cols:${detail.items.length}">${detail.items.map(item=>`<li><b>${esc(item[0])}</b><em>${bi(item[1])}</em></li>`).join("")}</ul><footer><small>OUTPUT</small><b>${bi(detail.output)}</b></footer></div>`);
  const setExpanded=value=>step.setAttribute("aria-expanded",String(value));
  step.addEventListener("mouseenter",()=>setExpanded(true));step.addEventListener("mouseleave",()=>setExpanded(false));
  step.addEventListener("focus",()=>setExpanded(true));step.addEventListener("blur",()=>setExpanded(false));
  step.addEventListener("click",()=>setExpanded(step.getAttribute("aria-expanded")!=="true"));
  step.addEventListener("keydown",event=>{if(event.key==="Escape"){setExpanded(false);step.blur()}});
});

const showreel=$("showreelSection");
if(showreel){
  const track=showreel.querySelector('.interface-track');
  const slides=[...showreel.querySelectorAll('.interface-slide')];
  const selectors=[...showreel.querySelectorAll('[data-interface-index]')];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let current=0,paused=reduced.matches,hovered=false,focused=false,visible=false;
  const setSlide=index=>{
    current=(index+slides.length)%slides.length;
    track.style.transform=`translateX(-${current*100}%)`;
    slides.forEach((slide,i)=>{slide.inert=i!==current;slide.setAttribute('aria-hidden',String(i!==current))});
    selectors.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===current)));
    $('interfacePosition').textContent=`0${current+1} / 03 · ${selectors[current].textContent}`;
  };
  const playback=()=>{$('interfaceAuto').textContent=paused?'Play':'Pause';$('interfaceAuto').setAttribute('aria-label',paused?'Play automatic rotation':'Pause automatic rotation')};
  const manual=index=>{paused=true;playback();setSlide(index)};
  selectors.forEach((button,i)=>button.onclick=()=>manual(i));
  $('interfacePrev').onclick=()=>manual(current-1);
  $('interfaceNext').onclick=()=>manual(current+1);
  $('interfaceAuto').onclick=()=>{paused=!paused;playback()};
  showreel.addEventListener('mouseenter',()=>hovered=true);
  showreel.addEventListener('mouseleave',()=>hovered=false);
  showreel.addEventListener('focusin',()=>focused=true);
  showreel.addEventListener('focusout',event=>focused=showreel.contains(event.relatedTarget));
  showreel.querySelector('.interface-controls').addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();manual(current+(event.key==='ArrowRight'?1:-1));selectors[current].focus()}
  });
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;playback()}});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting},{threshold:.15}).observe(showreel);
  setInterval(()=>{if(!paused&&!hovered&&!focused&&visible&&!document.hidden&&!reduced.matches)setSlide(current+1)},2000);
  playback();
}

/* Consulting walk-through per project size. Data Center is the real reference case (static markup);
   the other sizes are illustrative scenarios built from AISO test records and are labelled as such. */
const SCENARIOS=[
  {id:"consumer",label:"CONSUMER",title:"Personal<br>Local AI",scale:"1 USER",scaleNote:"Private assistant on one device",
   kpis:[["1","DEVICE"],["32GB","LPDDR5x"],["Q4","GGUF MODELS"],["4","MODELS PREPARED"]],
   stages:[
    ["DEFINE","A private assistant on one device","Chat, document Q&A and light coding, with the data staying on the laptop.","聊天、文件問答與輕量程式輔助，資料留在本機。",["Chat","Documents","Coding"]],
    ["SELECT","Match the model to 32GB","ASUS ROG Flow Z13 or TUF Gaming A14 (Ryzen AI Max+ 395 / 392) running Q4 GGUF models.","依 32GB 記憶體選擇模型與設備。"],
    ["DESIGN","One device, no cluster","llama.cpp with a local web UI; model files stay on the device.","單機、不需要叢集。"],
    ["VERIFY","Quick test, then compare","AI MAX 392 vs 395 reports and quick-test scripts show how each model behaves on this hardware.","用快速測試與 392／395 比較報告確認實際表現。"],
    ["DEPLOY","Install and start","Follow the startup guide: llama.cpp, model files and a launch script.","依啟動指南安裝並啟動。"],
    ["APPLICATION","Daily use","A local chat and document assistant over the device's own files.","本機聊天與文件助理。"]]},
  {id:"mini-workstation",label:"MINI-WORKSTATION",title:"Team AI<br>Workstation",scale:"NP 2–4",scaleNote:"Concurrent requests tested",
   kpis:[["128GB","UNIFIED · AISO1"],["2 × 32GB","ARC PRO B70 VRAM"],["64K","MAX INPUT TESTED"],["NP 2 / 4","CONCURRENCY"]],
   stages:[
    ["DEFINE","A shared assistant for a team","A handful of people on one machine, with long documents and concurrent requests.","數人共用一台機器，處理長文件與併發請求。",["Chat","RAG","Coding"]],
    ["SELECT","AISO1, Intel Arc Pro B70 or AMD ASRock","Choose by model size and memory: 128GB unified memory or 2 × 32GB dedicated GPU memory.","依模型大小與記憶體選擇機型。"],
    ["DESIGN","One box, one inference service","vLLM, SGLang or llama.cpp behind a chat UI on a single machine.","單機單一推論服務。"],
    ["VERIFY","NP2 / NP4, 4K to 64K input","The same model and workload on each machine; TTFT, TPOT and aggregate TPS recorded.","同模型同負載，記錄 TTFT、TPOT 與 Aggregate TPS。"],
    ["DEPLOY","A service with logs","Scripted start-up and fixed ports; results are saved with their conditions.","腳本化啟動，結果連同條件一併保存。"],
    ["APPLICATION","Team chat and knowledge search","Internal knowledge search and a coding assistant for the team.","團隊內部知識搜尋與程式輔助。"]]},
  {id:"server-workstation",label:"SERVER-WORKSTATION",title:"Department-scale<br>Inference",scale:"NP 1–32",scaleNote:"Concurrent requests tested",
   kpis:[["8","GPUs · PRO6000 SYSTEM"],["4","GPUs USED IN TEST"],["120B","GPT-OSS CLASS MODEL"],["1K–16K","INPUT TESTED"]],
   stages:[
    ["DEFINE","Many users, large models","A department-wide service with long context and high concurrency.","部門級服務：長 Context 與高併發。",["Chat","RAG","Agent"]],
    ["SELECT","RTX PRO 6000 class server","2-GPU or 8-GPU PRO6000 systems, or NVIDIA DGX B300 for the heaviest workloads.","依負載選 2 卡、8 卡或 DGX B300。"],
    ["DESIGN","Multi-GPU serving","vLLM across GPUs: decide how many GPUs each model gets and how many users per GPU.","多卡服務：決定每個模型的 GPU 數與使用人數。"],
    ["VERIFY","NP1–32 benchmark","GPT-OSS-120B and Llama-3.3-70B at 1K–16K input, with cold and warm runs.","GPT-OSS-120B 與 Llama-3.3-70B，含冷／熱啟動。"],
    ["DEPLOY","Server, network, endpoint","Install, configure the endpoint and keep logs next to results.","安裝、設定服務端點並保存紀錄。"],
    ["APPLICATION","Shared department assistants","Chat, RAG and agents shared across the department.","部門共用的聊天、RAG 與 Agent。"]]}
];
function scenarioPanel(scenario,index){
  const stage=([name,heading,text,zh,tags],n)=>`<li class="case-stage is-example" data-stage="${name}"><div class="case-stage-rail"><span>0${n+1}</span></div><div class="case-stage-body"><header><strong>${name}</strong><em>EXAMPLE</em></header><h4>${heading}</h4><p>${text}<span class="copy-zh" lang="zh-Hant">${zh}</span></p>${tags?`<div class="case-tags">${tags.map(tag=>`<span>${tag}</span>`).join("")}</div>`:""}</div></li>`;
  return `<aside class="case-flow" data-tier="${scenario.id}" hidden aria-label="Illustrative scenario: ${scenario.label}"><header class="case-flow-head"><small>SCENARIO 0${index+2} · ${scenario.label} · ILLUSTRATIVE</small><h3>${scenario.title}</h3><p class="case-scale"><b>${scenario.scale}</b>${scenario.scaleNote}</p><div class="case-kpis">${scenario.kpis.map(([value,label])=>`<span><b>${value}</b>${label}</span>`).join("")}</div><p class="case-disclaimer">Built from AISO test records and product data. Not a customer project.</p></header><ol>${scenario.stages.map(stage).join("")}</ol></aside>`;
}
(function tierSwitch(){
  const layout=document.querySelector(".consult-layout");if(!layout)return;
  const dataCenter=layout.querySelector('.case-flow[data-tier="data-center"]');
  SCENARIOS.forEach((scenario,index)=>dataCenter.insertAdjacentHTML("beforebegin",scenarioPanel(scenario,index)));
  window.selectTier=id=>{
    layout.querySelectorAll(".case-flow[data-tier]").forEach(panel=>{panel.hidden=panel.dataset.tier!==id});
    document.querySelectorAll("[data-tier-tab]").forEach(tab=>tab.setAttribute("aria-selected",String(tab.dataset.tierTab===id)));
  };
  document.querySelectorAll("[data-tier-tab]").forEach(tab=>tab.onclick=()=>selectTier(tab.dataset.tierTab));
})();

const consultLayout=document.querySelector(".consult-layout");
if(consultLayout){
  const link=name=>{
    consultLayout.classList.toggle("is-linked",Boolean(name));
    consultLayout.querySelectorAll(".case-stage").forEach(stage=>stage.classList.toggle("is-active",stage.dataset.stage===name));
  };
  consultLayout.querySelectorAll(".consulting-flow-six>span").forEach(step=>{
    const name=step.querySelector("strong")?.textContent?.trim();
    step.addEventListener("mouseenter",()=>link(name));step.addEventListener("focus",()=>link(name));
    step.addEventListener("mouseleave",()=>link(null));step.addEventListener("blur",()=>link(null));
  });
}

const appDeck=document.querySelector("[data-app-deck]");
if(appDeck){
  const setAppOpen=(button,open)=>{
    const panel=$(button.getAttribute("aria-controls"));if(!panel)return;
    button.setAttribute("aria-expanded",String(open));panel.hidden=!open;appDeck.classList.toggle("has-open-app",open);
    if(open)requestAnimationFrame(()=>panel.scrollIntoView({behavior:"smooth",block:"start"}));
  };
  appDeck.querySelectorAll("[data-app-open]").forEach(button=>button.onclick=()=>setAppOpen(button,button.getAttribute("aria-expanded")!=="true"));
  const phoneDeck=matchMedia("(max-width: 760px)");
  if(phoneDeck.matches){
    appDeck.classList.add("is-collapsible");
    const setDeckExpanded=open=>{
      if(open||appDeck.classList.contains("has-open-app")){appDeck.classList.add("is-expanded");return}
      if(!appDeck.classList.contains("is-expanded"))return;
      if(appDeck.getBoundingClientRect().bottom>=0){appDeck.classList.remove("is-expanded");return}
      const anchor=appDeck.closest("section")?.nextElementSibling,before=anchor?.getBoundingClientRect().top;
      appDeck.classList.add("no-anim");appDeck.classList.remove("is-expanded");
      if(anchor&&appDeck.getBoundingClientRect().bottom<0){const drift=anchor.getBoundingClientRect().top-before;if(drift)window.scrollBy(0,drift)}
      requestAnimationFrame(()=>requestAnimationFrame(()=>appDeck.classList.remove("no-anim")));
    };
    const hub=appDeck.querySelector(".app-hub");let ticking=false,manual=false;
    const syncDeck=()=>{
      ticking=false;
      const vh=window.innerHeight,hubTop=hub.getBoundingClientRect().top,deckTop=appDeck.getBoundingClientRect().top,deckBottom=appDeck.getBoundingClientRect().bottom,open=appDeck.classList.contains("is-expanded");
      if(manual){if(deckBottom<0||deckTop>vh)manual=false;else return}
      if(!open&&hubTop<vh*.8&&deckBottom>0)setDeckExpanded(true);
      else if(open&&(hubTop>vh*.92||deckBottom<0))setDeckExpanded(false);
    };
    window.addEventListener("scroll",()=>{if(!ticking){ticking=true;requestAnimationFrame(syncDeck)}},{passive:true});
    hub.addEventListener("click",()=>{manual=true;if(appDeck.classList.contains("is-expanded")&&!appDeck.classList.contains("has-open-app"))appDeck.classList.remove("is-expanded");else setDeckExpanded(true)});
    syncDeck();
  }else{
    const hubDesk=appDeck.querySelector(".app-hub");let tickDesk=false;
    const syncDesk=()=>{
      tickDesk=false;
      const vh=window.innerHeight,hubTop=hubDesk.getBoundingClientRect().top,deckBottom=appDeck.getBoundingClientRect().bottom,open=appDeck.classList.contains("is-expanded");
      if(!open&&hubTop<vh*.75&&deckBottom>0)appDeck.classList.add("is-expanded");
      else if(open&&!appDeck.classList.contains("has-open-app")&&(hubTop>vh*.98||deckBottom<0))appDeck.classList.remove("is-expanded");
    };
    window.addEventListener("scroll",()=>{if(!tickDesk){tickDesk=true;requestAnimationFrame(syncDesk)}},{passive:true});
    syncDesk();
  }
  document.querySelectorAll("[data-app-close]").forEach(close=>close.onclick=()=>{
    const button=appDeck.querySelector("[data-app-open][aria-expanded=true]");
    if(button){setAppOpen(button,false);appDeck.scrollIntoView({behavior:"smooth",block:"center"});button.focus({preventScroll:true})}
  });
}

let searchTimer;$("globalSearch").addEventListener("input",event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>runSearch(event.target.value),220)});
init().then(routeHash).catch(error=>{$("categoryGrid").innerHTML=`<div class="note">AISO Platform Load failed：${esc(error.message)}</div>`;$("modeBadge").textContent="Load failed"});

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

// Unified benchmark: static visitors can configure/export; execution is local-only.
